import { sampleIndex, Surface as Ground } from "@verdun/map"
import { type EntityId, isAlive, isInTrench, type Simulation, soldierIds, Stance } from "@verdun/sim"
import { inPool, isSodden, type Listener, placeSound, type SoundCall } from "./battle-sound-model.ts"

/** Footsteps are heard only with the camera this low, from men within FOOT_RANGE metres of where it looks. */
const FOOT_HEIGHT = 60
const FOOT_RANGE = 18
/** A step every this many metres walked. */
const STRIDE = 0.75
/** Men are checked this often, in steps, and at most MAX_STEPS footsteps start each time. */
const FOOT_INTERVAL = 2
const MAX_STEPS = 4
/** A man covering this much ground between checks (0.1 s) is running, and his kit rattles with each stride. */
const RUNNING = 0.3
/** Snow this deep, in millimetres of water, lies thick enough to crunch underfoot. */
const SNOW_DEPTH = 2
/** Ruins this dense put stones and rubble underfoot. */
const STONY = 0.5

/** What a man treads on, each a cue for walking (step-*) and for running (run-*). */
export type Surface = "mud" | "wood" | "gravel" | "snow" | "grass" | "water"

/**
 * What a man walking at (x, z) treads on: water in a shell hole's pool or a flooded trench, snow when it lies, the
 * duckboards along a trench floor, the ruins' rubble, mud where the ground is mud or sodden, grass, and otherwise the
 * shell-torn ground and chalk, which crunch like gravel.
 */
export function surfaceAt(sim: Simulation, ruins: (x: number, z: number) => number, x: number, z: number): Surface {
  const trench = isInTrench(sim.map, x, z)
  const sodden = isSodden(sim)
  if (inPool(sim, x, z) || (trench && sodden)) {
    return "water"
  }
  if (sim.environment.weather.snowCover >= SNOW_DEPTH) {
    return "snow"
  }
  if (trench) {
    return "wood"
  }
  if (ruins(x, z) >= STONY) {
    return "gravel"
  }
  const { cellSize, columns, rows } = sim.map
  const column = Math.max(0, Math.min(columns, Math.round(x / cellSize)))
  const row = Math.max(0, Math.min(rows, Math.round(z / cellSize)))
  const ground = sim.map.surfaces[sampleIndex(sim.map, column, row)]
  if (sodden || ground === Ground.Mud) {
    return "mud"
  }
  return ground === Ground.Grass ? "grass" : "gravel"
}

export interface FootstepModel {
  /** Footsteps of men walking near the listener since the last call. Call after every step. */
  step(listener: Listener): SoundCall[]
}

/**
 * Footsteps of men close to the listener, a step for every stride they walk, on what lies underfoot. Men lying down,
 * down a dugout or fallen make none.
 */
export function createFootstepModel(sim: Simulation, ruins: (x: number, z: number) => number): FootstepModel {
  const walked = new Map<EntityId, { x: number; z: number; since: number }>()
  return {
    step(listener) {
      if (sim.tick % FOOT_INTERVAL !== 0) {
        return []
      }
      if (listener.height > FOOT_HEIGHT) {
        walked.clear()
        return []
      }
      const calls: SoundCall[] = []
      const near = new Set<EntityId>()
      for (const id of soldierIds(sim)) {
        const x = sim.soldiers.position.x[id] ?? 0
        const z = sim.soldiers.position.z[id] ?? 0
        const stance = sim.soldiers.stance.value[id]
        if (
          Math.hypot(x - listener.x, z - listener.z) > FOOT_RANGE ||
          stance !== Stance.Standing ||
          !isAlive(sim, id)
        ) {
          continue
        }
        near.add(id)
        const last = walked.get(id)
        if (!last) {
          walked.set(id, { x, z, since: 0 })
          continue
        }
        const moved = Math.hypot(x - last.x, z - last.z)
        last.since += moved
        last.x = x
        last.z = z
        if (last.since >= STRIDE && calls.length < MAX_STEPS) {
          last.since %= STRIDE
          const running = moved >= RUNNING
          const call = placeSound(listener, `${running ? "run" : "step"}-${surfaceAt(sim, ruins, x, z)}`, x, z)
          if (call) {
            calls.push(call)
          }
          const rattle = running ? placeSound(listener, "gear", x, z) : null
          if (rattle) {
            calls.push(rattle)
          }
        }
      }
      for (const id of walked.keys()) {
        if (!near.has(id)) {
          walked.delete(id)
        }
      }
      return calls
    }
  }
}
