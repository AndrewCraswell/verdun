import { mapDepth, mapWidth } from "@verdun/map"
import type { EntityId } from "bitecs"
import { type Simulation, soldierIds } from "./simulation.ts"

/** Bucket size, in metres: a few soldiers' spacing in an attack, a squad's frontage in a trench. */
const BUCKET = 16

interface SpatialIndex {
  readonly tick: number
  readonly columns: number
  readonly rows: number
  /** Soldiers in each bucket, in id order. */
  readonly buckets: EntityId[][]
}

const indexes = new WeakMap<Simulation, SpatialIndex>()

/**
 * Where everyone still in the fight stands, bucketed on a grid, rebuilt once a step on first use. Systems ask it who is
 * near a point instead of checking every soldier, which keeps thousands of soldiers affordable. Built from soldiers in
 * id order, so every query visits soldiers in the same order however the world got here.
 */
function spatialIndex(sim: Simulation): SpatialIndex {
  const cached = indexes.get(sim)
  if (cached && cached.tick === sim.tick) {
    return cached
  }
  const columns = Math.max(1, Math.ceil(mapWidth(sim.map) / BUCKET))
  const rows = Math.max(1, Math.ceil(mapDepth(sim.map) / BUCKET))
  const buckets: EntityId[][] = Array.from({ length: columns * rows }, () => [])
  for (const soldier of soldierIds(sim)) {
    buckets[bucketOf(columns, rows, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])]?.push(soldier)
  }
  const index = { tick: sim.tick, columns, rows, buckets }
  indexes.set(sim, index)
  return index
}

function bucketOf(columns: number, rows: number, x: number, z: number): number {
  const column = Math.min(columns - 1, Math.max(0, Math.floor(x / BUCKET)))
  const row = Math.min(rows - 1, Math.max(0, Math.floor(z / BUCKET)))
  return row * columns + column
}

/**
 * Soldiers within `radius` of a point, as they stood at the start of this step. Callers check whether each is still in
 * the fight: some may have fallen or surrendered since.
 */
export function soldiersNear(sim: Simulation, x: number, z: number, radius: number): EntityId[] {
  const { columns, rows, buckets } = spatialIndex(sim)
  const minColumn = Math.max(0, Math.floor((x - radius) / BUCKET))
  const maxColumn = Math.min(columns - 1, Math.floor((x + radius) / BUCKET))
  const minRow = Math.max(0, Math.floor((z - radius) / BUCKET))
  const maxRow = Math.min(rows - 1, Math.floor((z + radius) / BUCKET))
  const near: EntityId[] = []
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      for (const soldier of buckets[row * columns + column] ?? []) {
        const dx = sim.soldiers.position.x[soldier] - x
        const dz = sim.soldiers.position.z[soldier] - z
        if (dx * dx + dz * dz <= radius * radius) {
          near.push(soldier)
        }
      }
    }
  }
  return near
}

/**
 * The `count` nearest soldiers to a point that pass `wanted`, within `maxRadius`, nearest first (ties by id). Searches
 * outward in widening circles, so a crowded front costs little and an empty one still finds someone far off.
 */
export function nearestSoldiers(
  sim: Simulation,
  x: number,
  z: number,
  count: number,
  maxRadius: number,
  wanted: (soldier: EntityId) => boolean
): EntityId[] {
  for (let radius = BUCKET * 2; ; radius *= 2) {
    const reach = Math.min(radius, maxRadius)
    const found = soldiersNear(sim, x, z, reach).filter(wanted)
    if (found.length >= count || reach >= maxRadius) {
      const distance = (soldier: EntityId) =>
        (sim.soldiers.position.x[soldier] - x) ** 2 + (sim.soldiers.position.z[soldier] - z) ** 2
      return found.sort((a, b) => distance(a) - distance(b) || a - b).slice(0, count)
    }
  }
}
