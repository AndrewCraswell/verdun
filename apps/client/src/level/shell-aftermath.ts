import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
// Sprites register a picking hook with the scene, which needs rays.
import "@babylonjs/core/Culling/ray"
import { Constants } from "@babylonjs/core/Engines/constants"
import type { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import { Sprite } from "@babylonjs/core/Sprites/sprite"
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager"
import "@babylonjs/core/Sprites/spriteSceneComponent"
import { type BattlefieldMap, heightAt, type SceneryKind } from "@verdun/map"
import { type BurstEvent, Shell } from "@verdun/sim"
import { thinned, thinning } from "./emission-lod.ts"
import type { ScorchMap } from "./scorch-map.ts"

/** Effect sprites the aftermath draws with, from the level kit. */
export interface AftermathSprites {
  /** A soft disc filling its frame: smoke thinned to haze. */
  readonly puff: Texture
  /** A flipbook of flames, 10 x 10 frames. */
  readonly fire: Texture
  /** A spark. */
  readonly ember: Texture
  /** A faceted dark blot: clods of earth in flight. */
  readonly scorch: Texture
}

/** What a shell leaves behind, by kind. */
interface ShellAftermathStats {
  /** Radius of the blackened ground, metres; 0 for bursts in the air. */
  readonly scorch: number
  /** Puffs of smoke left hanging over the spot once the burst's own column has thinned. */
  readonly smoke: number
  /** Clods of earth thrown out. */
  readonly clods: number
  /** How hard they throw them, metres per second. */
  readonly throw: number
  /** Chance of starting a fire where there's nothing to burn; wood nearby makes it four times likelier. */
  readonly fire: number
  /** How much a burst under the camera shakes it. */
  readonly shake: number
}

const STATS: Readonly<Record<Shell, ShellAftermathStats>> = {
  [Shell.FieldHighExplosive]: { scorch: 2.6, smoke: 5, clods: 22, throw: 11, fire: 0.04, shake: 0.55 },
  [Shell.FieldShrapnel]: { scorch: 0, smoke: 2, clods: 0, throw: 0, fire: 0, shake: 0.2 },
  [Shell.HeavyHighExplosive]: { scorch: 4.6, smoke: 11, clods: 46, throw: 16, fire: 0.12, shake: 1 },
  [Shell.FieldGas]: { scorch: 0.9, smoke: 0, clods: 6, throw: 6, fire: 0, shake: 0.2 },
  [Shell.Grenade]: { scorch: 0.8, smoke: 1, clods: 7, throw: 6, fire: 0, shake: 0.15 }
}

/** Scenery that burns: timber, roofs, stores, and the fuel and charges around guns. */
const FLAMMABLE: ReadonlySet<SceneryKind> = new Set<SceneryKind>([
  "tree",
  "fruit-tree",
  "stump",
  "log",
  "ruin",
  "landmark",
  "stores",
  "gun",
  "wrecked-gun",
  "wrecked-plane",
  "bridge"
])
/** A fire burns this long, seconds, and dies down over its last few. */
const FIRE_SECONDS = { min: 35, max: 90, dying: 8 } as const
const MAX_FIRES = 48
/** Shake fades from full to nothing in this long, seconds. */
const SHAKE_FADE_SECONDS = 0.7
/** Bursts this far from the camera's target shake it half as hard, metres. */
const SHAKE_HALF_DISTANCE = 25
/** At full shake the view jolts by this share of the camera's distance from its target. */
const SHAKE_REACH = 0.012

export interface ShellAftermath {
  /** Lingering smoke over shelled ground, and from fires. */
  readonly smoke: ParticleSystem
  /** Clods of earth thrown out by bursts. */
  readonly clods: ParticleSystem
  /** Sparks rising from fires. */
  readonly embers: ParticleSystem
  /** Fires burning now. */
  readonly fires: readonly Sprite[]
  /** Leaves the marks of a shell or grenade that just burst. `random` is for tests. */
  burst(event: BurstEvent, random?: () => number): void
  /** Ages fires, sends new scorch to the GPU and shakes the camera. Call once per frame. */
  update(frameSeconds: number): void
  dispose(): void
}

interface Fire {
  readonly sprite: Sprite
  readonly x: number
  readonly y: number
  readonly z: number
  readonly size: number
  readonly lifetime: number
  age: number
}

/**
 * Places, each to emit a number of particles from: the particle system takes the next one as it emits. A place can
 * carry a throw speed, which then sets the particle's speed (the system sets its own direction), and a boost, how much
 * larger than the system's own size its particles are drawn (a far burst's fewer particles, see emission-lod.ts): a
 * system draws bursts of every size, and the next one may come in the same frame.
 */
interface EmitQueue {
  readonly pending: { x: number; y: number; z: number; spread: number; speed?: number; boost: number }[]
  add(
    system: ParticleSystem,
    x: number,
    y: number,
    z: number,
    spread: number,
    count: number,
    speed?: number,
    boost?: number
  ): void
}

function emitQueue(system: ParticleSystem): EmitQueue {
  const pending: EmitQueue["pending"] = []
  let current: EmitQueue["pending"][number] | undefined
  // The system's own scales, which each place's boost multiplies. Babylon sizes a particle after placing it, so a scale
  // set here sizes the particle being placed.
  const scales = [system.minScaleX, system.maxScaleX, system.minScaleY, system.maxScaleY] as const
  system.startPositionFunction = (_world, position) => {
    current = pending.shift()
    if (current) {
      system.minScaleX = scales[0] * current.boost
      system.maxScaleX = scales[1] * current.boost
      system.minScaleY = scales[2] * current.boost
      system.maxScaleY = scales[3] * current.boost
      position.set(
        current.x + (Math.random() - 0.5) * current.spread,
        current.y + Math.random() * current.spread * 0.3,
        current.z + (Math.random() - 0.5) * current.spread
      )
    }
  }
  const direct = system.startDirectionFunction
  if (!direct) {
    // Thrown up and out in a broad cone, as fast as the place says.
    system.startDirectionFunction = (_world, direction) => {
      const speed = (current?.speed ?? 1) * (0.5 + Math.random() * 0.5)
      direction
        .set((Math.random() - 0.5) * 1.4, 1 + Math.random() * 0.6, (Math.random() - 0.5) * 1.4)
        .scaleInPlace(speed)
    }
  }
  return {
    pending,
    add(target, x, y, z, spread, count, speed, boost = 1) {
      for (let index = 0; index < count; index++) {
        pending.push({ x, y, z, spread, speed, boost })
      }
      target.manualEmitCount = Math.max(0, target.manualEmitCount) + count
    }
  }
}

/** Scenery that burns, bucketed by 10 m square so a burst can ask what's near it. */
function flammableNear(map: BattlefieldMap): (x: number, z: number) => boolean {
  const buckets = new Set<string>()
  for (const item of map.scenery) {
    if (FLAMMABLE.has(item.kind)) {
      buckets.add(`${Math.floor(item.x / 10)},${Math.floor(item.z / 10)}`)
    }
  }
  return (x, z) => buckets.has(`${Math.floor(x / 10)},${Math.floor(z / 10)}`)
}

function createSmoke(scene: Scene, texture: Texture, wind: () => { x: number; z: number }): ParticleSystem {
  const smoke = new ParticleSystem("shell-smoke-lingering", 1600, scene)
  smoke.particleTexture = texture
  smoke.emitter = Vector3.Zero()
  smoke.manualEmitCount = 0
  smoke.color1 = new Color4(0.27, 0.25, 0.23, 0.2)
  smoke.color2 = new Color4(0.36, 0.34, 0.31, 0.16)
  smoke.colorDead = new Color4(0.45, 0.44, 0.42, 0)
  // Faint as it forms inside the burst's own column, thickest once that has thinned, then gone.
  smoke.addColorGradient(0, new Color4(0.3, 0.28, 0.26, 0))
  smoke.addColorGradient(0.15, new Color4(0.3, 0.28, 0.26, 0.16))
  smoke.addColorGradient(0.6, new Color4(0.38, 0.36, 0.33, 0.1))
  smoke.addColorGradient(1, new Color4(0.45, 0.44, 0.42, 0))
  // Size gradients are the size itself, in metres; each particle varies by its scale.
  smoke.addSizeGradient(0, 4)
  smoke.addSizeGradient(1, 20)
  smoke.minScaleX = 0.75
  smoke.maxScaleX = 1.25
  smoke.minScaleY = 0.75
  smoke.maxScaleY = 1.25
  smoke.minLifeTime = 18
  smoke.maxLifeTime = 34
  // It drifts with the wind near the ground, rising slowly.
  smoke.startDirectionFunction = (_world, direction) => {
    const { x, z } = wind()
    direction.set(x * (0.7 + Math.random() * 0.4), 0.25 + Math.random() * 0.35, z * (0.7 + Math.random() * 0.4))
  }
  smoke.minEmitPower = 1
  smoke.maxEmitPower = 1
  smoke.minAngularSpeed = -0.1
  smoke.maxAngularSpeed = 0.1
  smoke.minInitialRotation = 0
  smoke.maxInitialRotation = Math.PI * 2
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD
  return smoke
}

function createClods(scene: Scene, texture: Texture): ParticleSystem {
  const clods = new ParticleSystem("shell-clods", 2400, scene)
  clods.particleTexture = texture
  clods.emitter = Vector3.Zero()
  clods.manualEmitCount = 0
  clods.color1 = new Color4(0.24, 0.2, 0.16, 1)
  clods.color2 = new Color4(0.33, 0.28, 0.22, 1)
  clods.colorDead = new Color4(0.24, 0.2, 0.16, 1)
  clods.minSize = 0.12
  clods.maxSize = 0.45
  clods.minLifeTime = 1.1
  clods.maxLifeTime = 2.1
  // Each burst's own throw speed sets the clods' speed (see emitQueue).
  clods.minEmitPower = 1
  clods.maxEmitPower = 1
  clods.gravity = new Vector3(0, -9.81, 0)
  clods.minAngularSpeed = -6
  clods.maxAngularSpeed = 6
  clods.minInitialRotation = 0
  clods.maxInitialRotation = Math.PI * 2
  clods.blendMode = ParticleSystem.BLENDMODE_STANDARD
  return clods
}

function createEmbers(scene: Scene, texture: Texture): ParticleSystem {
  const embers = new ParticleSystem("fire-embers", 600, scene)
  embers.particleTexture = texture
  embers.emitter = Vector3.Zero()
  embers.manualEmitCount = 0
  embers.color1 = new Color4(1, 0.62, 0.22, 1)
  embers.color2 = new Color4(1, 0.42, 0.1, 1)
  embers.colorDead = new Color4(0.6, 0.12, 0, 0)
  embers.minSize = 0.05
  embers.maxSize = 0.13
  embers.minLifeTime = 1
  embers.maxLifeTime = 2.6
  embers.direction1 = new Vector3(-0.35, 1, -0.35)
  embers.direction2 = new Vector3(0.35, 1.6, 0.35)
  embers.minEmitPower = 0.8
  embers.maxEmitPower = 1.8
  embers.gravity = new Vector3(0.15, 0.2, 0.05)
  embers.blendMode = ParticleSystem.BLENDMODE_ADD
  return embers
}

/** The ArcRotateCamera's view offset, which moves the picture without moving the camera's target. */
function screenOffsetOf(camera: TargetCamera): Vector2 | null {
  const offset: unknown = Reflect.get(camera, "targetScreenOffset")
  return offset instanceof Vector2 ? offset : null
}

function radiusOf(camera: TargetCamera): number {
  const radius: unknown = Reflect.get(camera, "radius")
  return typeof radius === "number" ? radius : camera.position.subtract(camera.getTarget()).length()
}

/**
 * What shellfire leaves behind once the flash and the column of earth (effects/explosions.ts) are gone: ground
 * blackened in faceted blots, smoke hanging over the shelled ground and drifting with the wind, clods of earth thrown
 * out, now and then a fire with sparks rising from it (likelier where there's timber to catch), and a jolt of the
 * camera when a shell lands near what it's looking at.
 */
export function createShellAftermath(
  scene: Scene,
  map: BattlefieldMap,
  camera: TargetCamera,
  sprites: AftermathSprites,
  scorch: ScorchMap,
  wind: () => { x: number; z: number },
  onBurst: (event: BurstEvent) => void = () => undefined
): ShellAftermath {
  const smoke = createSmoke(scene, sprites.puff, wind)
  const clods = createClods(scene, sprites.scorch)
  const embers = createEmbers(scene, sprites.ember)
  const smokeQueue = emitQueue(smoke)
  const clodQueue = emitQueue(clods)
  const emberQueue = emitQueue(embers)
  for (const system of [smoke, clods, embers]) {
    system.start()
  }
  // The flipbook's frames are 128 px square in the kit's 1280 px sheet.
  const flameSheet = new SpriteManager("fires", "", MAX_FIRES, 128, scene)
  flameSheet.texture = sprites.fire
  flameSheet.blendMode = Constants.ALPHA_ADD
  flameSheet.isPickable = false
  const burnable = flammableNear(map)
  const fires: Fire[] = []
  const screenOffset = screenOffsetOf(camera)
  let trauma = 0
  let clock = 0
  let fireSmoke = 0

  function light(x: number, z: number, random: () => number): void {
    if (fires.length >= MAX_FIRES) {
      return
    }
    const sprite = new Sprite("fire", flameSheet)
    const size = 1.4 + random() * 1.4
    const y = heightAt(map, x, z)
    sprite.position.set(x, y + size * 0.42, z)
    sprite.size = size
    sprite.color = new Color4(1, 0.55, 0.22, 0.95)
    sprite.playAnimation(0, 99, true, 28 + random() * 12)
    sprite.isPickable = false
    const lifetime = FIRE_SECONDS.min + random() * (FIRE_SECONDS.max - FIRE_SECONDS.min)
    fires.push({ sprite, x, y, z, size, lifetime, age: 0 })
  }

  return {
    smoke,
    clods,
    embers,
    get fires() {
      return fires.map((fire) => fire.sprite)
    },
    burst(event, random = Math.random) {
      const stats = STATS[event.shell]
      const { x, z } = event.at
      const ground = heightAt(map, x, z)
      const y = Math.max(ground, event.at.y)
      const inAir = y > ground + 1.5
      // A far burst leaves fewer, larger puffs and clods.
      const { share, boost } = thinning(camera.globalPosition, x, y, z)
      if (stats.scorch > 0 && !inAir) {
        scorch.scorch(x, z, stats.scorch, random)
      }
      if (stats.smoke > 0) {
        // The haze is faint and soft-edged, so fewer puffs don't read as blots: enlarged in full, it keeps all its cover.
        const puffs = thinned(stats.smoke, share)
        smokeQueue.add(smoke, x, y + 1.5, z, Math.max(2, stats.scorch * 1.6), puffs, undefined, boost * boost)
      }
      if (stats.clods > 0 && !inAir) {
        clodQueue.add(clods, x, ground + 0.3, z, stats.scorch * 0.6, thinned(stats.clods, share), stats.throw, boost)
      }
      const chance = stats.fire * (burnable(x, z) ? 4 : 1)
      if (!inAir && random() < chance) {
        light(x + (random() - 0.5) * stats.scorch, z + (random() - 0.5) * stats.scorch, random)
      }
      onBurst(event)
      const target = camera.getTarget()
      const distance = Math.hypot(target.x - x, target.z - z)
      trauma = Math.min(1, trauma + stats.shake / (1 + (distance / SHAKE_HALF_DISTANCE) ** 2))
    },
    update(frameSeconds) {
      clock += frameSeconds
      scorch.update()
      fireSmoke += frameSeconds
      const puff = fireSmoke > 1.2
      if (puff) {
        fireSmoke = 0
      }
      for (let index = fires.length - 1; index >= 0; index--) {
        const fire = fires[index]
        if (!fire) {
          continue
        }
        fire.age += frameSeconds
        const left = fire.lifetime - fire.age
        if (left <= 0) {
          fire.sprite.dispose()
          fires.splice(index, 1)
          continue
        }
        const strength = Math.min(1, left / FIRE_SECONDS.dying)
        fire.sprite.size = fire.size * (0.4 + 0.6 * strength)
        fire.sprite.position.y = fire.y + fire.sprite.size * 0.42
        // Sparks a few centimetres across, far fewer from a far fire: there they're less than a pixel.
        const { share } = thinning(camera.globalPosition, fire.x, fire.y, fire.z)
        if (Math.random() < frameSeconds * 7 * strength * share * share) {
          emberQueue.add(embers, fire.x, fire.y + fire.sprite.size * 0.5, fire.z, 0.6, 1)
        }
        if (puff) {
          smokeQueue.add(smoke, fire.x, fire.y + fire.sprite.size, fire.z, 0.5, 1)
        }
      }
      trauma = Math.max(0, trauma - frameSeconds / SHAKE_FADE_SECONDS)
      if (screenOffset) {
        // Trauma squared: small knocks barely register, close hits jolt.
        const jolt = trauma * trauma * radiusOf(camera) * SHAKE_REACH
        screenOffset.set(
          jolt * (Math.sin(clock * 47) + Math.sin(clock * 83) * 0.5),
          jolt * (Math.sin(clock * 59 + 1.3) + Math.sin(clock * 97) * 0.5)
        )
      }
    },
    dispose() {
      for (const system of [smoke, clods, embers]) {
        system.dispose()
      }
      flameSheet.dispose()
      screenOffset?.set(0, 0)
    }
  }
}
