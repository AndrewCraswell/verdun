import { type BattlefieldMap, footprintRadius, heightAt, mapDepth, mapWidth, SCENERY_FOOTPRINTS } from "@verdun/map"
import type { EntityId } from "bitecs"
import { snowDepth, sodden, weatherPace } from "./ground.ts"
import type { Simulation } from "./simulation.ts"
import { slopeCost, surfacePace } from "./terrain.ts"
import { wireAt, wirePace } from "./wire.ts"

/** Navigation grid cell size, in metres: fine enough for gaps in the wire and lanes between ruins. */
export const NAV_CELL = 2
/** At most this often, in seconds, the costs are rebuilt after shells have cut wire or the ground has changed. */
const REFRESH_SECONDS = 10
/**
 * The costs follow the mud and snow once they have changed by this much (0 to 1): a rebuild drops every flow field, so
 * not for each hour's drizzle.
 */
const GROUND_CHANGE = 0.1
/** A straight line is walked as is unless some cell on it costs this many times firm ground: wire, ruins, a pool. */
const CLEAR_COST = 3
/** How far along the field a soldier looks for the furthest point he can walk to straight, in cells. */
const LOOKAHEAD = 12
/** At most this many flow fields are kept; the least recently used goes first. */
const MAX_FIELDS = 12

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
  /** How sodden the ground was, and how deep the snow, when the costs were last built. */
  builtForMud: number
  builtForSnow: number
  readonly fields: Map<string, Float32Array>
}

const states = new WeakMap<Simulation, NavState>()

/** A cell's value in a grid; past the grid's end counts as unwalkable. */
function read(grid: Float32Array, cell: number): number {
  return grid[cell] ?? Infinity
}

function goalKey(goal: NavGoal): string {
  return goal.kind === "line"
    ? `line ${goal.direction > 0 ? 1 : -1} ${Math.round(goal.z / NAV_CELL)}`
    : `point ${Math.round(goal.x / NAV_CELL)} ${Math.round(goal.z / NAV_CELL)} ${Math.round(goal.radius)}`
}

/**
 * The scenery's walking costs laid on the grid, from the map's footprint table: impassable ruins, walls and wrecks,
 * slow rubble, logs and flooded shell holes. The same table gives the line-of-sight obstacles, so what blocks the eye
 * and what blocks the feet agree.
 */
function layObstacles(map: BattlefieldMap, columns: number, rows: number): Float32Array {
  const obstacles = new Float32Array(columns * rows).fill(1)
  for (const scenery of map.scenery) {
    const { walkCost } = SCENERY_FOOTPRINTS[scenery.kind]
    if (walkCost <= 1) {
      continue
    }
    const radius = footprintRadius(scenery)
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
          obstacles[cell] = Math.max(read(obstacles, cell), walkCost)
        }
      }
    }
  }
  return obstacles
}

/**
 * Rebuilds every cell's cost from the ground as it is now: surface, duckboards, obstacles, the wire, and the weather's
 * mud and snow, so routes keep to firmer going when the ground is sodden and flooded trenches are worth climbing out of.
 */
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
      state.cost[cell] = read(state.obstacles, cell) / (surfacePace(map, x, z) * weatherPace(sim, x, z) * wire)
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
  state.builtForMud = sodden(sim)
  state.builtForSnow = snowDepth(sim)
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
      builtForMud: 0,
      builtForSnow: 0,
      fields: new Map()
    }
    states.set(sim, state)
    rebuild(sim, state)
  } else if (
    (sim.wire.cuts !== state.builtForCuts ||
      Math.abs(sodden(sim) - state.builtForMud) >= GROUND_CHANGE ||
      Math.abs(snowDepth(sim) - state.builtForSnow) >= GROUND_CHANGE) &&
    sim.tick - state.builtAt >= REFRESH_SECONDS * 20
  ) {
    // Twenty steps a second; a literal, since importing TICK_RATE here would be circular at load time.
    rebuild(sim, state)
  }
  return state
}

/** A binary min-heap of cells by distance, for Dijkstra, on typed arrays that grow as needed. */
function createHeap(initial: number) {
  let cells = new Int32Array(Math.max(16, initial))
  let keys = new Float64Array(cells.length)
  let size = 0
  const cellAt = (index: number) => cells[index] ?? 0
  const keyAt = (index: number) => keys[index] ?? Infinity
  return {
    get size() {
      return size
    },
    /** The smallest key, of the cell `pop` returns next. */
    get topKey() {
      return keyAt(0)
    },
    push(cell: number, key: number) {
      if (size === cells.length) {
        const grownCells = new Int32Array(cells.length * 2)
        grownCells.set(cells)
        cells = grownCells
        const grownKeys = new Float64Array(keys.length * 2)
        grownKeys.set(keys)
        keys = grownKeys
      }
      let index = size++
      while (index > 0) {
        const parent = (index - 1) >> 1
        if (keyAt(parent) <= key) {
          break
        }
        cells[index] = cellAt(parent)
        keys[index] = keyAt(parent)
        index = parent
      }
      cells[index] = cell
      keys[index] = key
    },
    pop(): number {
      const top = cellAt(0)
      size--
      const lastCell = cellAt(size)
      const lastKey = keyAt(size)
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        let smallestKey = lastKey
        if (left < size && keyAt(left) < smallestKey) {
          smallest = left
          smallestKey = keyAt(left)
        }
        if (right < size && keyAt(right) < smallestKey) {
          smallest = right
        }
        if (smallest === index) {
          break
        }
        cells[index] = cellAt(smallest)
        keys[index] = keyAt(smallest)
        index = smallest
      }
      cells[index] = lastCell
      keys[index] = lastKey
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
  const heap = createHeap(columns * rows)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = (column + 0.5) * NAV_CELL
      const z = (row + 0.5) * NAV_CELL
      const reached =
        goal.kind === "line"
          ? (z - goal.z) * goal.direction >= 0
          : (x - goal.x) ** 2 + (z - goal.z) ** 2 <= goal.radius ** 2
      const cell = row * columns + column
      if (reached && Number.isFinite(read(cost, cell))) {
        distance[cell] = 0
        heap.push(cell, 0)
      }
    }
  }
  while (heap.size > 0) {
    const key = heap.topKey
    const cell = heap.pop()
    const here = read(distance, cell)
    if (key > here) {
      // A stale entry: the cell was reached more cheaply since it was pushed.
      continue
    }
    const column = cell % columns
    const row = Math.floor(cell / columns)
    for (const [dc, dr, length] of NEIGHBOURS) {
      const c = column + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= columns || r >= rows) {
        continue
      }
      const next = r * columns + c
      const through = (read(cost, cell) + read(cost, next)) / 2
      if (!Number.isFinite(through)) {
        continue
      }
      // The field runs from the goal outward, so the walk is from `next` to `cell`: its slope is that way round.
      const run = length * NAV_CELL
      const grade = (read(height, cell) - read(height, next)) / run
      // Rounded to the field's own precision first: comparing an unrounded total against a rounded-up stored one
      // would keep "improving" cells by nothing, and push them again and again.
      const total = Math.fround(here + run * through * slopeCost(grade))
      if (total < read(distance, next)) {
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

/**
 * With no clear way on, a soldier this close, in metres, to the line from the middle of his cell to the route's next
 * cell takes that step anyway. Further off, he walks to the middle first, which lines him up with a gap the route runs
 * through rather than clipping the wire beside it.
 */
const ON_THE_WAY = 0.3

/** How far a point lies from the segment between two others. */
function distanceToSegment(
  x: number,
  z: number,
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number }
): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const along = Math.min(1, Math.max(0, ((x - from.x) * dx + (z - from.z) * dz) / (dx * dx + dz * dz || 1)))
  return Math.sqrt((from.x + dx * along - x) ** 2 + (from.z + dz * along - z) ** 2)
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
    if (!(read(state.obstacles, cell) < CLEAR_COST)) {
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
  if (!Number.isFinite(read(distance, cell))) {
    // Nowhere to go from here (inside a ruin's footprint, say): head straight for it and let the ground sort it out.
    return { x: target.x, z: target.z }
  }
  // Start from the middle of his own cell, which lies on the cheap route; step on along it while he can still walk
  // there in a straight line.
  const centre = (of: number) => ({
    x: ((of % state.columns) + 0.5) * NAV_CELL,
    z: (Math.floor(of / state.columns) + 0.5) * NAV_CELL
  })
  const start = centre(cell)
  let best = start
  let firstStep: { x: number; z: number } | null = null
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
      if (read(distance, candidate) < read(distance, next)) {
        next = candidate
      }
    }
    if (next === cell) {
      break
    }
    cell = next
    const point = centre(cell)
    firstStep ??= point
    if (!clearLine(sim, state, x, z, point.x, point.z)) {
      break
    }
    best = point
  }
  if (
    best === start &&
    firstStep &&
    !clearLine(sim, state, start.x, start.z, firstStep.x, firstStep.z) &&
    distanceToSegment(x, z, start, firstStep) < ON_THE_WAY
  ) {
    // The route's next step is through what a straight walk shies from (uncut wire, a flooded crater) even from the
    // middle of his cell, and he stands in line for it: he goes on into it rather than standing at its edge for good.
    // Where the step is only blocked from where he happens to stand, he lines himself up in the middle first.
    return firstStep
  }
  return best
}
