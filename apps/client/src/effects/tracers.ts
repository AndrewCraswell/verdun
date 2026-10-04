import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { Constants } from "@babylonjs/core/Engines/constants"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { type ShotEvent, type Simulation, Weapon } from "@verdun/sim"
import { airLight, lightParticles } from "../level/particle-light.ts"
import { type InstanceBuffer, instanceBuffer } from "./instance-buffer.ts"

/** A rifle or machine-gun bullet's speed, in m/s: fast, but slow enough to watch cross a few hundred metres. */
const BULLET_SPEED = 750
/** Every round leaves a faint streak this long, in metres: the eye's trace of something fast, not a light. */
const STREAK = { length: 5, day: 0.9, night: 1.8 } as const
/**
 * Machine guns fired a tracer round in every few: a burning streak, bright enough to bloom at night. Every
 * `every`th round of each gun, this long.
 */
const TRACER = { every: 4, length: 12, day: 2.2, night: 4.5 } as const
/** The flash at the muzzle: seconds it lasts, its size in metres by weapon, how far in front of the eye it is. */
const FLASH = { seconds: 0.06, rifle: 0.8, machineGun: 1.2, forward: 0.7, drop: 0.12, day: 2.2, night: 4.5 } as const
/** Streaks and flashes are drawn at least this many pixels wide, however far the camera, so they never shimmer. */
const LEAST_PIXELS = 2.5
/**
 * A miss goes past its man: this far to the side per 100 m of range, at least `least`, and on this far beyond. Most
 * fall low, as much as `low` metres times 2.5 below his chest, kicking up the ground round his feet; a fifth go over.
 */
const MISS = { spread: 1.2, least: 0.6, beyond: 0.6, high: 0.8, low: 1.2 } as const
/** Smoke and dirt are kicked up only this close to where the camera looks, in metres. */
const NEAR = 220
const BULLET_COLOR = new Color3(1, 0.86, 0.62)
const TRACER_COLOR = new Color3(1, 0.62, 0.28)
const FLASH_COLOR = new Color3(1, 0.8, 0.45)
/** A machine gun's smoke: one puff in this many rounds. */
const SMOKE_EVERY = 3

interface Round {
  readonly from: Vector3
  /** Unit vector along the flight. */
  readonly along: Vector3
  /** Metres to where it stops: its man, the ground, or out of sight. */
  readonly range: number
  readonly tracer: boolean
  /** Whether it strikes the ground where it stops, kicking up dirt. */
  readonly strikes: boolean
  flown: number
}

interface Flash {
  readonly at: Vector3
  readonly size: number
  readonly roll: number
  age: number
}

export interface Tracers {
  /** Every round's faint streak. */
  readonly mesh: Mesh
  readonly instances: InstanceBuffer
  /** The machine guns' tracer rounds. */
  readonly tracers: Mesh
  /** Muzzle flashes. */
  readonly flashes: Mesh
  /** Muzzle smoke, and the dirt misses kick up. */
  readonly smoke: ParticleSystem
  readonly dirt: ParticleSystem
  /** Rounds in flight. */
  readonly rounds: number
  /** Adds the shots fired in the last simulation steps. */
  add(shots: readonly ShotEvent[]): void
  /** Flies the rounds and redraws them. Call once per frame. */
  update(frameSeconds: number): void
  dispose(): void
}

export interface GunfireSources {
  readonly sim: Simulation
  readonly camera: TargetCamera
  /** How light it is, from 0 (black night) to 1 (noon). */
  light(): number
}

/** A small, fixed hash to 0..1, so the same shot always scatters the same way without touching the simulation's dice. */
function scatter(a: number, b: number): number {
  let h = Math.imul(a * 374_761_393 + b * 668_265_263, 1_274_126_177)
  h = Math.imul(h ^ (h >>> 13), 1_103_515_245)
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296
}

/** A streak's texture: brightest at the head (top), fading down the tail, soft at the sides. */
function streakTexture(scene: Scene): RawTexture {
  const width = 8
  const height = 64
  const pixels = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const across = 1 - Math.abs(((column + 0.5) / width) * 2 - 1)
      const along = (row + 0.5) / height
      const value = Math.round(255 * across ** 1.5 * along ** 1.8)
      pixels.set([255, 255, 255, value], (row * width + column) * 4)
    }
  }
  return texture(scene, "bullet-streak", pixels, width, height)
}

/** A muzzle flash's texture: a hot core with four ragged spikes. */
function flashTexture(scene: Scene): RawTexture {
  const size = 64
  const pixels = new Uint8Array(size * size * 4)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = ((column + 0.5) / size) * 2 - 1
      const y = ((row + 0.5) / size) * 2 - 1
      const radius = Math.sqrt(x * x + y * y)
      const angle = Math.atan2(y, x)
      const spikes = Math.abs(Math.cos(angle * 2)) ** 18 * (1 - radius) * 1.4
      const core = Math.max(0, 1 - radius * 2.2) ** 1.5
      const value = Math.round(255 * Math.min(1, core + Math.max(0, spikes)))
      pixels.set([255, 255, 255, value], (row * size + column) * 4)
    }
  }
  return texture(scene, "muzzle-flash", pixels, size, size)
}

function texture(scene: Scene, name: string, pixels: Uint8Array, width: number, height: number): RawTexture {
  const made = new RawTexture(
    pixels,
    width,
    height,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE
  )
  made.name = name
  made.hasAlpha = true
  made.wrapU = Texture.CLAMP_ADDRESSMODE
  made.wrapV = Texture.CLAMP_ADDRESSMODE
  return made
}

/** A plane drawn in thin instances, by its own light: additive, unlit, fading into the fog with distance. */
function glowing(scene: Scene, name: string, map: RawTexture): Mesh {
  const mesh = CreatePlane(name, { size: 1 }, scene)
  const material = new StandardMaterial(name, scene)
  material.disableLighting = true
  material.emissiveTexture = map
  material.opacityTexture = map
  material.alphaMode = Constants.ALPHA_ADD
  material.disableDepthWrite = true
  material.backFaceCulling = false
  mesh.material = material
  mesh.isPickable = false
  mesh.alwaysSelectAsActiveMesh = true
  return mesh
}

function puffs(scene: Scene, name: string, capacity: number, map: RawTexture): ParticleSystem {
  const system = new ParticleSystem(name, capacity, scene)
  system.particleTexture = map
  system.emitter = Vector3.Zero()
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD
  system.updateSpeed = 1 / 60
  system.emitRate = 0
  system.manualEmitCount = 0
  system.start()
  return system
}

/** A soft round puff for smoke and dirt. */
function puffTexture(scene: Scene): RawTexture {
  const size = 32
  const pixels = new Uint8Array(size * size * 4)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = ((column + 0.5) / size) * 2 - 1
      const y = ((row + 0.5) / size) * 2 - 1
      const value = Math.round(255 * Math.max(0, 1 - Math.sqrt(x * x + y * y)) ** 1.6)
      pixels.set([255, 255, 255, value], (row * size + column) * 4)
    }
  }
  return texture(scene, "gun-puff", pixels, size, size)
}

/**
 * Gunfire as the eye catches it: every round a faint streak flying out at a bullet's speed to where it stops, the
 * machine guns' tracer rounds burning brighter, a flash at each muzzle and a wisp of smoke, and dirt kicked up where a
 * miss strikes the ground beyond its man. Misses scatter past their target from a hash of the shot, not the
 * simulation's dice. Streaks and flashes face the camera and keep at least a pixel or two wide.
 */
export function createTracers(scene: Scene, sources: GunfireSources): Tracers {
  const streakMap = streakTexture(scene)
  const flashMap = flashTexture(scene)
  const puffMap = puffTexture(scene)
  const mesh = glowing(scene, "bullet-streaks", streakMap)
  const tracers = glowing(scene, "tracer-rounds", streakMap)
  const flashes = glowing(scene, "muzzle-flashes", flashMap)
  const instances = instanceBuffer(mesh, 256)
  const tracerInstances = instanceBuffer(tracers, 64)
  const flashInstances = instanceBuffer(flashes, 64)

  // Muzzle smoke: smokeless powder, so a thin grey wisp, more from a machine gun's steady fire.
  const smoke = puffs(scene, "muzzle-smoke", 600, puffMap)
  smoke.minSize = 0.25
  smoke.maxSize = 0.45
  smoke.addSizeGradient(0, 0.6)
  smoke.addSizeGradient(1, 2.6)
  smoke.minLifeTime = 0.8
  smoke.maxLifeTime = 1.8
  smoke.minEmitPower = 0.2
  smoke.maxEmitPower = 0.6
  smoke.direction1 = new Vector3(-0.3, 0.4, -0.3)
  smoke.direction2 = new Vector3(0.3, 1, 0.3)
  smoke.color1 = new Color4(0.78, 0.78, 0.75, 0.28)
  smoke.color2 = new Color4(0.7, 0.7, 0.68, 0.2)
  smoke.colorDead = new Color4(0.6, 0.6, 0.6, 0)
  // Dirt: a spurt of earth where a round strikes, falling back.
  const dirt = puffs(scene, "bullet-dirt", 1500, puffMap)
  dirt.minSize = 0.12
  dirt.maxSize = 0.3
  dirt.addSizeGradient(0, 0.7)
  dirt.addSizeGradient(1, 1.8)
  dirt.minLifeTime = 0.35
  dirt.maxLifeTime = 0.8
  dirt.minEmitPower = 1.5
  dirt.maxEmitPower = 3.5
  dirt.direction1 = new Vector3(-0.35, 1, -0.35)
  dirt.direction2 = new Vector3(0.35, 1, 0.35)
  dirt.gravity = new Vector3(0, -9.8, 0)
  dirt.color1 = new Color4(0.42, 0.35, 0.27, 0.75)
  dirt.color2 = new Color4(0.33, 0.28, 0.22, 0.6)
  dirt.colorDead = new Color4(0.3, 0.26, 0.2, 0)
  const relight = lightParticles([smoke, dirt])
  const airLit = new Color3(1, 1, 1)

  // Where the next puffs start, one entry a particle, taken in turn as Babylon emits them.
  const smokeAt: Vector3[] = []
  const dirtAt: Vector3[] = []
  const lastAt = { smoke: Vector3.Zero(), dirt: Vector3.Zero() }
  smoke.startPositionFunction = (_world, position) => {
    lastAt.smoke = smokeAt.shift() ?? lastAt.smoke
    position.copyFrom(lastAt.smoke)
  }
  dirt.startPositionFunction = (_world, position) => {
    lastAt.dirt = dirtAt.shift() ?? lastAt.dirt
    position.copyFrom(lastAt.dirt)
  }
  const emit = (system: ParticleSystem, queue: Vector3[], at: Vector3, count: number) => {
    for (let particle = 0; particle < count; particle++) {
      queue.push(at)
    }
    system.manualEmitCount = Math.max(0, system.manualEmitCount) + count
  }

  let rounds: Round[] = []
  let flashing: Flash[] = []
  const fired = new Map<number, number>()
  let shotCount = 0
  const { sim, camera } = sources

  const near = (point: Vector3) => {
    const target = camera.getTarget()
    return Math.abs(point.x - target.x) < NEAR && Math.abs(point.z - target.z) < NEAR
  }

  /** Where a miss stops: on past its man, scattered, until it meets the ground or flies out of sight. */
  const missEnd = (from: Vector3, to: Vector3, shot: number): { end: Vector3; strikes: boolean } => {
    const aim = to.subtract(from)
    const distance = aim.length()
    const forward = aim.scale(1 / Math.max(distance, 1e-6))
    const side = new Vector3(-forward.z, 0, forward.x)
    const spread = Math.max(MISS.least, (MISS.spread * distance) / 100)
    const offset = side
      .scale((scatter(shot, 1) * 2 - 1) * spread)
      .add(new Vector3(0, (scatter(shot, 2) - MISS.high) * Math.max(MISS.low, spread) * 2.5, 0))
    const along = to.add(offset).subtract(from).normalize()
    const reach = distance * (1 + MISS.beyond) + 20
    for (let flown = Math.max(1, distance - 3); flown <= reach; flown += 1) {
      const point = from.add(along.scale(flown))
      if (point.y <= heightAt(sim.map, point.x, point.z) + 0.05) {
        return { end: point, strikes: true }
      }
    }
    return { end: from.add(along.scale(reach)), strikes: false }
  }

  const right = new Vector3()
  const lift = new Vector3()
  const toCamera = new Vector3()

  /** A plane stretched between two points, turned to face the camera, at least `least` metres wide. */
  const writeStreak = (data: Float32Array, index: number, tail: Vector3, head: Vector3, width: number): void => {
    const along = head.subtract(tail)
    const mid = tail.add(along.scale(0.5))
    camera.position.subtractToRef(mid, toCamera)
    Vector3.CrossToRef(along, toCamera, right)
    right.normalize()
    Vector3.CrossToRef(right, along, lift)
    lift.normalize()
    const wide = Math.max(width, toCamera.length() * pixelSize() * LEAST_PIXELS)
    data.set(
      [
        right.x * wide,
        right.y * wide,
        right.z * wide,
        0,
        along.x,
        along.y,
        along.z,
        0,
        lift.x,
        lift.y,
        lift.z,
        0,
        mid.x,
        mid.y,
        mid.z,
        1
      ],
      index * 16
    )
  }

  /** The size of a pixel one metre from the camera, in metres. */
  const pixelSize = () => {
    const height = scene.getEngine().getRenderHeight() || 720
    return (2 * Math.tan(camera.fov / 2)) / height
  }

  return {
    mesh,
    instances,
    tracers,
    flashes,
    smoke,
    dirt,
    get rounds() {
      return rounds.length
    },
    add(shots) {
      for (const event of shots) {
        shotCount++
        const machineGun = sim.soldiers.weapon.kind[event.shooter] === Weapon.MachineGun
        const eye = new Vector3(event.from.x, event.from.y, event.from.z)
        const to = new Vector3(event.to.x, event.to.y, event.to.z)
        const aim = to.subtract(eye)
        const distance = aim.length()
        if (distance < 0.5) {
          continue
        }
        const forward = aim.scale(1 / distance)
        const muzzle = eye.add(forward.scale(FLASH.forward)).add(new Vector3(0, -FLASH.drop, 0))
        const { end, strikes } = event.hit ? { end: to, strikes: false } : missEnd(muzzle, to, shotCount)
        const flight = end.subtract(muzzle)
        const count = (fired.get(event.shooter) ?? 0) + 1
        fired.set(event.shooter, count)
        const range = flight.length()
        rounds.push({
          from: muzzle,
          along: flight.scale(1 / Math.max(range, 1e-6)),
          range,
          tracer: machineGun && count % TRACER.every === 0,
          strikes,
          flown: 0
        })
        flashing.push({
          at: muzzle,
          size: machineGun ? FLASH.machineGun : FLASH.rifle,
          roll: scatter(shotCount, 3) * Math.PI,
          age: 0
        })
        if ((!machineGun || count % SMOKE_EVERY === 0) && near(muzzle)) {
          emit(smoke, smokeAt, muzzle, 2)
        }
      }
      // A gun fires again long before old rounds land; keep the list from growing without bound under heavy fire.
      if (rounds.length > 1024) {
        rounds = rounds.slice(-1024)
      }
    },
    update(frameSeconds) {
      const dark = 1 - Math.min(1, Math.max(0, sources.light()))
      const tint = (color: Color3, day: number, night: number) => color.scale(day + (night - day) * dark)
      const materialOf = (each: Mesh) => (each.material instanceof StandardMaterial ? each.material : null)
      const streakMaterial = materialOf(mesh)
      if (streakMaterial) {
        streakMaterial.emissiveColor = tint(BULLET_COLOR, STREAK.day, STREAK.night)
      }
      const tracerMaterial = materialOf(tracers)
      if (tracerMaterial) {
        tracerMaterial.emissiveColor = tint(TRACER_COLOR, TRACER.day, TRACER.night)
      }
      const flashMaterial = materialOf(flashes)
      if (flashMaterial) {
        flashMaterial.emissiveColor = tint(FLASH_COLOR, FLASH.day, FLASH.night)
      }
      relight.update(airLight(scene, airLit))
      smoke.gravity.set(sim.wind.x * 0.12, 0.15, sim.wind.z * 0.12)

      // Fly the rounds: the head moves at the bullet's speed, the tail follows a streak behind, stopping at the end.
      let streaks = 0
      let lit = 0
      instances.reserve(rounds.length)
      tracerInstances.reserve(rounds.length)
      rounds = rounds.filter((round) => {
        const before = round.flown
        round.flown += BULLET_SPEED * frameSeconds
        if (before < round.range && round.flown >= round.range && round.strikes) {
          const at = round.from.add(round.along.scale(round.range))
          if (near(at)) {
            emit(dirt, dirtAt, at, 5)
          }
        }
        const length = round.tracer ? TRACER.length : STREAK.length
        const head = Math.min(round.flown, round.range)
        const tail = Math.max(0, round.flown - length)
        if (tail >= round.range) {
          return false
        }
        const tailPoint = round.from.add(round.along.scale(tail))
        const headPoint = round.from.add(round.along.scale(head))
        if (round.tracer) {
          writeStreak(tracerInstances.data, lit++, tailPoint, headPoint, 0.07)
        } else {
          writeStreak(instances.data, streaks++, tailPoint, headPoint, 0.03)
        }
        return true
      })
      instances.commit(streaks)
      tracerInstances.commit(lit)

      // Muzzle flashes, each shown for at least the frame it was fired in.
      const cameraRight = camera.getDirection(Vector3.Right())
      const cameraUp = camera.getDirection(Vector3.Up())
      const cameraForward = camera.getDirection(Vector3.Forward())
      flashInstances.reserve(flashing.length)
      let shown = 0
      for (const flash of flashing) {
        const cos = Math.cos(flash.roll)
        const sin = Math.sin(flash.roll)
        const across = cameraRight.scale(cos).add(cameraUp.scale(sin))
        const up = cameraUp.scale(cos).subtract(cameraRight.scale(sin))
        const wide = Math.max(flash.size, Vector3.Distance(camera.position, flash.at) * pixelSize() * 3)
        flashInstances.data.set(
          [
            across.x * wide,
            across.y * wide,
            across.z * wide,
            0,
            up.x * wide,
            up.y * wide,
            up.z * wide,
            0,
            cameraForward.x,
            cameraForward.y,
            cameraForward.z,
            0,
            flash.at.x,
            flash.at.y,
            flash.at.z,
            1
          ],
          shown++ * 16
        )
      }
      flashInstances.commit(shown)
      flashing = flashing.filter((flash) => (flash.age += frameSeconds) < FLASH.seconds)
    },
    dispose() {
      for (const each of [mesh, tracers, flashes]) {
        each.dispose(false, true)
      }
      smoke.dispose()
      dirt.dispose()
      for (const map of [streakMap, flashMap, puffMap]) {
        map.dispose()
      }
    }
  }
}
