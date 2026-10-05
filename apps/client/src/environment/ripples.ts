/**
 * Raindrops ringing standing water, after Sébastien Lagarde's rain in Remember Me: each drop's ring spreads from where
 * it struck as a damped wave, fading as it grows and as it ages. The water is cut into cells half a metre across, one
 * drop to a cell in each layer, struck at a random spot and a random moment of the layer's cycle; four layers lie over
 * one another, offset so their cells don't line up, and switch on one by one with each quarter of the rain's intensity,
 * so a shower rings the puddles here and there and a downpour everywhere at once.
 *
 * The same in GLSL, WGSL and on the CPU (for tests). `weatherRipples(ground, time, rain)` gives how the water's surface
 * tilts at a point on the ground, as a horizontal vector (0 where it lies flat), for `time` in seconds and `rain` the
 * rain's intensity from 0 to 1.
 */

/** Cells of the ripple pattern, in metres. */
const CELL = 0.5
/** Seconds after which all the rings repeat, so time can be wrapped there before it loses precision in a shader. */
export const RIPPLE_PERIOD = 8
/**
 * The layers: each one's drops per cell a second, in eighths so it repeats within `RIPPLE_PERIOD`; its place in its
 * cycle at time 0; and how far its cells are shifted from the first layer's, in cells.
 */
const LAYERS = [
  { eighths: 13, phase: 0, x: 0, z: 0 },
  { eighths: 11, phase: 0.2, x: 0.31, z: 0.17 },
  { eighths: 12, phase: 0.45, x: 0.73, z: 0.59 },
  { eighths: 14, phase: 0.7, x: 0.13, z: 0.87 }
] as const
/** A ring spreads to this many cells from where its drop struck, which is at most `JITTER` cells from its cell's middle. */
const REACH = 0.35
const JITTER = 0.15
/** How much a ring tilts the water at most. */
const TILT = 0.35

/** The four layers' calls, summed, in either shading language (`vec` is its two-vector type). */
const layerCalls = (vec: string) =>
  LAYERS.map(
    ({ eighths, phase, x, z }, index) =>
      `weatherRippleLayer(at + ${vec}(${x.toFixed(2)}, ${z.toFixed(2)}), time * ${(eighths / 8).toFixed(3)} + ` +
      `${phase.toFixed(2)}, weight[${index}], ${index.toFixed(1)})`
  ).join(" + ")

/** GLSL: `vec2 weatherRipples(vec2 ground, float time, float rain)`. */
export const RIPPLES_GLSL = `
vec3 weatherRippleHash(vec2 cell) {
  vec3 p = fract(cell.xyx * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yzz) * p.zyx);
}
vec2 weatherRippleLayer(vec2 at, float cycle, float weight, float seed) {
  vec3 drop = weatherRippleHash(floor(at) + vec2(seed * 37.0, seed * 11.0));
  vec2 away = fract(at) - 0.5 - (drop.xy - 0.5) * ${(JITTER * 2).toFixed(2)};
  float radius = length(away);
  float reach = 1.0 - clamp(radius / ${REACH.toFixed(2)}, 0.0, 1.0);
  float age = fract(cycle + drop.z);
  float wave = clamp((age - 1.0 + reach) * 9.0, 0.0, 3.0);
  float strength = weight * clamp(0.2 + weight * 0.8 - age, 0.0, 1.0) * reach * sin(wave * 3.14159265);
  return away / max(radius, 1e-4) * strength * ${TILT.toFixed(2)};
}
vec2 weatherRipples(vec2 ground, float time, float rain) {
  vec2 at = ground * ${(1 / CELL).toFixed(1)};
  vec4 weight = clamp(rain * 4.0 - vec4(0.0, 1.0, 2.0, 3.0), 0.0, 1.0);
  return ${layerCalls("vec2")};
}
`

/** The same in WGSL. */
export const RIPPLES_WGSL = `
fn weatherRippleHash(cell: vec2f) -> vec3f {
  var p: vec3f = fract(cell.xyx * vec3f(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yzz) * p.zyx);
}
fn weatherRippleLayer(at: vec2f, cycle: f32, weight: f32, seed: f32) -> vec2f {
  let drop: vec3f = weatherRippleHash(floor(at) + vec2f(seed * 37.0, seed * 11.0));
  let away: vec2f = fract(at) - 0.5 - (drop.xy - 0.5) * ${(JITTER * 2).toFixed(2)};
  let radius: f32 = length(away);
  let reach: f32 = 1.0 - clamp(radius / ${REACH.toFixed(2)}, 0.0, 1.0);
  let age: f32 = fract(cycle + drop.z);
  let wave: f32 = clamp((age - 1.0 + reach) * 9.0, 0.0, 3.0);
  let strength: f32 = weight * clamp(0.2 + weight * 0.8 - age, 0.0, 1.0) * reach * sin(wave * 3.14159265);
  return away / max(radius, 1e-4) * strength * ${TILT.toFixed(2)};
}
fn weatherRipples(ground: vec2f, time: f32, rain: f32) -> vec2f {
  let at: vec2f = ground * ${(1 / CELL).toFixed(1)};
  let weight: vec4f = clamp(rain * 4.0 - vec4f(0.0, 1.0, 2.0, 3.0), vec4f(0.0), vec4f(1.0));
  return ${layerCalls("vec2f")};
}
`

const fract = (value: number) => value - Math.floor(value)
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Dave Hoskins' hash without sine, as the shaders have it: a cell to three numbers from 0 to 1. */
function hash(x: number, z: number): readonly [number, number, number] {
  const p = [fract(x * 0.1031), fract(z * 0.103), fract(x * 0.0973)] as const
  const lift = p[0] * (p[1] + 33.33) + p[1] * (p[0] + 33.33) + p[2] * (p[2] + 33.33)
  const [a, b, c] = [p[0] + lift, p[1] + lift, p[2] + lift]
  return [fract((a + b) * c), fract((a + c) * b), fract((b + c) * a)]
}

/**
 * How strongly a ring tilts the water at `radius` cells from where its drop struck, `age` of the way through its
 * layer's cycle (0 as it strikes, 1 as the next drop does), in a layer switched on as far as `weight` (0 to 1): a damped
 * wave of a crest, a trough and a crest, spreading outward and fading as it goes.
 */
export function ringStrength(radius: number, age: number, weight: number): number {
  const reach = 1 - clamp01(radius / REACH)
  const wave = Math.min(3, Math.max(0, (age - 1 + reach) * 9))
  return weight * clamp01(0.2 + weight * 0.8 - age) * reach * Math.sin(wave * Math.PI)
}

/** The same on the CPU: how the water tilts at the ground point (x, z), as [x, z]. */
export function rippleTilt(x: number, z: number, time: number, rain: number): [number, number] {
  let tiltX = 0
  let tiltZ = 0
  LAYERS.forEach(({ eighths, phase, x: shiftX, z: shiftZ }, index) => {
    const atX = x / CELL + shiftX
    const atZ = z / CELL + shiftZ
    const [dropX, dropZ, dropTime] = hash(Math.floor(atX) + index * 37, Math.floor(atZ) + index * 11)
    const awayX = fract(atX) - 0.5 - (dropX - 0.5) * JITTER * 2
    const awayZ = fract(atZ) - 0.5 - (dropZ - 0.5) * JITTER * 2
    const radius = Math.hypot(awayX, awayZ)
    const age = fract(time * (eighths / 8) + phase + dropTime)
    const strength = ringStrength(radius, age, clamp01(rain * 4 - index))
    tiltX += (awayX / Math.max(radius, 1e-4)) * strength * TILT
    tiltZ += (awayZ / Math.max(radius, 1e-4)) * strength * TILT
  })
  return [tiltX, tiltZ]
}
