import { type BattlefieldMap, heightAt, mapDepth, mapWidth, type SceneryKind } from "@verdun/map"
import type { EntityId } from "bitecs"
import type { Simulation } from "./simulation.ts"
import { slopeCost, surfacePace } from "./terrain.ts"
import { wireAt, wirePace } from "./wire.ts"

/** Navigation grid cell size, in metres: fine enough for gaps in the wire and lanes between ruins. */
export const NAV_CELL = 2
/** At most this often, in seconds, the costs are rebuilt after shells have cut wire. */
const REFRESH_SECONDS = 10
/** A straight line is walked as is unless some cell on it costs this many times firm ground: wire, ruins, a pool. */
const CLEAR_COST = 3
/** How far along the field a soldier looks for the furthest point he can walk to straight, in cells. */
const LOOKAHEAD = 12
/** At most this many flow fields are kept; the least recently used goes first. */
const MAX_FIELDS = 12

/**
 * What stands in the way on the battlefield, by kind: how far around it reaches, in metres (times the scenery's scale),
 * and what crossing it costs, as a multiple of firm ground (Infinity for impassable).
 */
const OBSTACLES: Partial<Record<SceneryKind, { readonly radius: number; readonly cost: number }>> = {
  ruin: { radius: 4, cost: Infinity },
  wall: { radius: 1.5, cost: Infinity },
  bunker: { radius: 3, cost: Infinity },
  gun: { radius: 2.2, cost: Infinity },
  "wrecked-gun": { radius: 2.2, cost: Infinity },
  "wrecked-plane": { radius: 4, cost: Infinity },
  stores: { radius: 2, cost: Infinity },
  "machine-gun": { radius: 1.5, cost: 4 },
  rubble: { radius: 2.5, cost: 2.5 },
  log: { radius: 1, cost: 3 },
  tree: { radius: 0.6, cost: Infinity },
  stump: { radius: 0.5, cost: 2 },
  // Wading through a flooded shell hole: possible, but slow and cold.
  pool: { radius: 1, cost: 4 }
}

/** Where soldiers are heading: across a line (an objective, a place behind a barrage), or to a point. */
export type NavGoal =
  | { readonly kind: "line"; readonly z: number; readonly direction: number }
  | { readonly kind: "point"; readonly x: number; readonly z: number; readonly radius: number }

interface NavState {
  readonly columns: number
  readonly rows: number
  /** Cost of walking through each cell, as a multiple of firm ground; Infinity where it can't be walked. */
  readonly cost: Float32Array
  /** Ground height at each cell's centre, for slopes between cells. */
  readonly height: Float32Array
  /** Cost of the static obstacles alone, laid once per map. */
  readonly obstacles: Float32Array
  /** 1 where a cell has any wire in it, so straight walks only check the wire closely where there is some. */
  readonly wired: Uint8Array
  builtAt: number
  /** The wire's cut count when the costs were last built. */
  builtForCuts: number
  readonly fields: Map<string, Float32Array>
}

const states = new WeakMap<Simulation, NavState>()

function goalKey(goal: NavGoal): string {
  return goal.kind === "line"
    ? `line ${goal.direction > 0 ? 1 : -1} ${Math.round(goal.z / NAV_CELL)}`
    : `point ${Math.round(goal.x / NAV_CELL)} ${Math.round(goal.z / NAV_CELL)} ${Math.round(goal.radius)}`
}

function layObstacles(map: BattlefieldMap, columns: number, rows: number): Float32Array {
  const obstacles = new Float32Array(columns * rows).fill(1)
  for (const scenery of map.scenery) {
    const obstacle = OBSTACLES[scenery.kind]
    if (!obstacle) {
      continue
    }
    const radius = scenery.kind === "pool" ? scenery.scale : obstacle.radius * scenery.scale
    const minColumn = Math.max(0, Math.floor((scenery.x - radius) / NAV_CELL))
    const maxColumn = Math.min(columns - 1, Math.floor((scenery.x + radius) / NAV_CELL))
    const minRow = Math.max(0, Math.floor((scenery.z - radius) / NAV_CELL))
    const maxRow = Math.min(rows - 1, Math.floor((scenery.z + radius) / NAV_CELL))
    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        const dx = (column + 0.5) * NAV_CELL - scenery.x
        const dz = (row + 0.5) * NAV_CELL - scenery.z
        if (dx * dx + dz * dz <= radius * radius) {
          const cell = row * columns + column
          obstacles[cell] = Math.max(obstacles[cell] ?? 1, obstacle.cost)
        }
      }
    }
  }
  return obstacles
}

/** Rebuilds every cell's cost from the ground as it is now: surface, duckboards, obstacles and the wire. */
function rebuild(sim: Simulation, state: NavState): void {
  const { map } = sim
  const quarter = NAV_CELL / 4
  for (let row = 0; row < state.rows; row++) {
    for (let column = 0; column < state.columns; column++) {
      const cell = row * state.columns + column
      const x = (column + 0.5) * NAV_CELL
      const z = (row + 0.5) * NAV_CELL
      state.height[cell] = heightAt(map, x, z)
      // Wire is finer than the grid: average a few points, so a lane through it shows as passable ground.
      const wire =
        (wirePace(sim.wire, x - quarter, z - quarter) +
          wirePace(sim.wire, x + quarter, z - quarter) +
          wirePace(sim.wire, x - quarter, z + quarter) +
          wirePace(sim.wire, x + quarter, z + quarter)) /
        4
      state.cost[cell] = (state.obstacles[cell] ?? 1) / (surfacePace(map, x, z) * wire)
      state.wired[cell] =
        wireAt(sim.wire, x - quarter, z - quarter) +
          wireAt(sim.wire, x + quarter, z - quarter) +
          wireAt(sim.wire, x - quarter, z + quarter) +
          wireAt(sim.wire, x + quarter, z + quarter) +
          wireAt(sim.wire, x, z) >
        0
          ? 1
          : 0
    }
  }
  state.builtAt = sim.tick
  state.builtForCuts = sim.wire.cuts
  state.fields.clear()
}

function navState(sim: Simulation): NavState {
  let state = states.get(sim)
  if (!state) {
    const columns = Math.max(1, Math.ceil(mapWidth(sim.map) / NAV_CELL))
    const rows = Math.max(1, Math.ceil(mapDepth(sim.map) / NAV_CELL))
    state = {
      columns,
      rows,
      cost: new Float32Array(columns * rows),
      height: new Float32Array(columns * rows),
      obstacles: layObstacles(sim.map, columns, rows),
      wired: new Uint8Array(columns * rows),
      builtAt: 0,
      builtForCuts: 0,
      fields: new Map()
    }
    states.set(sim, state)
    rebuild(sim, state)
  } else if (sim.wire.cuts !== state.builtForCuts && sim.tick - state.builtAt >= REFRESH_SECONDS * 20) {
    // Twenty steps a second; a literal, since importing TICK_RATE here would be circular at load time.
    rebuild(sim, state)
  }
  return state
}

/** A binary min-heap of cells by distance, for Dijkstra. */
function createHeap() {
  const cells: number[] = []
  const keys: number[] = []
  return {
    get size() {
      return cells.length
    },
    push(cell: number, key: number) {
      let index = cells.length
      cells.push(cell)
      keys.push(key)
      while (index > 0) {
        const parent = (index - 1) >> 1
        if ((keys[parent] ?? 0) <= key) {
          break
        }
        cells[index] = cells[parent] ?? 0
        keys[index] = keys[parent] ?? 0
        index = parent
      }
      cells[index] = cell
      keys[index] = key
    },
    pop(): number {
      const top = cells[0] ?? -1
      const lastCell = cells.pop() ?? 0
      const lastKey = keys.pop() ?? 0
      if (cells.length > 0) {
        let index = 0
        for (;;) {
          const left = index * 2 + 1
          const right = left + 1
          let smallest = index
          let smallestKey = lastKey
          if (left < cells.length && (keys[left] ?? 0) < smallestKey) {
            smallest = left
            smallestKey = keys[left] ?? 0
          }
          if (right < cells.length && (keys[right] ?? 0) < smallestKey) {
            smallest = right
            smallestKey = keys[right] ?? 0
          }
          if (smallest === index) {
            break
          }
          cells[index] = cells[smallest] ?? 0
          keys[index] = keys[smallest] ?? 0
          index = smallest
        }
        cells[index] = lastCell
        keys[index] = lastKey
      }
      return top
    }
  }
}

const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2]
] as const

/** Time to walk from each cell to the goal, walking through cheaper ground where it can: a flow field. */
function flowField(state: NavState, goal: NavGoal): Float32Array {
  const { columns, rows, cost, height } = state
  const distance = new Float32Array(columns * rows).fill(Infinity)
  const heap = createHeap()
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = (column + 0.5) * NAV_CELL
      const z = (row + 0.5) * NAV_CELL
      const reached =
        goal.kind === "line"
          ? (z - goal.z) * goal.direction >= 0
          : (x - goal.x) ** 2 + (z - goal.z) ** 2 <= goal.radius ** 2
      const cell = row * columns + column
      if (reached && Number.isFinite(cost[cell] ?? Infinity)) {
        distance[cell] = 0
        heap.push(cell, 0)
      }
    }
  }
  while (heap.size > 0) {
    const cell = heap.pop()
    const here = distance[cell] ?? Infinity
    const column = cell % columns
    const row = Math.floor(cell / columns)
    for (const [dc, dr, length] of NEIGHBOURS) {
      const c = column + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= columns || r >= rows) {
        continue
      }
      const next = r * columns + c
      const through = ((cost[cell] ?? Infinity) + (cost[next] ?? Infinity)) / 2
      if (!Number.isFinite(through)) {
        continue
      }
      // The field runs from the goal outward, so the walk is from `next` to `cell`: its slope is that way round.
      const run = length * NAV_CELL
      const grade = ((height[cell] ?? 0) - (height[next] ?? 0)) / run
      const total = here + run * through * slopeCost(grade)
      if (total < (distance[next] ?? Infinity)) {
        distance[next] = total
        heap.push(next, total)
      }
    }
  }
  return distance
}

function field(state: NavState, goal: NavGoal): Float32Array {
  const key = goalKey(goal)
  const cached = state.fields.get(key)
  if (cached) {
    // Most recently used last.
    state.fields.delete(key)
    state.fields.set(key, cached)
    return cached
  }
  const made = flowField(state, goal)
  state.fields.set(key, made)
  if (state.fields.size > MAX_FIELDS) {
    const oldest = state.fields.keys().next().value
    if (oldest !== undefined) {
      state.fields.delete(oldest)
    }
  }
  return made
}

function cellAt(state: NavState, x: number, z: number): number {
  const column = Math.min(state.columns - 1, Math.max(0, Math.floor(x / NAV_CELL)))
  const row = Math.min(state.rows - 1, Math.max(0, Math.floor(z / NAV_CELL)))
  return row * state.columns + column
}

/** A straight walk snags on wire this intact or worse, as a fraction of walking pace. */
const WIRE_SNAG = 0.5

/**
 * Whether a straight walk between two points crosses nothing dear: no ruins or pools in the way, and no wire. Wire is
 * checked at its own finer grain, so a walk past the edge of a gap doesn't clip the tangles.
 */
function clearLine(sim: Simulation, state: NavState, fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  const dx = toX - fromX
  const dz = toZ - fromZ
  const steps = Math.ceil(Math.sqrt(dx * dx + dz * dz) / 0.5)
  for (let step = 1; step <= steps; step++) {
    const along = step / steps
    const x = fromX + dx * along
    const z = fromZ + dz * along
    const cell = cellAt(state, x, z)
    if (!((state.obstacles[cell] ?? Infinity) < CLEAR_COST)) {
      return false
    }
    if (state.wired[cell] === 1 && wirePace(sim.wire, x, z) < WIRE_SNAG) {
      return false
    }
  }
  return true
}

/**
 * Where a soldier should walk next to reach `target`, which lies in `goal`: straight there when the way is clear,
 * otherwise to the furthest point along the cheapest route that he can walk to in a straight line, round ruins and
 * through gaps in the wire. Recomputed every time a squad takes stock, so the route bends smoothly.
 */
export function nextWaypoint(
  sim: Simulation,
  soldier: EntityId,
  target: { readonly x: number; readonly z: number },
  goal: NavGoal
): { x: number; z: number } {
  const state = navState(sim)
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  if (clearLine(sim, state, x, z, target.x, target.z)) {
    return { x: target.x, z: target.z }
  }
  const distance = field(state, goal)
  let cell = cellAt(state, x, z)
  if (!Number.isFinite(distance[cell] ?? Infinity)) {
    // Nowhere to go from here (inside a ruin's footprint, say): head straight for it and let the ground sort it out.
    return { x: target.x, z: target.z }
  }
  // Start from the middle of his own cell, which lies on the cheap route; step on along it while he can still walk
  // there in a straight line.
  const centre = (of: number) => ({
    x: ((of % state.columns) + 0.5) * NAV_CELL,
    z: (Math.floor(of / state.columns) + 0.5) * NAV_CELL
  })
  let best = centre(cell)
  for (let step = 0; step < LOOKAHEAD; step++) {
    const column = cell % state.columns
    const row = Math.floor(cell / state.columns)
    let next = cell
    for (const [dc, dr] of NEIGHBOURS) {
      const c = column + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= state.columns || r >= state.rows) {
        continue
      }
      const candidate = r * state.columns + c
      if ((distance[candidate] ?? Infinity) < (distance[next] ?? Infinity)) {
        next = candidate
      }
    }
    if (next === cell) {
      break
    }
    cell = next
    const point = centre(cell)
    if (!clearLine(sim, state, x, z, point.x, point.z)) {
      break
    }
    best = point
  }
  return best
}
