import { Constants } from "@babylonjs/core/Engines/constants"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent"
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator"
import { SpotLight } from "@babylonjs/core/Lights/spotLight"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder"
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { FLARE, type Flare, flareBrightness, flareLight, flarePosition, type Simulation } from "@verdun/sim"

/**
 * Very lights as the eye saw them over no man's land at night: a streak of sparks climbing from the trench, a pop as
 * the star catches and the parachute opens, then a hard, cold white light hanging in the air, lighting the haze around
 * it, swinging gently under its canopy as it sinks, throwing long shadows that swing with it, dripping burning
 * magnesium and trailing smoke on the wind; at the last it gutters, warms to orange and goes out, and its smoke drifts
 * on in the dark.
 *
 * The simulation decides where flares are and how bright they burn (packages/sim/src/flares.ts); this draws them.
 */

/** Magnesium burning: a cold, faintly green white; guttering at the end, warmer. */
const COLOR = { burning: Color3.FromHexString("#e4eef5"), guttering: Color3.FromHexString("#ffb36b") } as const
/**
 * How bright the star's core is drawn: well above the bloom threshold (1.05), so the post-process blooms it into a glare
 * without the flare needing a bloom setting of its own.
 */
const CORE = { size: 1.3, glow: 7 } as const
/** The glare round the star: the eye's own dazzle, tight and bright. */
const GLARE = { size: 6, glow: 0.6 } as const
/** The lit air round a flare: wider and brighter in mist, rain and snow, when there is more in the air to light. */
const HALO = { size: 26, hazeSize: 50, alpha: 0.035, hazeAlpha: 0.16 } as const
/** The parachute swings the flare in a slow pendulum: metres either side, and seconds a swing. */
const SWAY = { amplitude: 0.9, period: 2.8 } as const
/**
 * The parachute: a silk dome on shroud lines this many metres above the flare, drawn larger than a real one (about
 * 0.6 m across) so it reads from the camera's height. It opens over `opening` seconds once the flare stops climbing, and
 * glows with the flare's light through the silk: 3.5 m over a 25,000 candela star, it is lit at about 2,000 lux.
 */
const CANOPY = { lines: 3.5, width: 1.4, depth: 0.55, opening: 1.5, glow: 0.9, night: 0.05 } as const
/**
 * The spot lights given to the flares nearest the camera. Babylon's standard lighting fades linearly to a range rather
 * than by the inverse square, so range and intensity follow the flare's height: a high flare lights a wide, dim pool,
 * a low one a tight, bright one.
 */
const LIGHT = { count: 3, angle: 2.6, exponent: 1.3, rangePerHeight: 3, intensity: 1.7, lowest: 25, most: 4.6 } as const
/** Shadows from the flare nearest the camera: deep, crisp, and swinging as the flare sways. */
const SHADOW = { mapSize: 1024, darkness: 0.12 } as const
/** Lights come on below this much light and go off above it, as `lightLevel` reads it, so dusk doesn't flicker them. */
const DARK = { on: 0.55, off: 0.62 } as const
/** Seconds between choosing again what throws the leading flare's shadow, as it drifts. */
const CASTER_REFRESH = 0.5
/** Seconds a flare's smoke and last sparks linger after it burns out. */
const AFTERLIFE = 7
/** At most this many flares drawn at once. */
const POOL = 12
const TICKS_PER_SECOND = 20

/** What the flare view reads each frame. */
export interface FlareSources {
  readonly sim: Simulation
  /** The simulation tick to draw at, fractional between steps for smooth motion. */
  tick(): number
  /** How bright it looks, 0 (moonless night) to 1 (daylight). */
  light(): number
  /** Where the camera looks: lights and shadows go to the flares nearest it. */
  focus(): Vector3
}

/** A flare as drawn this frame. */
export interface DrawnFlare {
  readonly flare: Flare
  readonly position: Vector3
  /** Drawn brightness, flicker included. */
  readonly brightness: number
}

export interface FlareView {
  /** Flares being drawn, burning or just out. */
  readonly drawn: readonly DrawnFlare[]
  /** The spot lights, given to the flares nearest the camera. */
  readonly lights: readonly SpotLight[]
  /** Shadows from the most important flare; null where the engine can't draw them. */
  readonly shadows: ShadowGenerator | null
  /** Draws the flares for this frame. Call after the environment view has lit the scene. */
  update(frameSeconds: number): void
  dispose(): void
}

/** A soft round sprite: a bright centre falling away, `power` sharpening it. */
function radialTexture(scene: Scene, name: string, size: number, power: number): RawTexture {
  const pixels = new Uint8Array(size * size * 4)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5) / size - 0.5
      const y = (row + 0.5) / size - 0.5
      const fall = Math.max(0, 1 - Math.sqrt(x * x + y * y) * 2) ** power
      pixels.set([255, 255, 255, Math.round(255 * fall)], (row * size + column) * 4)
    }
  }
  const texture = new RawTexture(
    pixels,
    size,
    size,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE
  )
  texture.name = name
  texture.hasAlpha = true
  return texture
}

/**
 * Hides a flare's mesh by shrinking it to nothing, never by disabling it: the meshes stay in the draw list, always
 * selected, so recorded draw commands (snapshot rendering under WebGPU) needn't be recorded again as flares come and go.
 */
function hide(mesh: Mesh): void {
  mesh.alwaysSelectAsActiveMesh = true
  mesh.scaling.setAll(0)
}

/** A billboard drawn by its own light: additive, unlit, its colour above 1 to bloom. */
function glowCard(scene: Scene, name: string, texture: Texture, fog: boolean): Mesh {
  const card = CreatePlane(name, { size: 1 }, scene)
  card.billboardMode = Mesh.BILLBOARDMODE_ALL
  card.isPickable = false
  card.doNotSyncBoundingInfo = true
  const material = new StandardMaterial(name, scene)
  material.disableLighting = true
  material.emissiveTexture = texture
  material.opacityTexture = texture
  material.alphaMode = Constants.ALPHA_ADD
  material.disableDepthWrite = true
  material.fogEnabled = fog
  material.backFaceCulling = false
  card.material = material
  hide(card)
  return card
}

/** A parachute's dome: the top half of a sphere, seen inside and out, lit only by its flare. */
function canopy(scene: Scene, name: string): Mesh {
  const dome = CreateSphere(name, { diameter: 1, slice: 0.5, segments: 8 }, scene)
  dome.isPickable = false
  const material = new StandardMaterial(name, scene)
  material.disableLighting = true
  material.backFaceCulling = false
  material.alpha = 0.92
  dome.material = material
  hide(dome)
  return dome
}

/** One flare's drawing: its star, its lit air, its parachute, its sparks and its smoke, reused from flare to flare. */
interface Visual {
  flare: Flare | null
  readonly canopy: Mesh
  readonly core: Mesh
  readonly glare: Mesh
  readonly halo: Mesh
  readonly sparks: ParticleSystem
  readonly smoke: ParticleSystem
  /** Seconds since its flare burnt out, while its smoke lingers; -1 while burning. */
  outFor: number
  /** Phase offsets so no two flares flicker or swing alike. */
  readonly phase: number
  /** A dip in the flame now and then: seconds left, and how deep. */
  dip: { left: number; depth: number }
  readonly position: Vector3
  brightness: number
}

function createVisual(
  scene: Scene,
  index: number,
  textures: { core: Texture; halo: Texture; spark: Texture; smoke: Texture }
): Visual {
  const sparks = new ParticleSystem(`flare-sparks-${index}`, 220, scene)
  sparks.particleTexture = textures.spark
  sparks.emitter = Vector3.Zero()
  sparks.createSphereEmitter(0.2)
  sparks.updateSpeed = 1 / 60
  sparks.blendMode = ParticleSystem.BLENDMODE_ADD
  sparks.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED
  sparks.minSize = 0.18
  sparks.maxSize = 0.4
  sparks.minScaleY = 2
  sparks.maxScaleY = 4
  sparks.minLifeTime = 0.8
  sparks.maxLifeTime = 2.6
  sparks.gravity = new Vector3(0, -9.8, 0)
  sparks.minEmitPower = 0.5
  sparks.maxEmitPower = 3.5
  sparks.color1 = new Color4(6, 6, 5, 1)
  sparks.color2 = new Color4(6, 4.2, 2.2, 1)
  sparks.colorDead = new Color4(1.5, 0.45, 0.1, 0)
  sparks.emitRate = 0
  sparks.start()

  const smoke = new ParticleSystem(`flare-smoke-${index}`, 260, scene)
  smoke.particleTexture = textures.smoke
  smoke.emitter = Vector3.Zero()
  smoke.createSphereEmitter(0.3)
  smoke.updateSpeed = 1 / 60
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD
  smoke.minSize = 1.2
  smoke.maxSize = 2.2
  smoke.addSizeGradient(0, 0.6)
  smoke.addSizeGradient(1, 4.5)
  smoke.minLifeTime = 8
  smoke.maxLifeTime = 14
  smoke.minEmitPower = 0.1
  smoke.maxEmitPower = 0.4
  smoke.direction1 = new Vector3(-0.2, 0.6, -0.2)
  smoke.direction2 = new Vector3(0.2, 1, 0.2)
  smoke.minAngularSpeed = -0.3
  smoke.maxAngularSpeed = 0.3
  smoke.emitRate = 0
  smoke.start()

  return {
    flare: null,
    canopy: canopy(scene, `flare-canopy-${index}`),
    core: glowCard(scene, `flare-core-${index}`, textures.core, false),
    glare: glowCard(scene, `flare-glare-${index}`, textures.halo, false),
    halo: glowCard(scene, `flare-halo-${index}`, textures.halo, true),
    sparks,
    smoke,
    outFor: -1,
    phase: index * 2.399,
    dip: { left: 0, depth: 0 },
    position: new Vector3(),
    brightness: 0
  }
}

/** How much there is in the air to light, from 0 (clear) to 1 (thick fog or heavy rain). */
function hazeOf(sim: Simulation): number {
  const { visibility, precipitation } = sim.environment.weather
  const fog = Math.log(30_000 / Math.max(visibility, 100)) / Math.log(300)
  return Math.min(1, Math.max(0, fog) + Math.min(0.4, precipitation * 0.2))
}

const isSky = (light: unknown): light is HemisphericLight => light instanceof HemisphericLight

/** A shadow map for the leading flare's light, or null where the engine can't make one. */
function createShadows(light: SpotLight): ShadowGenerator | null {
  try {
    return new ShadowGenerator(SHADOW.mapSize, light)
  } catch {
    return null
  }
}

/**
 * Draws the simulation's flares. `casters` decides which meshes throw a flare's shadow: those that throw the sun's.
 */
export function createFlareView(
  scene: Scene,
  sources: FlareSources,
  casters: (mesh: AbstractMesh) => boolean = () => true
): FlareView {
  const textures = {
    core: radialTexture(scene, "flare-core", 64, 2.2),
    halo: radialTexture(scene, "flare-halo", 64, 1.6),
    spark: radialTexture(scene, "flare-spark", 16, 1.5),
    smoke: radialTexture(scene, "flare-smoke", 32, 1.2)
  }
  // The whole pool from the start, so the draw list never grows mid-battle.
  const visuals: Visual[] = Array.from({ length: POOL }, (_, index) => createVisual(scene, index, textures))
  const lights = Array.from({ length: LIGHT.count }, (_, index) => {
    const light = new SpotLight(
      `flare-light-${index}`,
      Vector3.Zero(),
      new Vector3(0, -1, 0),
      LIGHT.angle,
      LIGHT.exponent,
      scene
    )
    light.diffuse = COLOR.burning.clone()
    light.specular = Color3.Black()
    light.intensity = 0
    light.setEnabled(false)
    return light
  })
  const shadows = createShadows(lights[0]!)
  if (shadows) {
    shadows.usePercentageCloserFiltering = true
    shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
    shadows.bias = 0.0008
    shadows.normalBias = 0.02
    shadows.setDarkness(SHADOW.darkness)
  }
  const shadowMap = shadows?.getShadowMap() ?? null
  const none: AbstractMesh[] = []
  // What throws a flare's shadow: found when the first flare casts, once the level is dressed, then kept up to date as
  // meshes come and go rather than sought out every frame.
  let throwing: AbstractMesh[] | null = null
  const throwers = (): AbstractMesh[] => {
    if (throwing === null) {
      const found = scene.meshes.filter(casters)
      throwing = found
      scene.onNewMeshAddedObservable.add((mesh) => {
        if (casters(mesh)) {
          found.push(mesh)
        }
      })
      scene.onMeshRemovedObservable.add((mesh) => {
        const index = found.indexOf(mesh)
        if (index >= 0) {
          found.splice(index, 1)
        }
      })
    }
    return throwing
  }
  let lit = false
  let clock = 0
  let sinceCasters = 0
  const drawn: DrawnFlare[] = []

  const visualFor = (flare: Flare): Visual | null => {
    const existing = visuals.find((visual) => visual.flare === flare)
    if (existing) {
      return existing
    }
    const free = visuals.find((visual) => visual.flare === null && visual.outFor < 0)
    if (free) {
      free.flare = flare
    }
    return free ?? null
  }

  function setLit(on: boolean): void {
    if (on !== lit) {
      lit = on
      for (const light of lights) {
        light.setEnabled(on)
      }
    }
  }

  return {
    get drawn() {
      return drawn
    },
    lights,
    shadows,
    update(frameSeconds) {
      clock += frameSeconds
      const { sim } = sources
      const tick = sources.tick()
      const haze = hazeOf(sim)
      const wind = sim.wind
      const light = sources.light()
      setLit(lit ? light < DARK.off : light < DARK.on)

      // Give each flare in the air a drawing; let go of those whose flares have burnt out, by the time drawn at, which
      // can be a little ahead of the simulation's.
      const burning = sim.flares.filter((flare) => tick < flare.burnsOutAt)
      for (const flare of burning) {
        visualFor(flare)
      }
      for (const visual of visuals) {
        if (visual.flare && !burning.includes(visual.flare)) {
          visual.flare = null
          visual.outFor = 0
        }
      }

      drawn.length = 0
      for (const visual of visuals) {
        const { flare } = visual
        if (!flare) {
          // Burnt out: no star, no sparks, the smoke drifting on until it thins away.
          if (visual.outFor >= 0) {
            visual.outFor += frameSeconds
            hide(visual.canopy)
            hide(visual.core)
            hide(visual.glare)
            hide(visual.halo)
            visual.sparks.emitRate = 0
            visual.smoke.emitRate = 0
            if (visual.outFor > AFTERLIFE) {
              visual.outFor = -1
              visual.sparks.reset()
              visual.smoke.reset()
            }
          }
          continue
        }
        const age = (tick - flare.firedAt) / TICKS_PER_SECOND
        const left = (flare.burnsOutAt - tick) / TICKS_PER_SECOND
        const at = flarePosition(flare, tick)
        // Under its canopy the flare swings like a pendulum, more as it hangs lower and the canopy opens fully.
        const hanging = Math.max(0, age - FLARE.riseSeconds)
        const swing = SWAY.amplitude * Math.min(1, hanging / 2)
        const angle = (2 * Math.PI * clock) / SWAY.period + visual.phase
        visual.position.set(
          at.x + swing * Math.sin(angle),
          heightAt(sim.map, at.x, at.z) + at.y,
          at.z + swing * 0.6 * Math.cos(angle * 0.9)
        )

        // Flicker: a fast shimmer, a slower waver, and now and then a dip; at the end it gutters hard.
        const guttering = Math.max(0, 1 - left / FLARE.sputterSeconds)
        if (visual.dip.left <= 0 && Math.random() < frameSeconds * (0.6 + 6 * guttering)) {
          visual.dip = { left: 0.05 + Math.random() * 0.12, depth: 0.15 + Math.random() * (0.25 + 0.5 * guttering) }
        }
        visual.dip.left -= frameSeconds
        const dip = visual.dip.left > 0 ? visual.dip.depth : 0
        const shimmer = 0.05 * Math.sin(clock * 37 + visual.phase) + 0.04 * Math.sin(clock * 17.3 + visual.phase * 3)
        const flicker = Math.max(0, 1 + shimmer * (1 + 3 * guttering) - dip)
        visual.brightness = flareBrightness(flare, tick) * flicker
        const color = Color3.Lerp(COLOR.burning, COLOR.guttering, guttering ** 1.5)

        // The parachute hangs at the pivot of the swing, opening out once the flare tops its climb, tilting against the
        // swing, its silk lit from beneath.
        const open = Math.min(1, hanging / CANOPY.opening)
        if (open <= 0) {
          hide(visual.canopy)
        } else {
          const ground = heightAt(sim.map, at.x, at.z)
          visual.canopy.position.set(at.x, ground + at.y + CANOPY.lines, at.z)
          const width = CANOPY.width * (0.3 + 0.7 * open)
          visual.canopy.scaling.set(width, CANOPY.depth * (2 - open), width)
          const lean = (swing / CANOPY.lines) * 0.5
          visual.canopy.rotation.set(lean * 0.6 * Math.cos(angle * 0.9), 0, -lean * Math.sin(angle))
          const silk = visual.canopy.material
          if (silk instanceof StandardMaterial) {
            silk.emissiveColor = color.scale(CANOPY.glow * visual.brightness + CANOPY.night * (1 - light))
          }
        }

        // The star itself, blooming, and the lit air round it.
        const rising = age < FLARE.riseSeconds
        visual.core.position.copyFrom(visual.position)
        visual.core.scaling.setAll(CORE.size * (rising ? 0.6 : 1) * (0.7 + 0.3 * visual.brightness))
        const core = visual.core.material
        if (core instanceof StandardMaterial) {
          core.emissiveColor = color.scale(CORE.glow * visual.brightness)
        }
        visual.glare.position.copyFrom(visual.position)
        visual.glare.scaling.setAll(GLARE.size * (0.6 + 0.4 * visual.brightness))
        const glare = visual.glare.material
        if (glare instanceof StandardMaterial) {
          glare.emissiveColor = color.scale(GLARE.glow * visual.brightness * (1 - light * 0.6))
        }
        visual.halo.position.copyFrom(visual.position)
        visual.halo.scaling.setAll(HALO.size + HALO.hazeSize * haze)
        const halo = visual.halo.material
        if (halo instanceof StandardMaterial) {
          halo.emissiveColor = color.scale((HALO.alpha + HALO.hazeAlpha * haze) * visual.brightness * (1 - light * 0.8))
        }

        // Sparks: a streak of them climbing from the pistol, then burning drips falling away, more as it gutters.
        visual.sparks.emitter = visual.position.clone()
        visual.sparks.emitRate = rising ? 240 : 26 + 70 * guttering
        visual.sparks.direction1 = rising ? new Vector3(-0.3, -1, -0.3) : new Vector3(-0.6, -0.2, -0.6)
        visual.sparks.direction2 = rising ? new Vector3(0.3, -0.4, 0.3) : new Vector3(0.6, 0.4, 0.6)
        // Smoke: a thin trail drifting off on the wind, lit from below near the flare.
        visual.smoke.emitter = visual.position.clone()
        visual.smoke.emitRate = rising ? 40 : 14
        visual.smoke.gravity = new Vector3(wind.x * 0.25, 0.05, wind.z * 0.25)
        // Fresh smoke round the flare glows with its light; older smoke, drifted off, is grey in the dark.
        const shine = 0.35 + 1.1 * visual.brightness * (1 - light * 0.7)
        visual.smoke.color1 = new Color4(shine, shine, shine * 0.97, 0.3)
        visual.smoke.color2 = new Color4(shine * 0.75, shine * 0.75, shine * 0.78, 0.22)
        visual.smoke.colorDead = new Color4(0.1, 0.1, 0.11, 0)

        drawn.push({ flare, position: visual.position.clone(), brightness: visual.brightness })
      }

      // The lights go to the brightest flares nearest where the camera looks; the first throws the shadows.
      const focus = sources.focus()
      const ranked = [...drawn]
        .filter((each) => each.brightness > 0)
        .sort(
          (a, b) =>
            b.brightness / (1 + Vector3.Distance(b.position, focus) / 150) -
            a.brightness / (1 + Vector3.Distance(a.position, focus) / 150)
        )
      for (const [index, spot] of lights.entries()) {
        const target = ranked[index]
        if (!lit || !target) {
          spot.intensity = 0
          continue
        }
        const height = Math.max(4, flarePosition(target.flare, tick).y)
        spot.position.copyFrom(target.position)
        spot.range = height * LIGHT.rangePerHeight + 30
        spot.diffuse = Color3.Lerp(
          COLOR.burning,
          COLOR.guttering,
          Math.max(0, 1 - (target.flare.burnsOutAt - tick) / TICKS_PER_SECOND / FLARE.sputterSeconds) ** 1.5
        )
        // Brighter as it sinks, roughly as the inverse square has it, short of washing the ground out.
        const nearer = (FLARE.height / Math.max(height, LIGHT.lowest)) ** 0.8
        spot.intensity = Math.min(LIGHT.most, LIGHT.intensity * nearer) * target.brightness * (1 - light)
      }
      if (shadowMap) {
        const lead = ranked[0]
        if (!lit || !lead) {
          shadowMap.renderList = none
        } else if ((sinceCasters += frameSeconds) >= CASTER_REFRESH || shadowMap.renderList === none) {
          // Only what stands in the leading flare's light throws its shadow: a few hundred pieces, not the whole map.
          sinceCasters = 0
          const reach = lights[0]!.range
          shadowMap.renderList = throwers().filter((mesh) => {
            const sphere = mesh.getBoundingInfo().boundingSphere
            return Vector3.Distance(sphere.centerWorld, lead.position) <= reach + sphere.radiusWorld
          })
        }
      }

      // The night brightens round a flare: the sky's fill light and the haze take some of its light.
      const near = flareLight(sim, focus.x, focus.z)
      if (near > 0 && light < DARK.off) {
        const share = Math.min(1, near / 3) * (1 - light)
        const sky = scene.lights.find(isSky)
        if (sky) {
          sky.intensity += 0.35 * share
        }
        Color3.LerpToRef(scene.fogColor, COLOR.burning.scale(0.45 + 0.3 * haze), 0.4 * share, scene.fogColor)
        scene.clearColor = Color4.FromColor3(scene.fogColor, 1)
      }
    },
    dispose() {
      for (const visual of visuals) {
        visual.canopy.dispose(false, true)
        visual.core.dispose(false, true)
        visual.glare.dispose(false, true)
        visual.halo.dispose(false, true)
        visual.sparks.dispose()
        visual.smoke.dispose()
      }
      shadows?.dispose()
      for (const light of lights) {
        light.dispose()
      }
      for (const texture of Object.values(textures)) {
        texture.dispose()
      }
    }
  }
}
