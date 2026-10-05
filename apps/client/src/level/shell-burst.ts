import type { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, heightAt } from "@verdun/map"
import { type BurstEvent, Shell } from "@verdun/sim"
import { thinned, thinning } from "./emission-lod.ts"

/** The sprites a burst is drawn with, from the level kit. */
export interface BurstSprites {
  /** A soft spot, bright at the middle: the flash. */
  readonly mist: Texture
  /** A soft disc filling its frame: the body of the column of earth, the dust and the smoke. */
  readonly puff: Texture
  /** Synty's faceted puff: earth thrown up, shrapnel's ball of smoke. */
  readonly smoke: Texture
  /** A flipbook of flames, 10 x 10 frames of 128 px. */
  readonly fire: Texture
  /** A spark. */
  readonly ember: Texture
}

/** Which way a channel throws its particles. */
type Throw = "up" | "out" | "around"

/** One place to emit from, and how hard. */
interface Emission {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Scatter of the start position, metres. */
  readonly spread: number
  /** Metres per second the particles leave at, before the channel's own variation. */
  readonly speed: number
  /** Start heights spread over this many metres above `y`: smoke filling the column the earth went up in. */
  readonly rise?: number
  /** How much larger than the system's own size its particles are drawn: a far burst's fewer particles (emission-lod.ts). */
  readonly boost?: number
}

/**
 * A particle system emitting only when told, each particle from the next place queued: one system draws every
 * burst's flash, or every field gun's column of earth, wherever they land. Positions and speeds come from the queue;
 * the system's own settings give size, colour and life.
 */
interface Channel {
  readonly system: ParticleSystem
  emit(at: Emission, count: number): void
}

/**
 * Frees room for `count` new particles by ending the most faded: in a barrage a full system would otherwise drop the
 * newest burst whole, its smoke or its column missing, while the last of the old ones lingers.
 */
function makeRoom(system: ParticleSystem, count: number): void {
  const alive = system.particles.filter((particle) => particle.age < particle.lifeTime)
  const needed = count - (system.getCapacity() - alive.length - Math.max(0, system.manualEmitCount))
  if (needed <= 0) {
    return
  }
  alive.sort((a, b) => b.age / b.lifeTime - a.age / a.lifeTime)
  for (const particle of alive.slice(0, needed)) {
    particle.age = particle.lifeTime
  }
}

/**
 * `range` is the spread of speeds, as fractions of each emission's speed: a column of earth runs from the ground up
 * because its particles leave at every speed from a crawl to the full throw.
 */
function channel(
  scene: Scene,
  name: string,
  capacity: number,
  how: Throw,
  setup: (system: ParticleSystem) => void,
  range: readonly [number, number] = [0.65, 1.35]
): Channel {
  const system = new ParticleSystem(name, capacity, scene)
  system.emitter = Vector3.Zero()
  system.manualEmitCount = 0
  system.minEmitPower = 1
  system.maxEmitPower = 1
  const pending: Emission[] = []
  let current: Emission | undefined
  // The system's own scales, which each emission's boost multiplies. Babylon sizes a particle after placing it, so a
  // scale set here sizes the particle being placed.
  let scales: readonly [number, number, number, number] = [1, 1, 1, 1]
  system.startPositionFunction = (_world, position) => {
    current = pending.shift()
    if (current) {
      const { spread } = current
      const boost = current.boost ?? 1
      system.minScaleX = scales[0] * boost
      system.maxScaleX = scales[1] * boost
      system.minScaleY = scales[2] * boost
      system.maxScaleY = scales[3] * boost
      position.set(
        current.x + (Math.random() - 0.5) * spread,
        current.y + Math.random() * (current.rise ?? spread * 0.3),
        current.z + (Math.random() - 0.5) * spread
      )
    }
  }
  system.startDirectionFunction = (_world, direction) => {
    const speed = (current?.speed ?? 0) * (range[0] + Math.random() * (range[1] - range[0]))
    const angle = Math.random() * Math.PI * 2
    if (how === "up") {
      // A narrow cone: the column of earth a shell throws straight up.
      const lean = Math.random() * 0.28
      direction.set(Math.cos(angle) * lean, 1, Math.sin(angle) * lean).scaleInPlace(speed)
    } else if (how === "out") {
      // Flat along the ground: the ring of dust a burst drives out.
      direction.set(Math.cos(angle), 0.08 + Math.random() * 0.12, Math.sin(angle)).scaleInPlace(speed)
    } else {
      const up = Math.random() * 2 - 1
      const across = Math.sqrt(1 - up * up)
      direction.set(Math.cos(angle) * across, up * 0.6 + 0.3, Math.sin(angle) * across).scaleInPlace(speed)
    }
  }
  setup(system)
  scales = [system.minScaleX, system.maxScaleX, system.minScaleY, system.maxScaleY]
  system.start()
  return {
    system,
    emit(at, count) {
      // Places queued for particles the system made no room for: dropped, or the next burst's would start at them.
      if (system.manualEmitCount <= 0) {
        pending.length = 0
      }
      makeRoom(system, count)
      for (let index = 0; index < count; index++) {
        pending.push(at)
      }
      system.manualEmitCount = Math.max(0, system.manualEmitCount) + count
    }
  }
}

/** Colour stops over a particle's life: each [age 0 to 1, red, green, blue, alpha]. */
function fade(system: ParticleSystem, stops: readonly (readonly [number, number, number, number, number])[]): void {
  for (const [age, r, g, b, a] of stops) {
    system.addColorGradient(age, new Color4(r, g, b, a))
  }
}

/**
 * Sizes over a particle's life, in metres: each [age 0 to 1, size]. Babylon takes size gradients as the size itself,
 * not a factor of the system's size, so each particle varies by its scale instead.
 */
function grow(system: ParticleSystem, stops: readonly (readonly [number, number])[], vary = 0.25): void {
  for (const [age, size] of stops) {
    system.addSizeGradient(age, size)
  }
  system.minScaleX = 1 - vary
  system.maxScaleX = 1 + vary
  system.minScaleY = 1 - vary
  system.maxScaleY = 1 + vary
}

/** A burst's size class: field guns and grenades share one set of systems, the heavy howitzers have their own. */
interface Weight {
  readonly flash: Channel
  readonly fireball: Channel
  /** The body of the column: a dusty mass of earth and smoke. */
  readonly column: Channel
  /** Clods and stones sprayed out of it, falling fast. */
  readonly earth: Channel
  readonly dust: Channel
  readonly smoke: Channel
}

function weight(scene: Scene, sprites: BurstSprites, heavy: boolean): Weight {
  const scale = heavy ? 2.1 : 1
  const name = heavy ? "heavy" : "field"
  const flash = channel(scene, `burst-flash-${name}`, 16, "around", (system) => {
    system.particleTexture = sprites.mist
    system.blendMode = ParticleSystem.BLENDMODE_ADD
    system.minSize = 11 * scale
    system.maxSize = 15 * scale
    system.minLifeTime = 0.08
    system.maxLifeTime = 0.14
    // Brighter than white, so the bloom catches it.
    fade(system, [
      [0, 3, 2.6, 1.8, 1],
      [1, 1.5, 0.9, 0.4, 0]
    ])
  })
  const fireball = channel(scene, `burst-fireball-${name}`, 64 * (heavy ? 2 : 1), "around", (system) => {
    system.particleTexture = sprites.fire
    // Drawn over the ground rather than added to it: added, it washes out against daylit earth.
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD
    system.isAnimationSheetEnabled = true
    system.spriteCellWidth = 128
    system.spriteCellHeight = 128
    system.startSpriteCellID = 0
    system.endSpriteCellID = 99
    system.spriteCellChangeSpeed = 4
    system.spriteCellLoop = false
    grow(system, [
      [0, 2.5 * scale],
      [1, 8 * scale]
    ])
    system.minLifeTime = 0.45
    system.maxLifeTime = 0.8
    system.minInitialRotation = 0
    system.maxInitialRotation = Math.PI * 2
    fade(system, [
      [0, 3, 2.4, 1.6, 1],
      [0.35, 2.2, 1.1, 0.45, 0.95],
      [0.7, 0.9, 0.35, 0.12, 0.6],
      [1, 0.25, 0.12, 0.06, 0]
    ])
  })
  const column = channel(
    scene,
    `burst-column-${name}`,
    heavy ? 1200 : 800,
    "up",
    (system) => {
      system.particleTexture = sprites.puff
      system.blendMode = ParticleSystem.BLENDMODE_STANDARD
      grow(system, [
        [0, 2.5 * scale],
        [0.3, 6 * scale],
        [1, 14 * scale]
      ])
      system.minLifeTime = 2 * Math.sqrt(scale)
      system.maxLifeTime = 3.2 * Math.sqrt(scale)
      // Thrown earth slows in the air and hangs before it falls back.
      system.gravity = new Vector3(0, -5, 0)
      system.addLimitVelocityGradient(0, 40 * scale)
      system.addLimitVelocityGradient(0.6, 8 * scale)
      system.addLimitVelocityGradient(1, 3)
      system.limitVelocityDamping = 0.95
      system.minInitialRotation = 0
      system.maxInitialRotation = Math.PI * 2
      // Dark earth at the heart of the column, browning and thinning to dust as it spreads.
      fade(system, [
        [0, 0.16, 0.13, 0.1, 0.95],
        [0.35, 0.27, 0.22, 0.17, 0.9],
        [0.75, 0.4, 0.35, 0.29, 0.55],
        [1, 0.48, 0.44, 0.38, 0]
      ])
    },
    [0.12, 1]
  )
  const earth = channel(
    scene,
    `burst-earth-${name}`,
    900 * (heavy ? 2 : 1),
    "up",
    (system) => {
      system.particleTexture = sprites.smoke
      system.blendMode = ParticleSystem.BLENDMODE_STANDARD
      system.minSize = 0.2 * scale
      system.maxSize = 0.6 * scale
      system.minLifeTime = 1.4 * Math.sqrt(scale)
      system.maxLifeTime = 2.4 * Math.sqrt(scale)
      system.gravity = new Vector3(0, -9.81, 0)
      system.minAngularSpeed = -3
      system.maxAngularSpeed = 3
      system.minInitialRotation = 0
      system.maxInitialRotation = Math.PI * 2
      fade(system, [
        [0, 0.18, 0.15, 0.12, 1],
        [0.85, 0.24, 0.2, 0.16, 1],
        [1, 0.3, 0.26, 0.2, 0]
      ])
    },
    [0.4, 1.3]
  )
  const dust = channel(scene, `burst-dust-${name}`, heavy ? 800 : 700, "out", (system) => {
    system.particleTexture = sprites.puff
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD
    grow(system, [
      [0, 3 * scale],
      [1, 17 * scale]
    ])
    system.minLifeTime = 2.5
    system.maxLifeTime = 4.5
    // The ring slows as it spreads: velocity is capped lower and lower over its life.
    system.addLimitVelocityGradient(0, 14 * scale)
    system.addLimitVelocityGradient(0.4, 3 * scale)
    system.addLimitVelocityGradient(1, 0.5)
    system.limitVelocityDamping = 0.8
    fade(system, [
      [0, 0.3, 0.26, 0.21, 0.5],
      [0.5, 0.36, 0.32, 0.27, 0.3],
      [1, 0.42, 0.39, 0.34, 0]
    ])
  })
  const smoke = channel(scene, `burst-smoke-${name}`, 1000, "up", (system) => {
    system.particleTexture = sprites.puff
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD
    grow(system, [
      [0, 3.5 * scale],
      [1, 24 * scale]
    ])
    system.minLifeTime = 8 * Math.sqrt(scale)
    system.maxLifeTime = 15 * Math.sqrt(scale)
    system.minAngularSpeed = -0.15
    system.maxAngularSpeed = 0.15
    system.minInitialRotation = 0
    system.maxInitialRotation = Math.PI * 2
    // High explosive's smoke is black, greying as it thins: many faint puffs overlapping, so none reads as a ball.
    fade(system, [
      [0, 0.1, 0.095, 0.09, 0],
      [0.08, 0.12, 0.11, 0.1, 0.32],
      [0.5, 0.22, 0.21, 0.2, 0.22],
      [1, 0.38, 0.37, 0.35, 0]
    ])
  })
  return { flash, fireball, column, earth, dust, smoke }
}

export interface ShellBursts {
  /** Every particle system, for tests and inspection. */
  readonly systems: readonly ParticleSystem[]
  /** Draws a shell or grenade bursting. */
  burst(event: BurstEvent): void
  /** Turns the smoke's drift to the wind. Call once per frame. */
  update(): void
  dispose(): void
}

/**
 * Shells bursting as the newsreels showed them: a white flash, a fireball rolling up out of the ground, a column of
 * earth thrown straight up and falling back (ten metres for a field gun's shell, twenty-five for a heavy howitzer's), a
 * ring of dust driven out along the ground, sparks, and black smoke boiling up and drifting off on the wind. Shrapnel
 * bursts in the air as a white ball of smoke over a patter of dust where the balls strike; gas shells burst with a dull
 * pop and a greenish puff before the cloud takes over. The crater itself is the simulation's.
 */
export function createShellBursts(
  scene: Scene,
  map: BattlefieldMap,
  sprites: BurstSprites,
  wind: () => { readonly x: number; readonly z: number }
): ShellBursts {
  const field = weight(scene, sprites, false)
  const heavy = weight(scene, sprites, true)
  const sparks = channel(scene, "burst-sparks", 600, "around", (system) => {
    system.particleTexture = sprites.ember
    system.blendMode = ParticleSystem.BLENDMODE_ADD
    system.minSize = 0.08
    system.maxSize = 0.2
    system.minLifeTime = 0.3
    system.maxLifeTime = 0.8
    system.gravity = new Vector3(0, -9.81, 0)
    fade(system, [
      [0, 3, 2, 1, 1],
      [1, 1, 0.3, 0, 0]
    ])
  })
  const airburst = channel(scene, "burst-shrapnel", 600, "around", (system) => {
    system.particleTexture = sprites.puff
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD
    grow(system, [
      [0, 2],
      [0.15, 5.5],
      [1, 16]
    ])
    system.minLifeTime = 4
    system.maxLifeTime = 7
    system.minInitialRotation = 0
    system.maxInitialRotation = Math.PI * 2
    // A cotton-wool ball of white smoke, softening and greying as it drifts.
    fade(system, [
      [0, 0.95, 0.94, 0.9, 0.85],
      [0.4, 0.84, 0.83, 0.8, 0.55],
      [1, 0.72, 0.72, 0.7, 0]
    ])
  })
  const strikes = channel(scene, "burst-shrapnel-strikes", 400, "up", (system) => {
    system.particleTexture = sprites.puff
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD
    grow(system, [
      [0, 0.5],
      [1, 2.4]
    ])
    system.minLifeTime = 0.6
    system.maxLifeTime = 1.2
    system.gravity = new Vector3(0, -3, 0)
    fade(system, [
      [0, 0.4, 0.35, 0.28, 0.6],
      [1, 0.45, 0.4, 0.33, 0]
    ])
  })
  const gas = channel(scene, "burst-gas", 120, "around", (system) => {
    system.particleTexture = sprites.puff
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD
    grow(system, [
      [0, 1.4],
      [1, 6.5]
    ])
    system.minLifeTime = 2
    system.maxLifeTime = 3.5
    fade(system, [
      [0, 0.62, 0.66, 0.4, 0.7],
      [1, 0.55, 0.58, 0.42, 0]
    ])
  })
  const drifting = [field.smoke, heavy.smoke, field.dust, heavy.dust, airburst, gas]
  const systems = [...Object.values(field), ...Object.values(heavy), sparks, airburst, strikes, gas].map(
    (each) => each.system
  )

  return {
    systems,
    burst(event) {
      const { x, z } = event.at
      const ground = heightAt(map, x, z)
      const { share, boost } = thinning(scene.activeCamera?.globalPosition, x, ground, z)
      const at = (y: number, spread: number, speed: number): Emission => ({ x, y, z, spread, speed, boost })
      // Each channel's count, thinned for a far burst; a single particle, the flash, is never thinned, so never enlarged.
      const emit = (target: Channel, from: Emission, count: number) =>
        target.emit(count > 1 ? from : { ...from, boost: 1 }, thinned(count, share))
      switch (event.shell) {
        case Shell.FieldShrapnel: {
          const y = Math.max(ground + 4, event.at.y)
          emit(field.flash, at(y, 0, 0), 1)
          emit(airburst, at(y, 3, 1.6), 16)
          // The balls fly on and down: dust kicked up over the ground ahead of and below the burst.
          for (let index = thinned(18, share); index > 0; index--) {
            const sx = x + (Math.random() - 0.5) * 22
            const sz = z + (Math.random() - 0.5) * 22
            strikes.emit({ x: sx, y: heightAt(map, sx, sz), z: sz, spread: 0.4, speed: 1.5, boost }, 1)
          }
          return
        }
        case Shell.FieldGas:
          emit(field.flash, at(ground + 0.5, 0, 0), 1)
          emit(gas, at(ground + 0.6, 1.2, 1.5), 6)
          emit(field.column, at(ground, 0.6, 5), 3)
          emit(field.earth, at(ground, 0.6, 6), 6)
          return
        case Shell.Grenade:
          emit(field.flash, at(ground + 0.4, 0, 0), 1)
          emit(field.fireball, at(ground + 0.4, 0.3, 1.2), 2)
          emit(field.column, at(ground, 0.4, 5), 4)
          emit(field.earth, at(ground, 0.5, 7), 9)
          emit(field.dust, at(ground + 0.2, 0.5, 5), 6)
          emit(field.smoke, at(ground + 0.5, 0.8, 1.1), 2)
          return
        default: {
          const big = event.shell === Shell.HeavyHighExplosive
          const set = big ? heavy : field
          emit(set.flash, at(ground + 1, 0, 0), 1)
          emit(set.fireball, at(ground + (big ? 2 : 1), big ? 3 : 1.5, big ? 3.5 : 2.5), big ? 14 : 8)
          emit(set.column, at(ground, big ? 2.5 : 1.3, big ? 30 : 19), big ? 44 : 22)
          emit(set.earth, at(ground, big ? 3 : 1.6, big ? 26 : 18), big ? 70 : 34)
          emit(set.dust, at(ground + 0.4, big ? 2.5 : 1.2, big ? 15 : 9), big ? 26 : 16)
          emit(set.smoke, { ...at(ground + 1, big ? 5 : 3, big ? 3 : 2.2), rise: big ? 16 : 8 }, big ? 40 : 20)
          emit(sparks, at(ground + 0.8, 0.5, big ? 18 : 12), big ? 30 : 16)
        }
      }
    },
    update() {
      // Smoke and dust drift with the wind once their own push has gone.
      const { x, z } = wind()
      for (const each of drifting) {
        each.system.gravity.set(x * 0.25, each === airburst ? 0.05 : 0.15, z * 0.25)
      }
    },
    dispose() {
      for (const system of systems) {
        system.dispose()
      }
    }
  }
}
