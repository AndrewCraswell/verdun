import { mapDepth, mapWidth } from "@verdun/map"
import { addComponent, type EntityId, hasComponent, query, removeComponent } from "bitecs"
import { clearOfScenery } from "./body.ts"
import { Stance } from "./components.ts"
import type { Simulation } from "./simulation.ts"
import { WIRE_CELL, wireAt } from "./wire.ts"

/**
 * Seconds a man with the issue cutters takes to clear a square metre of intact belt: each strand gripped, snipped and
 * folded back, quietly, crouched low. A lane through a belt 3.4 m deep takes him about a quarter of a minute.
 */
export const CUT_SECONDS = 4
/** He cuts the wire within arm's reach ahead of him, in metres. */
const REACH = 1
/** He sets to cutting wire this near ahead of him, in metres, edging up to it: as near as he climbs a fence from. */
const START = 2
/** Wire this far ahead is the belt he's cutting through still, in metres: he edges on into his lane to reach it. */
const LOOK = 2.5
/** Metres a second he edges forward into the lane he's cut. */
const EDGE = 0.5
/** The way ahead is looked along in steps this long, in metres. */
const STEP = 0.25
/** Wire this thin or thinner is cut through (as for walking: wire.ts). */
const CLEAR = 0.15
/** A cell cut through is torn out of the wire's art this far round its middle, in metres. */
const TEAR = 0.7
/** The lane through a belt is looked along this far ahead of him, in metres: deeper than any belt. */
const LANE = 8

/** The first point along `heading` from (x, z), within `reach` metres, where there's wire still to cut; or null. */
function wireAhead(
  sim: Simulation,
  x: number,
  z: number,
  heading: { readonly x: number; readonly z: number },
  reach: number
): { x: number; z: number } | null {
  for (let distance = 0; distance <= reach; distance += STEP) {
    const point = { x: x + heading.x * distance, z: z + heading.z * distance }
    if (wireAt(sim.wire, point.x, point.z) > CLEAR) {
      return point
    }
  }
  return null
}

/**
 * The cutting left to do in the lane from (x, z) along `heading` through the belt ahead, in seconds: each cell's wire,
 * once, until the belt gives out (no wire for `LOOK` metres) or `LANE` metres on.
 */
function laneWork(sim: Simulation, x: number, z: number, heading: { readonly x: number; readonly z: number }): number {
  const cells = new Set<number>()
  let work = 0
  let lastWire = -1
  for (let distance = 0; distance <= LANE; distance += STEP) {
    if (lastWire >= 0 && distance - lastWire > LOOK) {
      break
    }
    const px = x + heading.x * distance
    const pz = z + heading.z * distance
    const density = wireAt(sim.wire, px, pz)
    if (density <= CLEAR) {
      continue
    }
    lastWire = distance
    const cell = Math.floor(pz / WIRE_CELL) * sim.wire.columns + Math.floor(px / WIRE_CELL)
    if (!cells.has(cell)) {
      cells.add(cell)
      work += (density - CLEAR) * CUT_SECONDS
    }
  }
  return work
}

/** The way a soldier faces, as a unit vector, or null. */
function facingOf(sim: Simulation, soldier: EntityId): { x: number; z: number } | null {
  const x = sim.soldiers.facing.x[soldier]
  const z = sim.soldiers.facing.z[soldier]
  const length = Math.sqrt(x * x + z * z)
  return length > 0 ? { x: x / length, z: z / length } : null
}

/** Whether a soldier has wire within reach ahead of him to cut, the way `toward` points or else the way he faces. */
export function canCut(
  sim: Simulation,
  soldier: EntityId,
  toward?: { readonly x: number; readonly z: number }
): boolean {
  const heading = toward ?? facingOf(sim, soldier)
  return (
    heading !== null &&
    wireAhead(sim, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier], heading, START) !== null
  )
}

/** Whether a soldier is cutting wire. */
export function isCutting(sim: Simulation, soldier: EntityId): boolean {
  return hasComponent(sim.world, soldier, sim.soldiers.cutting)
}

/**
 * Sets a soldier cutting a lane through the wire ahead of him, the way `toward` points or else the way he faces, or
 * stops him if he already is. He crouches to it and keeps on, edging forward into his lane, until he's through the belt,
 * he moves or he's hit. Whether he's cutting now.
 */
export function toggleCutting(
  sim: Simulation,
  soldier: EntityId,
  toward?: { readonly x: number; readonly z: number }
): boolean {
  const { cutting, stance, vault } = sim.soldiers
  if (isCutting(sim, soldier)) {
    removeComponent(sim.world, soldier, cutting)
    return false
  }
  const heading = toward ?? facingOf(sim, soldier)
  if (!heading || hasComponent(sim.world, soldier, vault) || !canCut(sim, soldier, heading)) {
    return false
  }
  addComponent(sim.world, soldier, cutting)
  cutting.x[soldier] = heading.x
  cutting.z[soldier] = heading.z
  cutting.total[soldier] = laneWork(sim, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier], heading)
  cutting.progress[soldier] = 0
  removeComponent(sim.world, soldier, sim.soldiers.moveOrder)
  stance.value[soldier] = Stance.Crouching
  return true
}

/**
 * Men cutting wire snip at the wire within reach ahead of them; once a cell is cut through it's cleared, and they edge
 * on into the lane while the belt goes on. A man who's steered away, climbs or falls stops.
 */
export function cuttingSystem(sim: Simulation, stepSeconds: number): void {
  const { position, cutting, steer, facing, vault, dead, captured } = sim.soldiers
  const field = sim.wire
  const stopped: EntityId[] = []
  for (const soldier of query(sim.world, [position, cutting])) {
    const steered = hasComponent(sim.world, soldier, steer) && (steer.x[soldier] !== 0 || steer.z[soldier] !== 0)
    if (
      hasComponent(sim.world, soldier, dead) ||
      hasComponent(sim.world, soldier, captured) ||
      steered ||
      hasComponent(sim.world, soldier, vault)
    ) {
      stopped.push(soldier)
      continue
    }
    const heading = { x: cutting.x[soldier], z: cutting.z[soldier] }
    facing.x[soldier] = heading.x
    facing.z[soldier] = heading.z
    const x = position.x[soldier]
    const z = position.z[soldier]
    const at = wireAhead(sim, x, z, heading, REACH)
    if (at) {
      const cell = Math.floor(at.z / WIRE_CELL) * field.columns + Math.floor(at.x / WIRE_CELL)
      const left = (field.density[cell] ?? 0) - stepSeconds / CUT_SECONDS
      field.density[cell] = left > CLEAR ? left : 0
      const total = cutting.total[soldier]
      if (total > 0) {
        cutting.progress[soldier] = Math.min(
          1,
          Math.max(cutting.progress[soldier], 1 - laneWork(sim, x, z, heading) / total)
        )
      }
      if (left > CLEAR) {
        continue
      }
      field.cuts++
      sim.events.push({
        type: "wire-cut",
        x: (Math.floor(at.x / WIRE_CELL) + 0.5) * WIRE_CELL,
        z: (Math.floor(at.z / WIRE_CELL) + 0.5) * WIRE_CELL,
        radius: TEAR
      })
      continue
    }
    if (!wireAhead(sim, x, z, heading, LOOK)) {
      stopped.push(soldier)
      continue
    }
    const stride = EDGE * stepSeconds
    const clear = clearOfScenery(sim.map, x + heading.x * stride, z + heading.z * stride)
    position.x[soldier] = Math.min(mapWidth(sim.map), Math.max(0, clear.x))
    position.z[soldier] = Math.min(mapDepth(sim.map), Math.max(0, clear.z))
  }
  for (const soldier of stopped) {
    removeComponent(sim.world, soldier, cutting)
  }
}
