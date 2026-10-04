import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { Constants } from "@babylonjs/core/Engines/constants"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Observable } from "@babylonjs/core/Misc/observable"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { isInTrench, type ShotEvent, Side, type Simulation, Weapon, wireAt } from "@verdun/sim"
import { airLight, lightParticles, setInFog } from "../level/particle-light.ts"
import type { GraphicsQuality } from "../settings/graphics.ts"
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
/** A round striking within this far of a trench's edge, outside it, hits its parapet: sandbags and thrown-up earth. */
const PARAPET = 2.5
/** Barbed wire stands about this high: a round crossing a belt lower than this, in metres, hits it. */
const WIRE_HEIGHT = 1
/** A miss is followed this many metres at a time, for wire and ground in its way. */
const FOLLOW_STEP = 2
/**
 * Machine guns heat as they fire, a round at a time, and cool at `cools` rounds a second. The German MG 08's water
 * jacket boils after about `boils` rounds of steady fire and steams `puffs` times a second until it cools; the French
 * Hotchkiss, cooled by air through its finned barrel, smokes faintly instead. Shortened from the hundreds of rounds it
 * took in truth, so a long burst in a battle shows it.
 */
const HEAT = { boils: 60, cools: 4, most: 150, puffs: 3 } as const

interface Round {
  readonly from: Vector3
  /** Unit vector along the flight. */
  readonly along: Vector3
  /** Metres to where it stops: its man, the ground, or out of sight. */
  readonly range: number
  readonly tracer: boolean
  /** What it strikes where it stops, kicking up dirt, dust or sparks; null if it stops at its man or flies on. */
  readonly strikes: StrikeOn | null
  flown: number
}

interface Flash {
  readonly at: Vector3
  readonly size: number
  readonly roll: number
  age: number
}

/** What a round strikes: earth, a belt of wire, or the sandbags of a parapet. */
export type StrikeOn = "ground" | "wire" | "parapet"

/** A round striking the ground, as the dirt is kicked up: where, what it hit, and when on the effect's clock, in seconds. */
export interface Strike {
  readonly at: Vector3
  readonly on: StrikeOn
  readonly time: number
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
  /** Sparks off wire, dust off sandbags, and steam off a water-cooled machine gun firing hard. */
  readonly sparks: ParticleSystem
  readonly dust: ParticleSystem
  readonly steam: ParticleSystem
  /** How hot each machine gun is, in rounds of steady fire, by its gunner. */
  readonly heat: ReadonlyMap<number, number>
  /** Rounds in flight. */
  readonly rounds: number
  /**
   * Fires as each round strikes the ground, wherever it is (dirt is drawn only near the camera): for the thud of the
   * impact, in step with what's seen. `time` counts the seconds `update` has been given.
   */
  readonly onStrike: Observable<Strike>
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
  /** The graphics setting: "low" kicks up no muzzle smoke and less dirt. */
  readonly quality?: GraphicsQuality
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
  const low = sources.quality === "low"
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
  // Sparks: hot steel off wire, too quick and bright for the fog or the dark to dim.
  const sparks = puffs(scene, "wire-sparks", 400, puffMap)
  sparks.blendMode = ParticleSystem.BLENDMODE_ADD
  sparks.minSize = 0.04
  sparks.maxSize = 0.09
  sparks.minLifeTime = 0.08
  sparks.maxLifeTime = 0.3
  sparks.minEmitPower = 2
  sparks.maxEmitPower = 6
  sparks.direction1 = new Vector3(-1, 0.4, -1)
  sparks.direction2 = new Vector3(1, 1.2, 1)
  sparks.gravity = new Vector3(0, -9.8, 0)
  sparks.color1 = new Color4(2.2, 1.7, 0.9, 1)
  sparks.color2 = new Color4(2, 1.1, 0.4, 1)
  sparks.colorDead = new Color4(0.8, 0.2, 0, 0)
  // Dust: sandbags burst and the parapet's dry earth flies, paler and puffier than the field's mud.
  const dust = puffs(scene, "parapet-dust", 800, puffMap)
  dust.minSize = 0.3
  dust.maxSize = 0.6
  dust.addSizeGradient(0, 0.6)
  dust.addSizeGradient(1, 2.6)
  dust.minLifeTime = 0.8
  dust.maxLifeTime = 1.6
  dust.minEmitPower = 0.6
  dust.maxEmitPower = 1.6
  dust.direction1 = new Vector3(-0.5, 0.8, -0.5)
  dust.direction2 = new Vector3(0.5, 1.2, 0.5)
  dust.gravity = new Vector3(0, -1.5, 0)
  dust.color1 = new Color4(0.72, 0.67, 0.56, 0.6)
  dust.color2 = new Color4(0.64, 0.6, 0.5, 0.45)
  dust.colorDead = new Color4(0.62, 0.58, 0.5, 0)
  // Steam: the water jacket boiling over through its vent, white and rising, drifting off on the wind.
  const steam = puffs(scene, "gun-steam", 400, puffMap)
  steam.minSize = 0.35
  steam.maxSize = 0.6
  steam.addSizeGradient(0, 0.5)
  steam.addSizeGradient(1, 3)
  steam.minLifeTime = 1.4
  steam.maxLifeTime = 2.6
  steam.minEmitPower = 0.4
  steam.maxEmitPower = 0.9
  steam.direction1 = new Vector3(-0.2, 1, -0.2)
  steam.direction2 = new Vector3(0.2, 1, 0.2)
  steam.color1 = new Color4(0.94, 0.95, 0.97, 0.4)
  steam.color2 = new Color4(0.88, 0.9, 0.93, 0.3)
  steam.colorDead = new Color4(0.85, 0.87, 0.9, 0)
  const relight = lightParticles([smoke, dirt, dust, steam])
  setInFog([smoke, dirt, dust, steam])
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
  /** Starts a system's particles at the points queued for it, one a particle, in turn. */
  const queued = (system: ParticleSystem): Vector3[] => {
    const queue: Vector3[] = []
    let last = Vector3.Zero()
    system.startPositionFunction = (_world, position) => {
      last = queue.shift() ?? last
      position.copyFrom(last)
    }
    return queue
  }
  const sparksAt = queued(sparks)
  const dustAt = queued(dust)
  const steamAt = queued(steam)
  const emit = (system: ParticleSystem, queue: Vector3[], at: Vector3, count: number) => {
    for (let particle = 0; particle < count; particle++) {
      queue.push(at)
    }
    system.manualEmitCount = Math.max(0, system.manualEmitCount) + count
  }

  const onStrike = new Observable<Strike>()
  let clock = 0
  let rounds: Round[] = []
  let flashing: Flash[] = []
  const fired = new Map<number, number>()
  const heat = new Map<number, number>()
  let steamOwed = 0
  let shotCount = 0
  const { sim, camera } = sources

  const near = (point: Vector3) => {
    const target = camera.getTarget()
    return Math.abs(point.x - target.x) < NEAR && Math.abs(point.z - target.z) < NEAR
  }

  /** What a round striking the ground there hits: a parapet if a trench's edge is near, else plain earth. */
  const strikeOn = (at: Vector3): StrikeOn => {
    if (isInTrench(sim.map, at.x, at.z)) {
      return "ground"
    }
    const besideTrench = [
      [PARAPET, 0],
      [-PARAPET, 0],
      [0, PARAPET],
      [0, -PARAPET]
    ].some(([dx, dz]) => isInTrench(sim.map, at.x + (dx ?? 0), at.z + (dz ?? 0)))
    return besideTrench ? "parapet" : "ground"
  }

  /** Where a miss stops: on past its man, scattered, until it meets the ground or flies out of sight. */
  const missEnd = (from: Vector3, to: Vector3, shot: number): { end: Vector3; strikes: StrikeOn | null } => {
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
    // Followed all the way, a couple of metres at a time: it stops where it first meets the ground, a rise in between
    // or the ground round its man, and hits the wire of any belt it crosses within a metre of the ground.
    for (let flown = 1; flown <= reach; flown += FOLLOW_STEP) {
      const point = from.add(along.scale(flown))
      const ground = heightAt(sim.map, point.x, point.z)
      if (point.y <= ground + 0.05) {
        return { end: point, strikes: strikeOn(point) }
      }
      if (point.y - ground < WIRE_HEIGHT && wireAt(sim.wire, point.x, point.z) > 0) {
        return { end: point, strikes: "wire" }
      }
    }
    return { end: from.add(along.scale(reach)), strikes: null }
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
    sparks,
    dust,
    steam,
    heat,
    get rounds() {
      return rounds.length
    },
    onStrike,
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
        if (machineGun) {
          heat.set(event.shooter, Math.min(HEAT.most, (heat.get(event.shooter) ?? 0) + 1))
        }
        const { end, strikes } = event.hit ? { end: to, strikes: null } : missEnd(muzzle, to, shotCount)
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
          if (!low) {
            emit(smoke, smokeAt, muzzle, 2)
          }
        }
      }
      // A gun fires again long before old rounds land; keep the list from growing without bound under heavy fire.
      if (rounds.length > 1024) {
        rounds = rounds.slice(-1024)
      }
    },
    update(frameSeconds) {
      clock += frameSeconds
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
      steam.gravity.set(sim.wind.x * 0.15, 0.4, sim.wind.z * 0.15)

      // Machine guns cool between bursts; a German gun boiling steams, a French one smokes faintly from its barrel.
      steamOwed += frameSeconds * HEAT.puffs * (low ? 0.5 : 1)
      const puffsNow = Math.floor(steamOwed)
      steamOwed -= puffsNow
      for (const [gunner, warmth] of heat) {
        const cooled = warmth - HEAT.cools * frameSeconds
        if (cooled <= 0) {
          heat.delete(gunner)
          continue
        }
        heat.set(gunner, cooled)
        if (cooled < HEAT.boils || puffsNow === 0) {
          continue
        }
        const x = sim.soldiers.position.x[gunner] ?? 0
        const z = sim.soldiers.position.z[gunner] ?? 0
        const at = new Vector3(x, heightAt(sim.map, x, z) + 1, z)
        if (!near(at)) {
          continue
        }
        if (sim.soldiers.side.value[gunner] === Side.German) {
          emit(steam, steamAt, at, puffsNow)
        } else if (!low) {
          emit(smoke, smokeAt, at, puffsNow)
        }
      }

      // Fly the rounds: the head moves at the bullet's speed, the tail follows a streak behind, stopping at the end.
      let streaks = 0
      let lit = 0
      instances.reserve(rounds.length)
      tracerInstances.reserve(rounds.length)
      rounds = rounds.filter((round) => {
        const before = round.flown
        round.flown += BULLET_SPEED * frameSeconds
        if (before < round.range && round.flown >= round.range && round.strikes !== null) {
          const at = round.from.add(round.along.scale(round.range))
          const on = round.strikes
          if (near(at)) {
            if (on === "wire") {
              emit(sparks, sparksAt, at, low ? 3 : 6)
              emit(dirt, dirtAt, at, 1)
            } else if (on === "parapet") {
              emit(dust, dustAt, at, low ? 2 : 4)
            } else {
              emit(dirt, dirtAt, at, low ? 2 : 5)
            }
          }
          onStrike.notifyObservers({ at, on, time: clock })
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
      onStrike.clear()
      smoke.dispose()
      dirt.dispose()
      sparks.dispose()
      dust.dispose()
      steam.dispose()
      for (const map of [streakMap, flashMap, puffMap]) {
        map.dispose()
      }
    }
  }
}
