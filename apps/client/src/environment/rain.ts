import type { Camera } from "@babylonjs/core/Cameras/camera"
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo"
import { Constants } from "@babylonjs/core/Engines/constants"
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import type { Light } from "@babylonjs/core/Lights/light"
import { PointLight } from "@babylonjs/core/Lights/pointLight"
import { SpotLight } from "@babylonjs/core/Lights/spotLight"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { Scene } from "@babylonjs/core/scene"

/**
 * Rain as a camera sees it (Garg and Nayar, "Vision and Rain"): a drop crosses a pixel in a fraction of a frame's
 * exposure, so it shows as a faint, thin streak, brighter than what's behind it and plain only against the dark or lit
 * from behind. Two parts, both moved on the GPU with nothing done per drop on the CPU:
 *
 * - **Streaks** round the camera: a fixed set of drops in a box `box` metres across centred on it, each a thin quad
 *   facing the camera, as long as the drop falls in `exposure` and as wide as the drop, drawn at least `leastPixels`
 *   wide with its opacity cut by how little of that it covers. A drop's place is its seed moved on by the fall and the
 *   wind, wrapped into the box round the camera, so drops leaving one side come back in at the other and none are born
 *   or die (Rousseau and others, "GPU Rainfall"). As many are drawn as the rain's rate asks for.
 * - **Sheets** for the rain beyond: two cylinders round the camera, at `radius` metres, each a texture of fine streaks
 *   scrolling down at a drop's speed and leaning with the wind (Crysis 3, Remember Me), drawn together in one pass and
 *   faded out where they meet the ground. From the field view high over the ground the streaks round the camera are a
 *   few metres of air; the sheets are what reads as rain.
 *
 * Both are lit by the air's light (the haze's colour, which follows the sun, the moon and the cloud), flash with
 * lightning, and glow when lit from behind, by the sun or a flare.
 */
const STREAKS = {
  box: 20,
  capacity: 32_768,
  /** Drops in the box in rain of 1 mm an hour; more in heavier rain, though not in proportion. */
  perMillimetre: 8000,
  /** A 2 mm drop's speed, in m/s; each drop falls at 6 to 10 eighths of it. */
  speed: 6.5,
  /** The exposure a streak is drawn for, in seconds: 10 to 20 cm for a 2 mm drop. */
  exposure: 1 / 40,
  /** A drop's width, in metres. */
  width: 0.0015,
  leastPixels: 1.5,
  /** A drop's opacity where it covers all of a pixel. */
  opacity: 0.22,
  /** Drops nearer the camera than this, in metres, fade out: out of focus, and too big. */
  nearest: 0.5
} as const
const SHEETS = {
  layers: [
    { radius: 14, tileWidth: 2.4, tileHeight: 4.8, opacity: 0.12 },
    { radius: 30, tileWidth: 4.8, tileHeight: 9.6, opacity: 0.1 }
  ],
  /**
   * Where a sheet meets the ground it fades out, over this share of its distance from the camera, read from the depth
   * map the depth of field draws (see level/post-process.ts), so no hard line shows where it goes into the earth.
   */
  soft: 0.3,
  /**
   * How far below and above the camera they reach, in metres, and how far below their top they fade in. They lean
   * with the wind, as the rain falls, at most `lean` metres downwind for each metre down.
   */
  lean: 0.7,
  below: 160,
  above: 40,
  fade: 25,
  /** The cylinder's segments round, and rings from bottom to top, between which its lighting is interpolated. */
  segments: 48,
  rings: 12,
  /** The texture: columns, rows, and streaks in each of its two channels. */
  texture: { columns: 128, rows: 256, streaks: 220 }
} as const
/** The fall is wrapped at this many metres, a whole number of every layer's tiles, before it loses precision. */
const SHEET_PERIOD = 9.6
/** Each drop falls at a whole number of eighths of the speed, so the fall wraps seamlessly at eight boxes. */
const FALL_PERIOD = STREAKS.box * 8
/** How brightly a drop shows the light behind it: the sun's, and a flare's. */
const BACKLIT = { sun: 0.5, flare: 0.35 } as const

/** Drops falling in the box round the camera for a rain rate in mm an hour. */
export function rainDrops(millimetresPerHour: number): number {
  if (millimetresPerHour <= 0.02) {
    return 0
  }
  return Math.min(STREAKS.capacity, Math.round(STREAKS.perMillimetre * millimetresPerHour ** 0.6))
}

/**
 * A streak's width as drawn at a distance, given a pixel's size one metre from the camera, and how much of that width
 * the drop covers: its opacity is cut by as much, so a far drop drawn a pixel wide is as faint as it would be.
 */
export function streakWidth(distance: number, pixelSize: number): { width: number; coverage: number } {
  const width = Math.max(STREAKS.width, distance * pixelSize * STREAKS.leastPixels)
  return { width, coverage: STREAKS.width / width }
}

/** Where a seed lies once wrapped into a box `box` across centred on `centre`, along one axis. */
export function wrapped(seed: number, centre: number, box: number): number {
  const along = (seed - centre) / box
  return centre + (along - Math.floor(along) - 0.5) * box
}

/** The rain's motion so far: how far it has fallen and drifted, each wrapped at a period of its own. */
export interface RainMotion {
  fallen: number
  driftX: number
  driftZ: number
  sheetFallen: number
}

/** Moves the rain on by `seconds` in a wind of (x, z) m/s, wrapping each distance where the pattern repeats. */
export function advanceRain(motion: RainMotion, seconds: number, windX: number, windZ: number): void {
  motion.fallen = (motion.fallen + STREAKS.speed * seconds) % FALL_PERIOD
  motion.sheetFallen = (motion.sheetFallen + STREAKS.speed * seconds) % SHEET_PERIOD
  motion.driftX = (((motion.driftX + windX * seconds) % STREAKS.box) + STREAKS.box) % STREAKS.box
  motion.driftZ = (((motion.driftZ + windZ * seconds) % STREAKS.box) + STREAKS.box) % STREAKS.box
}

/** The lighting both parts share: `rainLit(world, view)`, the light a drop at `world` seen along `view` sends. */
const LIGHT_UNIFORMS = ["rainLight", "rainSun", "rainSunColor", "rainFlare", "rainFlareColor"] as const

const LIGHT_GLSL = `
uniform vec4 rainLight;
uniform vec4 rainSun;
uniform vec4 rainSunColor;
uniform vec4 rainFlare;
uniform vec4 rainFlareColor;
vec3 rainLit(vec3 world, vec3 view) {
  float sunBehind = pow(max(dot(view, rainSun.xyz), 0.0), 6.0);
  vec3 toFlare = rainFlare.xyz - world;
  float flareNear = clamp(1.0 - length(toFlare) / rainFlare.w, 0.0, 1.0);
  float flareBehind = pow(max(dot(view, toFlare / max(length(toFlare), 1e-3)), 0.0), 4.0);
  return rainLight.rgb + rainSunColor.rgb * sunBehind + rainFlareColor.rgb * flareNear * flareNear * (0.25 + flareBehind);
}
`
const LIGHT_WGSL = `
uniform rainLight: vec4f;
uniform rainSun: vec4f;
uniform rainSunColor: vec4f;
uniform rainFlare: vec4f;
uniform rainFlareColor: vec4f;
fn rainLit(world: vec3f, view: vec3f) -> vec3f {
  let sunBehind: f32 = pow(max(dot(view, uniforms.rainSun.xyz), 0.0), 6.0);
  let toFlare: vec3f = uniforms.rainFlare.xyz - world;
  let flareNear: f32 = clamp(1.0 - length(toFlare) / uniforms.rainFlare.w, 0.0, 1.0);
  let flareBehind: f32 = pow(max(dot(view, toFlare / max(length(toFlare), 1e-3)), 0.0), 4.0);
  return uniforms.rainLight.rgb + uniforms.rainSunColor.rgb * sunBehind + uniforms.rainFlareColor.rgb * flareNear * flareNear * (0.25 + flareBehind);
}
`

const STREAK_GLSL = {
  vertex: `precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec2 uv2;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform vec4 rainMotion;
uniform vec4 rainShape;
uniform vec4 rainWind;
${LIGHT_GLSL}
varying vec4 vColor;
varying vec2 vCorner;
void main(void) {
  float box = rainMotion.w;
  float pace = (6.0 + floor(uv2.y * 4.999)) / 8.0;
  vec3 moved = position * box + vec3(rainMotion.y, -rainMotion.x * pace, rainMotion.z);
  vec3 head = cameraPosition + (fract((moved - cameraPosition) / box) - 0.5) * box;
  vec3 velocity = vec3(rainWind.x, -rainShape.y * pace, rainWind.y);
  float speed = length(velocity);
  vec3 along = velocity / speed;
  vec3 toEye = cameraPosition - head;
  float dist = max(length(toEye), 1e-3);
  vec3 side = cross(along, toEye);
  side = side / max(length(side), 1e-6);
  float wide = max(rainWind.z, dist * rainShape.w);
  vec3 world = head - along * (speed * rainShape.z * uv.y) + side * (0.5 * wide * uv.x);
  float shown = step(uv2.x, rainShape.x);
  float fade = smoothstep(rainWind.w, rainWind.w * 3.0, dist) * (1.0 - smoothstep(0.3 * box, 0.5 * box, dist));
  vColor = vec4(rainLit(head, -toEye / dist), rainLight.w * (rainWind.z / wide) * fade);
  vCorner = uv;
  gl_Position = shown > 0.5 ? viewProjection * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`,
  fragment: `precision highp float;
varying vec4 vColor;
varying vec2 vCorner;
void main(void) {
  float across = 1.0 - vCorner.x * vCorner.x;
  float along = smoothstep(0.0, 0.25, vCorner.y) * (1.0 - smoothstep(0.6, 1.0, vCorner.y));
  gl_FragColor = vec4(vColor.rgb, min(1.0, vColor.a * across * along * 1.6));
}
`
}

const STREAK_WGSL = {
  vertex: `attribute position: vec3f;
attribute uv: vec2f;
attribute uv2: vec2f;
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform rainMotion: vec4f;
uniform rainShape: vec4f;
uniform rainWind: vec4f;
${LIGHT_WGSL}
varying vColor: vec4f;
varying vCorner: vec2f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let box: f32 = uniforms.rainMotion.w;
  let pace: f32 = (6.0 + floor(vertexInputs.uv2.y * 4.999)) / 8.0;
  let moved: vec3f = vertexInputs.position * box + vec3f(uniforms.rainMotion.y, -uniforms.rainMotion.x * pace, uniforms.rainMotion.z);
  let head: vec3f = uniforms.cameraPosition + (fract((moved - uniforms.cameraPosition) / box) - 0.5) * box;
  let velocity: vec3f = vec3f(uniforms.rainWind.x, -uniforms.rainShape.y * pace, uniforms.rainWind.y);
  let speed: f32 = length(velocity);
  let along: vec3f = velocity / speed;
  let toEye: vec3f = uniforms.cameraPosition - head;
  let dist: f32 = max(length(toEye), 1e-3);
  var side: vec3f = cross(along, toEye);
  side = side / max(length(side), 1e-6);
  let wide: f32 = max(uniforms.rainWind.z, dist * uniforms.rainShape.w);
  let world: vec3f = head - along * (speed * uniforms.rainShape.z * vertexInputs.uv.y) + side * (0.5 * wide * vertexInputs.uv.x);
  let shown: f32 = step(vertexInputs.uv2.x, uniforms.rainShape.x);
  let fade: f32 = smoothstep(uniforms.rainWind.w, uniforms.rainWind.w * 3.0, dist) * (1.0 - smoothstep(0.3 * box, 0.5 * box, dist));
  vertexOutputs.vColor = vec4f(rainLit(head, -toEye / dist), uniforms.rainLight.w * (uniforms.rainWind.z / wide) * fade);
  vertexOutputs.vCorner = vertexInputs.uv;
  vertexOutputs.position = select(vec4f(2.0, 2.0, 2.0, 1.0), uniforms.viewProjection * vec4f(world, 1.0), shown > 0.5);
}
`,
  fragment: `varying vColor: vec4f;
varying vCorner: vec2f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let across: f32 = 1.0 - fragmentInputs.vCorner.x * fragmentInputs.vCorner.x;
  let along: f32 = smoothstep(0.0, 0.25, fragmentInputs.vCorner.y) * (1.0 - smoothstep(0.6, 1.0, fragmentInputs.vCorner.y));
  fragmentOutputs.color = vec4f(fragmentInputs.vColor.rgb, min(1.0, fragmentInputs.vColor.a * across * along * 1.6));
}
`
}

/**
 * Both sheets are drawn from one cylinder, the near one's: they're centred on the camera, so a ray from the camera
 * reaches the far one at `sheetMotion.w` times the distance, and at that times the height. The fragment shader reads each
 * layer's streaks and fades each into the ground at its own distance; the near cylinder's depth test hides both behind
 * whatever stands nearer.
 */
const SHEET_GLSL = {
  vertex: `precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform vec4 sheetMotion;
uniform vec4 sheetDepth;
${LIGHT_GLSL}
varying vec3 vSheet;
varying vec3 vColor;
void main(void) {
  vec3 offset = position - vec3(sheetMotion.y, 0.0, sheetMotion.z) * position.y;
  gl_Position = viewProjection * vec4(cameraPosition + offset, 1.0);
  vSheet = vec3(uv.x, position.y, (gl_Position.z + sheetDepth.x) / sheetDepth.y);
  vColor = rainLit(cameraPosition + offset, normalize(offset));
}
`,
  fragment: `precision highp float;
uniform vec3 cameraPosition;
uniform vec4 sheetMotion;
uniform vec4 sheetTiles;
uniform vec4 sheetLook;
uniform vec4 sheetDepth;
uniform sampler2D sheetStreaks;
uniform sampler2D sheetGround;
varying vec3 vSheet;
varying vec3 vColor;
float sheetShows(float height, float depth, float ground) {
  float soft = clamp((ground - depth) / (depth * ${SHEETS.soft.toFixed(2)}), 0.0, 1.0);
  return soft * (1.0 - smoothstep(sheetLook.z - sheetLook.w, sheetLook.z, height));
}
void main(void) {
  float farHeight = vSheet.y * sheetMotion.w;
  float near = texture2D(sheetStreaks, vec2(vSheet.x * sheetTiles.x, (vSheet.y + cameraPosition.y + sheetMotion.x) / sheetTiles.y)).r * sheetLook.x;
  float far = texture2D(sheetStreaks, vec2(vSheet.x * sheetTiles.z, (farHeight + cameraPosition.y + sheetMotion.x) / sheetTiles.w)).g * sheetLook.y;
  // Most of a sheet is the empty air between streaks: drawing nothing there saves reading the depth map and blending.
  if (near + far < 0.006) {
    discard;
  }
  float ground = texture2D(sheetGround, gl_FragCoord.xy * sheetDepth.zw).r;
  gl_FragColor = vec4(vColor, near * sheetShows(vSheet.y, vSheet.z, ground) + far * sheetShows(farHeight, vSheet.z * sheetMotion.w, ground));
}
`
}

const SHEET_WGSL = {
  vertex: `attribute position: vec3f;
attribute uv: vec2f;
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform sheetMotion: vec4f;
uniform sheetDepth: vec4f;
${LIGHT_WGSL}
varying vSheet: vec3f;
varying vColor: vec3f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let offset: vec3f = vertexInputs.position - vec3f(uniforms.sheetMotion.y, 0.0, uniforms.sheetMotion.z) * vertexInputs.position.y;
  vertexOutputs.position = uniforms.viewProjection * vec4f(uniforms.cameraPosition + offset, 1.0);
  vertexOutputs.vSheet = vec3f(vertexInputs.uv.x, vertexInputs.position.y, (vertexOutputs.position.z + uniforms.sheetDepth.x) / uniforms.sheetDepth.y);
  vertexOutputs.vColor = rainLit(uniforms.cameraPosition + offset, normalize(offset));
}
`,
  fragment: `uniform cameraPosition: vec3f;
uniform sheetMotion: vec4f;
uniform sheetTiles: vec4f;
uniform sheetLook: vec4f;
uniform sheetDepth: vec4f;
var sheetStreaks: texture_2d<f32>;
var sheetStreaksSampler: sampler;
var sheetGround: texture_2d<f32>;
var sheetGroundSampler: sampler;
varying vSheet: vec3f;
varying vColor: vec3f;
fn sheetShows(height: f32, depth: f32, ground: f32) -> f32 {
  let soft: f32 = clamp((ground - depth) / (depth * ${SHEETS.soft.toFixed(2)}), 0.0, 1.0);
  return soft * (1.0 - smoothstep(uniforms.sheetLook.z - uniforms.sheetLook.w, uniforms.sheetLook.z, height));
}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let farHeight: f32 = fragmentInputs.vSheet.y * uniforms.sheetMotion.w;
  let near: f32 = textureSample(sheetStreaks, sheetStreaksSampler, vec2f(fragmentInputs.vSheet.x * uniforms.sheetTiles.x, (fragmentInputs.vSheet.y + uniforms.cameraPosition.y + uniforms.sheetMotion.x) / uniforms.sheetTiles.y)).r * uniforms.sheetLook.x;
  let far: f32 = textureSample(sheetStreaks, sheetStreaksSampler, vec2f(fragmentInputs.vSheet.x * uniforms.sheetTiles.z, (farHeight + uniforms.cameraPosition.y + uniforms.sheetMotion.x) / uniforms.sheetTiles.w)).g * uniforms.sheetLook.y;
  if (near + far < 0.006) {
    discard;
  }
  let ground: f32 = textureSampleLevel(sheetGround, sheetGroundSampler, fragmentInputs.position.xy * uniforms.sheetDepth.zw, 0.0).r;
  fragmentOutputs.color = vec4f(fragmentInputs.vColor, near * sheetShows(fragmentInputs.vSheet.y, fragmentInputs.vSheet.z, ground) + far * sheetShows(farHeight, fragmentInputs.vSheet.z * uniforms.sheetMotion.w, ground));
}
`
}

/** Tiles of a sheet's texture round its cylinder: a whole number, so the texture's seam can't show. */
function tilesRound({ radius, tileWidth }: { readonly radius: number; readonly tileWidth: number }): number {
  return Math.max(1, Math.round((2 * Math.PI * radius) / tileWidth))
}

/** Puts a shader's code in Babylon's stores, both languages, under `name`. */
function storeShader(
  name: string,
  glsl: { vertex: string; fragment: string },
  wgsl: { vertex: string; fragment: string }
): void {
  ShaderStore.ShadersStore[`${name}VertexShader`] = glsl.vertex
  ShaderStore.ShadersStore[`${name}PixelShader`] = glsl.fragment
  ShaderStore.ShadersStoreWGSL[`${name}VertexShader`] = wgsl.vertex
  ShaderStore.ShadersStoreWGSL[`${name}PixelShader`] = wgsl.fragment
}

/** A see-through material drawing a shader from the stores in the engine's own language, over everything, unlit. */
function rainMaterial(
  scene: Scene,
  name: string,
  attributes: string[],
  uniforms: string[],
  samplers: string[] = []
): ShaderMaterial {
  const material = new ShaderMaterial(
    name,
    scene,
    { vertex: name, fragment: name },
    {
      attributes,
      uniforms: ["viewProjection", "cameraPosition", ...uniforms, ...LIGHT_UNIFORMS],
      samplers,
      needAlphaBlending: true,
      shaderLanguage: scene.getEngine().isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL
    }
  )
  material.alphaMode = Constants.ALPHA_COMBINE
  material.backFaceCulling = false
  material.disableDepthWrite = true
  return material
}

/** A small seeded generator, so the rain falls the same way every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * A mesh the rain draws itself in, never picked or culled. It's kept at the camera, its bounds a point `ahead` metres
 * above it, only so it sorts among the see-through as near the camera: drawn after, and so over, what lies beyond.
 */
function rainMesh(scene: Scene, name: string, data: VertexData, material: ShaderMaterial, ahead: number): Mesh {
  const mesh = new Mesh(name, scene)
  data.applyToMesh(mesh)
  mesh.material = material
  mesh.isPickable = false
  mesh.alwaysSelectAsActiveMesh = true
  mesh.setBoundingInfo(new BoundingInfo(new Vector3(0, ahead, 0), new Vector3(0, ahead, 0)))
  mesh.setEnabled(false)
  return mesh
}

/** Every drop a quad: its seed as the position, its corner as uv, and its rank and size as uv2. */
function streakData(): VertexData {
  const random = seeded(1916)
  const { capacity } = STREAKS
  const positions = new Float32Array(capacity * 12)
  const uvs = new Float32Array(capacity * 8)
  const uvs2 = new Float32Array(capacity * 8)
  const indices = new Uint32Array(capacity * 6)
  for (let drop = 0; drop < capacity; drop++) {
    const seed = [random(), random(), random()] as const
    // Drops are shown in order, the first share of them: their seeds are random, so any share is spread evenly.
    const rank = (drop + 0.5) / capacity
    const size = random()
    const corners = [-1, 0, 1, 0, 1, 1, -1, 1] as const
    for (let corner = 0; corner < 4; corner++) {
      positions.set(seed, (drop * 4 + corner) * 3)
      uvs.set([corners[corner * 2] ?? 0, corners[corner * 2 + 1] ?? 0], (drop * 4 + corner) * 2)
      uvs2.set([rank, size], (drop * 4 + corner) * 2)
    }
    const first = drop * 4
    indices.set([first, first + 1, first + 2, first, first + 2, first + 3], drop * 6)
  }
  const data = new VertexData()
  data.positions = positions
  data.uvs = uvs
  data.uvs2 = uvs2
  data.indices = indices
  return data
}

/** The sheets' cylinder, the near one's, round the camera in rings: uv's x is the way round it, from 0 to 1. */
function sheetData(): VertexData {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const { radius } = SHEETS.layers[0]
  for (let segment = 0; segment <= SHEETS.segments; segment++) {
    const angle = (segment / SHEETS.segments) * 2 * Math.PI
    for (let ring = 0; ring <= SHEETS.rings; ring++) {
      const height = -SHEETS.below + ((SHEETS.below + SHEETS.above) * ring) / SHEETS.rings
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius)
      uvs.push(segment / SHEETS.segments, 0)
    }
  }
  const column = SHEETS.rings + 1
  for (let segment = 0; segment < SHEETS.segments; segment++) {
    for (let ring = 0; ring < SHEETS.rings; ring++) {
      const corner = segment * column + ring
      indices.push(corner, corner + 1, corner + column + 1, corner, corner + column + 1, corner + column)
    }
  }
  const data = new VertexData()
  data.positions = positions
  data.uvs = uvs
  data.indices = indices
  return data
}

/**
 * The sheets' texture: fine streaks, a texel wide and 12 to 40 long, most of them faint, brightest along their middle,
 * in two channels with streaks of their own, one for each layer. It tiles, and is mipmapped so far and grazing sheets
 * fade to a haze.
 */
function sheetTexture(scene: Scene): RawTexture {
  const { columns, rows, streaks } = SHEETS.texture
  const random = seeded(1917)
  const pixels = new Uint8Array(columns * rows * 4)
  for (let channel = 0; channel < 2; channel++) {
    for (let streak = 0; streak < streaks; streak++) {
      const column = Math.floor(random() * columns)
      const start = Math.floor(random() * rows)
      const length = 12 + Math.floor(random() * 28)
      const brightness = 0.15 + 0.85 * random() ** 2
      for (let step = 0; step < length; step++) {
        const row = (start + step) % rows
        const along = Math.sin(((step + 0.5) / length) * Math.PI)
        const index = (row * columns + column) * 4 + channel
        pixels[index] = Math.min(255, (pixels[index] ?? 0) + Math.round(255 * brightness * along))
      }
    }
  }
  const texture = new RawTexture(
    pixels,
    columns,
    rows,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE
  )
  texture.name = "rain-sheets"
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  return texture
}

const isSun = (light: Light): light is DirectionalLight => light instanceof DirectionalLight
const isSky = (light: Light): light is HemisphericLight => light instanceof HemisphericLight
const isLamp = (light: Light): light is PointLight | SpotLight =>
  light instanceof PointLight || light instanceof SpotLight

export interface Rain {
  /** The drops falling round the camera, and the sheets of rain beyond them. */
  readonly streaks: Mesh
  readonly sheets: Mesh
  /** Drops falling in the box round the camera now. */
  readonly drops: number
  /** The wind the rain is blowing in, in m/s: it slants the streaks and drifts them. */
  readonly wind: { readonly x: number; readonly z: number }
  /** Sets how hard it rains, in mm an hour, and the wind (m/s). Call once a frame, after the daylight has lit the scene. */
  fall(millimetresPerHour: number, windX: number, windZ: number): void
  dispose(): void
}

/** Rain on the GPU round the camera, as fine streaks near it and sheets of rain beyond (see `STREAKS` and `SHEETS`). */
export function createRain(scene: Scene): Rain {
  storeShader("rainStreaks", STREAK_GLSL, STREAK_WGSL)
  storeShader("rainSheets", SHEET_GLSL, SHEET_WGSL)
  const streakMaterial = rainMaterial(
    scene,
    "rainStreaks",
    ["position", "uv", "uv2"],
    ["rainMotion", "rainShape", "rainWind"]
  )
  const sheetMaterial = rainMaterial(
    scene,
    "rainSheets",
    ["position", "uv"],
    ["sheetMotion", "sheetTiles", "sheetLook", "sheetDepth"],
    ["sheetStreaks", "sheetGround"]
  )
  const texture = sheetTexture(scene)
  sheetMaterial.setTexture("sheetStreaks", texture)
  // Without the depth of field's depth map, the ground reads as far off everywhere, and the sheets as never meeting it.
  const farGround = new RawTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE
  )
  let ground: BaseTexture = farGround
  sheetMaterial.setTexture("sheetGround", ground)
  // The sheets sort a metre further off than the streaks, so the streaks are drawn over them.
  const streaks = rainMesh(scene, "rain-streaks", streakData(), streakMaterial, 0)
  const sheets = rainMesh(scene, "rain-sheets", sheetData(), sheetMaterial, 1)

  const motion: RainMotion = { fallen: 0, driftX: 0, driftZ: 0, sheetFallen: 0 }
  const wind = { x: 0, z: 0 }
  let drops = 0
  // The sky light's intensity as the daylight set it this frame: lightning adds to it after, which the rain shows.
  let skyLit = 1
  const uniforms = {
    rainMotion: new Vector4(0, 0, 0, STREAKS.box),
    rainShape: new Vector4(0, STREAKS.speed, STREAKS.exposure, 0),
    rainWind: new Vector4(0, 0, STREAKS.width, STREAKS.nearest),
    sheetMotion: new Vector4(0, 0, 0, SHEETS.layers[1].radius / SHEETS.layers[0].radius),
    sheetTiles: new Vector4(
      tilesRound(SHEETS.layers[0]),
      SHEETS.layers[0].tileHeight,
      tilesRound(SHEETS.layers[1]),
      SHEETS.layers[1].tileHeight
    ),
    sheetLook: new Vector4(0, 0, SHEETS.above, SHEETS.fade),
    sheetDepth: new Vector4(0, 1, 1, 1),
    rainLight: new Vector4(0, 0, 0, 0),
    rainSun: new Vector4(0, 1, 0, 0),
    rainSunColor: new Vector4(0, 0, 0, 0),
    rainFlare: new Vector4(0, 0, 0, 1),
    rainFlareColor: new Vector4(0, 0, 0, 0)
  }
  for (const [name, value] of Object.entries(uniforms)) {
    for (const material of [streakMaterial, sheetMaterial]) {
      material.setVector4(name, value)
    }
  }
  const toSun = new Vector3()
  let lastDrawn = performance.now()
  /** Lights the rain as the scene is lit now, lightning and flares included, and moves it on. */
  const beforeRender = (camera: Camera) => {
    // By the clock between the frames drawn: a frame-rate cap skips frames the engine's own delta would count.
    const now = performance.now()
    const seconds = Math.min(0.1, (now - lastDrawn) / 1000)
    lastDrawn = now
    advanceRain(motion, seconds, wind.x, wind.z)
    uniforms.rainMotion.set(motion.fallen, motion.driftX, motion.driftZ, STREAKS.box)
    uniforms.sheetMotion.x = motion.sheetFallen
    // The depth map's measure of depth, as Babylon's depth renderer writes it (see level/soft-particles.ts).
    const engine = scene.getEngine()
    const near = engine.isNDCHalfZRange ? 0 : camera.minZ
    uniforms.sheetDepth.set(near, near + camera.maxZ, 1 / engine.getRenderWidth(), 1 / engine.getRenderHeight())
    const depthMap = scene._depthRenderer?.[camera.uniqueId]?.getDepthMap() ?? farGround
    if (depthMap !== ground) {
      ground = depthMap
      sheetMaterial.setTexture("sheetGround", ground)
    }
    // Sorted among the see-through by their place: at the camera, they're drawn over what lies beyond.
    streaks.position.copyFrom(camera.globalPosition)
    sheets.position.copyFrom(camera.globalPosition)
    // The drops show the air's light, brighter in a lightning flash.
    const sky = scene.lights.find(isSky)
    const flash = sky ? Math.max(0, sky.intensity / Math.max(skyLit, 1e-3) - 1) : 0
    const fog = scene.fogColor
    const lit = 1 + 1.5 * flash
    uniforms.rainLight.set(fog.r * lit, fog.g * lit, fog.b * lit, STREAKS.opacity)
    // Lit from behind by the sun, through thin cloud.
    const sun = scene.lights.find(isSun)
    if (sun?.isEnabled()) {
      sun.direction.scaleToRef(-1, toSun).normalize()
      uniforms.rainSun.set(toSun.x, toSun.y, toSun.z, 0)
      const strength = sun.intensity * BACKLIT.sun
      uniforms.rainSunColor.set(sun.diffuse.r * strength, sun.diffuse.g * strength, sun.diffuse.b * strength, 0)
    } else {
      uniforms.rainSunColor.set(0, 0, 0, 0)
    }
    // And by the flare that lights the air round the camera most, if any burns.
    let flare: PointLight | SpotLight | null = null
    let most = 0
    for (const light of scene.lights) {
      if (!isLamp(light) || !light.isEnabled() || light.intensity <= 0) {
        continue
      }
      const near = 1 - Vector3.Distance(light.position, camera.globalPosition) / Math.max(light.range, 1)
      if (near * light.intensity > most) {
        most = near * light.intensity
        flare = light
      }
    }
    if (flare) {
      const { position, range, intensity, diffuse } = flare
      uniforms.rainFlare.set(position.x, position.y, position.z, Math.max(range, 1))
      const strength = intensity * BACKLIT.flare
      uniforms.rainFlareColor.set(diffuse.r * strength, diffuse.g * strength, diffuse.b * strength, 0)
    } else {
      uniforms.rainFlareColor.set(0, 0, 0, 0)
    }
  }
  const observer = scene.onBeforeRenderObservable.add(() => {
    const camera = scene.activeCamera
    if (camera && drops > 0) {
      beforeRender(camera)
    }
  })

  return {
    streaks,
    sheets,
    get drops() {
      return drops
    },
    wind,
    fall(millimetresPerHour, windX, windZ) {
      drops = rainDrops(millimetresPerHour)
      wind.x = windX
      wind.z = windZ
      skyLit = scene.lights.find(isSky)?.intensity ?? 1
      const share = drops / STREAKS.capacity
      uniforms.rainShape.set(share, STREAKS.speed, STREAKS.exposure, leastWidthPerMetre(scene))
      uniforms.rainWind.x = windX
      uniforms.rainWind.y = windZ
      // The sheets lean along the rain's fall, metres downwind for each metre down, no further than `SHEETS.lean`.
      const lean = Math.min(1, SHEETS.lean / Math.max(1e-6, Math.hypot(windX, windZ) / STREAKS.speed))
      uniforms.sheetMotion.y = (windX / STREAKS.speed) * lean
      uniforms.sheetMotion.z = (windZ / STREAKS.speed) * lean
      uniforms.sheetLook.x = SHEETS.layers[0].opacity * share ** 0.8
      uniforms.sheetLook.y = SHEETS.layers[1].opacity * share ** 0.8
      if (streaks.isEnabled(false) !== drops > 0) {
        streaks.setEnabled(drops > 0)
        sheets.setEnabled(drops > 0)
      }
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      streaks.dispose()
      sheets.dispose()
      streakMaterial.dispose()
      sheetMaterial.dispose()
      texture.dispose()
      farGround.dispose()
    }
  }
}

/** The least width a streak is drawn, in metres for each metre from the camera: `leastPixels` of the screen's pixels. */
function leastWidthPerMetre(scene: Scene): number {
  const height = scene.getEngine().getRenderHeight() || 720
  const fov = scene.activeCamera?.fov ?? 0.8
  return ((2 * Math.tan(fov / 2)) / height) * STREAKS.leastPixels
}
