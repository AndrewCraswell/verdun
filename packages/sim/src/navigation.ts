import {
  type BattlefieldMap,
  type ChangedArea,
  footprintRadius,
  heightAt,
  mapDepth,
  mapWidth,
  SCENERY_FOOTPRINTS
} from "@verdun/map"
import type { EntityId } from "bitecs"
import { sodden } from "./climate.ts"
import { snowDepth, weatherPace } from "./ground.ts"
import type { Simulation } from "./simulation.ts"
import { slopeCost, surfacePace } from "./terrain.ts"
import { WIRE_CELL, wireAt, wirePace } from "./wire.ts"

/** Navigation grid cell size, in metres: fine enough for gaps in the wire and lanes between ruins. */
export const NAV_CELL = 2
/**
 * At most this often, in seconds, the costs are brought up to date after shells have cut wire or cratered the ground,
 * or the weather has changed it.
 */
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
/**
 * At most this many flow fields are kept; the least recently used goes first. Every squad on its own point (an advance,
 * a leader followed) has a field of its own, and a full map's whole field is a few hundred kilobytes. With fewer fields
 * than goals they thrash: the stage 2 load test's hundred players, each sending their squad to a point of their own,
 * had every field dropped before its squad came back to it, searched again from nothing, and the squads stood waiting
 * for routes; navigation took 15 to 21 ms a step with 64 kept, 8 to 10 with 256.
 */
const MAX_FIELDS = 256

/**
 * Cells a step's route searches may settle, all told. A mass order (thirty squads sent at once, each to its own point)
 * would otherwise search the whole map thirty times in one step, a hitch of half a second; within the budget the work
 * spreads over a second or two, and squads set off as their routes come in, the way an order passes down a line.
 */
const SEARCH_BUDGET = 40_000

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
  /**
   * The time to walk into each cell from its neighbour in each of the eight `NEIGHBOURS` directions, one grid of cells
   * after another; Infinity where that can't be walked, or the neighbour is off the map. Worked out with the costs, so a
   * route's search only adds them up.
   */
  readonly steps: Float64Array
  /** The wire as the costs last saw it, to find the cells shells have cut or wiring parties mended since. */
  readonly wireSeen: Float32Array
  /** 1 where craters have reshaped a cell since the costs were last brought up to date. */
  readonly cratered: Uint8Array
  anyCratered: boolean
  builtAt: number
  /** The wire's cut count when the costs were last built. */
  builtForCuts: number
  /** How sodden the ground was, and how deep the snow, when the costs were last built. */
  builtForMud: number
  builtForSnow: number
  readonly fields: Map<string, FlowField>
  /**
   * Fields the budget ran out on, each with the cell a soldier was waiting on, carried on that far each step by
   * `navigationSystem`. No further: a field for a barrage's line is soon dropped for the next, and searching it to the
   * map's edge would take the budget from routes still wanted.
   */
  readonly unfinished: Map<FlowField, number>
  /** Cells left to settle this step, and the step it's for. */
  budget: number
  budgetTick: number
}

/**
 * Time to walk from each cell to a goal, worked out from the goal outward (Dijkstra) only as far as soldiers have asked:
 * the search stops once the cell asked about is settled, and picks up from there when a soldier further out asks.
 */
interface FlowField {
  readonly distance: Float32Array
  /** The search's frontier, or null once it has covered every cell it can reach. */
  heap: Heap | null
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
 * Works out a cell's cost from the ground as it is now: surface, duckboards, obstacles, the wire, and the weather's mud
 * and snow, so routes keep to firmer going when the ground is sodden and flooded trenches are worth climbing out of.
 */
function survey(sim: Simulation, state: NavState, cell: number): void {
  const { map } = sim
  const quarter = NAV_CELL / 4
  const x = ((cell % state.columns) + 0.5) * NAV_CELL
  const z = (Math.floor(cell / state.columns) + 0.5) * NAV_CELL
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

/** Notes the costs as built now, dropping every route worked out from the old ones. */
function built(sim: Simulation, state: NavState): void {
  state.wireSeen.set(sim.wire.density)
  state.cratered.fill(0)
  state.anyCratered = false
  state.builtAt = sim.tick
  state.builtForCuts = sim.wire.cuts
  state.builtForMud = sodden(sim)
  state.builtForSnow = snowDepth(sim)
  state.fields.clear()
  state.unfinished.clear()
}

/** Rebuilds every cell's cost: for the weather, which changes the ground everywhere. */
function rebuild(sim: Simulation, state: NavState): void {
  for (let cell = 0; cell < state.columns * state.rows; cell++) {
    survey(sim, state, cell)
  }
  laySteps(state)
  built(sim, state)
}

/**
 * Brings up to date only the cells shells and wiring parties have changed: the wire cut or mended, and the craters.
 * Rebuilding the whole grid for a few shell holes stalled a step for most of a hundred milliseconds.
 */
function refresh(sim: Simulation, state: NavState): void {
  const { density } = sim.wire
  const changed = state.cratered
  const wireColumns = sim.wire.columns
  for (let cell = 0; cell < density.length; cell++) {
    if (density[cell] !== state.wireSeen[cell]) {
      const column = Math.floor((((cell % wireColumns) + 0.5) * WIRE_CELL) / NAV_CELL)
      const row = Math.floor(((Math.floor(cell / wireColumns) + 0.5) * WIRE_CELL) / NAV_CELL)
      if (column < state.columns && row < state.rows) {
        changed[row * state.columns + column] = 1
      }
    }
  }
  const cells: number[] = []
  for (let cell = 0; cell < changed.length; cell++) {
    if (changed[cell] === 1) {
      cells.push(cell)
      survey(sim, state, cell)
    }
  }
  // A step's time reads the cells at both its ends: lay those into and out of each changed cell again.
  for (const cell of cells) {
    const column = cell % state.columns
    const row = Math.floor(cell / state.columns)
    for (let r = Math.max(0, row - 1); r <= Math.min(state.rows - 1, row + 1); r++) {
      for (let c = Math.max(0, column - 1); c <= Math.min(state.columns - 1, column + 1); c++) {
        layStepsInto(state, r * state.columns + c)
      }
    }
  }
  built(sim, state)
}

/**
 * Changes whenever the costs are brought up to date with the ground: anything worked out from the ground's shape or its
 * wire (where cover lies, say) holds until it changes. -1 before the costs are first laid.
 */
export function groundVersion(sim: Simulation): number {
  return states.get(sim)?.builtAt ?? -1
}

/**
 * Tells navigation the ground has been reshaped in an area, as a crater does: its costs there are brought up to date
 * with the next refresh.
 */
export function groundChanged(sim: Simulation, area: ChangedArea): void {
  const state = states.get(sim)
  if (!state) {
    return
  }
  const minColumn = Math.max(0, Math.floor(area.minX / NAV_CELL))
  const maxColumn = Math.min(state.columns - 1, Math.floor(area.maxX / NAV_CELL))
  const minRow = Math.max(0, Math.floor(area.minZ / NAV_CELL))
  const maxRow = Math.min(state.rows - 1, Math.floor(area.maxZ / NAV_CELL))
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      state.cratered[row * state.columns + column] = 1
      state.anyCratered = true
    }
  }
}

/** Each of the `NEIGHBOURS` directions paired with its opposite: a step one way and back share their ground. */
const OPPOSITES = [
  [0, 1],
  [2, 3],
  [4, 7],
  [5, 6]
] as const

/** Works out every step's walking time from the cells' costs and heights: see `NavState.steps`. */
function laySteps(state: NavState): void {
  const { columns, rows, cost, height, steps } = state
  const cells = columns * rows
  steps.fill(Infinity)
  for (const [direction, opposite] of OPPOSITES) {
    const [dc, dr, length] = NEIGHBOURS[direction]
    const run = length * NAV_CELL
    for (let row = Math.max(0, -dr); row < Math.min(rows, rows - dr); row++) {
      for (let column = Math.max(0, -dc); column < Math.min(columns, columns - dc); column++) {
        const at = row * columns + column
        const from = at + dr * columns + dc
        const through = (read(cost, at) + read(cost, from)) / 2
        if (!Number.isFinite(through)) {
          continue
        }
        const rise = read(height, at) - read(height, from)
        // Into `at` from its neighbour, and back out the other way, down the same slope.
        steps[direction * cells + at] = run * through * slopeCost(rise / run)
        steps[opposite * cells + from] = run * through * slopeCost(-rise / run)
      }
    }
  }
}

/** Lays again the time to walk into one cell from each of its neighbours, as `laySteps` does for every cell. */
function layStepsInto(state: NavState, at: number): void {
  const { columns, rows, cost, height, steps } = state
  const cells = columns * rows
  const column = at % columns
  const row = Math.floor(at / columns)
  for (let direction = 0; direction < NEIGHBOURS.length; direction++) {
    const [dc, dr, length] = NEIGHBOURS[direction] ?? [0, 0, 1]
    const c = column + dc
    const r = row + dr
    let time = Infinity
    if (c >= 0 && r >= 0 && c < columns && r < rows) {
      const from = r * columns + c
      const through = (read(cost, at) + read(cost, from)) / 2
      if (Number.isFinite(through)) {
        const run = length * NAV_CELL
        time = run * through * slopeCost((read(height, at) - read(height, from)) / run)
      }
    }
    steps[direction * cells + at] = time
  }
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
      steps: new Float64Array(columns * rows * NEIGHBOURS.length),
      wireSeen: new Float32Array(sim.wire.density.length),
      cratered: new Uint8Array(columns * rows),
      anyCratered: false,
      builtAt: 0,
      builtForCuts: 0,
      builtForMud: 0,
      builtForSnow: 0,
      fields: new Map(),
      unfinished: new Map(),
      budget: SEARCH_BUDGET,
      budgetTick: sim.tick
    }
    states.set(sim, state)
    rebuild(sim, state)
  } else if (sim.tick - state.builtAt >= REFRESH_SECONDS * 20) {
    // Twenty steps a second; a literal, since importing TICK_RATE here would be circular at load time.
    if (
      Math.abs(sodden(sim) - state.builtForMud) >= GROUND_CHANGE ||
      Math.abs(snowDepth(sim) - state.builtForSnow) >= GROUND_CHANGE
    ) {
      rebuild(sim, state)
    } else if (sim.wire.cuts !== state.builtForCuts || state.anyCratered) {
      refresh(sim, state)
    }
  }
  if (state.budgetTick !== sim.tick) {
    state.budgetTick = sim.tick
    state.budget = SEARCH_BUDGET
  }
  return state
}

/** A binary min-heap of cells by distance, for Dijkstra, on typed arrays that grow as needed. */
class Heap {
  cells: Int32Array
  keys: Float64Array
  size = 0

  constructor(initial: number) {
    this.cells = new Int32Array(Math.max(16, initial))
    this.keys = new Float64Array(this.cells.length)
  }

  /** The smallest key, of the cell `pop` returns next. */
  get topKey(): number {
    return this.size > 0 ? (this.keys[0] ?? Infinity) : Infinity
  }

  push(cell: number, key: number): void {
    if (this.size === this.cells.length) {
      const cells = new Int32Array(this.cells.length * 2)
      cells.set(this.cells)
      this.cells = cells
      const keys = new Float64Array(this.keys.length * 2)
      keys.set(this.keys)
      this.keys = keys
    }
    const { cells, keys } = this
    let index = this.size++
    while (index > 0) {
      const parent = (index - 1) >> 1
      const parentKey = keys[parent] ?? Infinity
      if (parentKey <= key) {
        break
      }
      cells[index] = cells[parent] ?? 0
      keys[index] = parentKey
      index = parent
    }
    cells[index] = cell
    keys[index] = key
  }

  pop(): number {
    const { cells, keys } = this
    const top = cells[0] ?? 0
    const size = --this.size
    const lastCell = cells[size] ?? 0
    const lastKey = keys[size] ?? Infinity
    let index = 0
    for (;;) {
      const left = index * 2 + 1
      if (left >= size) {
        break
      }
      const right = left + 1
      const leftKey = keys[left] ?? Infinity
      const rightKey = right < size ? (keys[right] ?? Infinity) : Infinity
      const child = rightKey < leftKey ? right : left
      const childKey = rightKey < leftKey ? rightKey : leftKey
      if (!(childKey < lastKey)) {
        break
      }
      cells[index] = cells[child] ?? 0
      keys[index] = childKey
      index = child
    }
    cells[index] = lastCell
    keys[index] = lastKey
    return top
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

/** Starts a flow field for a goal: every walkable cell in it is reached already. */
function startField(state: NavState, goal: NavGoal): FlowField {
  const { columns, rows, cost } = state
  const distance = new Float32Array(columns * rows).fill(Infinity)
  const heap = new Heap(1024)
  if (goal.kind === "line") {
    // A line's goal is whole rows: lay them at once, and search on only from the rows at its edge.
    const rowReached = (row: number) => ((row + 0.5) * NAV_CELL - goal.z) * goal.direction >= 0
    for (let row = 0; row < rows; row++) {
      if (!rowReached(row)) {
        continue
      }
      const edge = (row > 0 && !rowReached(row - 1)) || (row < rows - 1 && !rowReached(row + 1))
      for (let cell = row * columns; cell < (row + 1) * columns; cell++) {
        if (Number.isFinite(read(cost, cell))) {
          distance[cell] = 0
          if (edge) {
            heap.push(cell, 0)
          }
        }
      }
    }
    return { distance, heap }
  }
  const reached = (column: number, row: number) => {
    const x = (column + 0.5) * NAV_CELL
    const z = (row + 0.5) * NAV_CELL
    return (x - goal.x) ** 2 + (z - goal.z) ** 2 <= goal.radius ** 2
  }
  // Only the rows and columns the point's ground could cover.
  const rowsFrom = Math.max(0, Math.floor((goal.z - goal.radius) / NAV_CELL))
  const rowsTo = Math.min(rows - 1, Math.floor((goal.z + goal.radius) / NAV_CELL))
  const columnsFrom = Math.max(0, Math.floor((goal.x - goal.radius) / NAV_CELL))
  const columnsTo = Math.min(columns - 1, Math.floor((goal.x + goal.radius) / NAV_CELL))
  for (let row = rowsFrom; row <= rowsTo; row++) {
    for (let column = columnsFrom; column <= columnsTo; column++) {
      const cell = row * columns + column
      if (!reached(column, row) || !Number.isFinite(read(cost, cell))) {
        continue
      }
      distance[cell] = 0
      // Only cells on the goal's edge lead anywhere new.
      const edge = NEIGHBOURS.some(([dc, dr]) => {
        const c = column + dc
        const r = row + dr
        return c >= 0 && r >= 0 && c < columns && r < rows && !reached(c, r)
      })
      if (edge) {
        heap.push(cell, 0)
      }
    }
  }
  return { distance, heap }
}

/**
 * Carries a field's search on until `cell` is settled: until nothing left on the frontier could reach it more cheaply.
 * Every cell nearer the goal than it is settled then too, so a walk down the field from it reads the same as from a
 * field searched to the end. Stops early when the step's budget runs out, answering whether it got there.
 */
function settle(state: NavState, field: FlowField, cell: number): boolean {
  const { heap, distance } = field
  if (!heap) {
    return true
  }
  const { columns, steps } = state
  const cells = distance.length
  while (heap.size > 0 && heap.topKey < read(distance, cell)) {
    if (state.budget <= 0) {
      state.unfinished.set(field, cell)
      return false
    }
    state.budget--
    const key = heap.topKey
    const at = heap.pop()
    const here = read(distance, at)
    if (key > here) {
      // A stale entry: the cell was reached more cheaply since it was pushed.
      continue
    }
    for (let direction = 0; direction < NEIGHBOURS.length; direction++) {
      // The field runs from the goal outward, so the walk is from the neighbour into `at`.
      const time = steps[direction * cells + at] ?? Infinity
      if (time === Infinity) {
        continue
      }
      const [dc, dr] = NEIGHBOURS[direction] ?? [0, 0]
      const next = at + dr * columns + dc
      // Rounded to the field's own precision first: comparing an unrounded total against a rounded-up stored one
      // would keep "improving" cells by nothing, and push them again and again.
      const total = Math.fround(here + time)
      if (total < read(distance, next)) {
        distance[next] = total
        heap.push(next, total)
      }
    }
  }
  if (heap.size === 0) {
    field.heap = null
  }
  state.unfinished.delete(field)
  return true
}

/** The field for a goal, settled as far as `cell`, or null if this step's budget ran out first. */
function field(state: NavState, goal: NavGoal, cell: number): Float32Array | null {
  const key = goalKey(goal)
  let made = state.fields.get(key)
  if (made) {
    // Most recently used last.
    state.fields.delete(key)
  } else {
    made = startField(state, goal)
  }
  state.fields.set(key, made)
  if (state.fields.size > MAX_FIELDS) {
    const oldest = state.fields.entries().next().value
    if (oldest !== undefined) {
      state.fields.delete(oldest[0])
      state.unfinished.delete(oldest[1])
    }
  }
  return settle(state, made, cell) ? made.distance : null
}

/**
 * Carries on the route searches soldiers asked for and the budget cut short, with what's left of it this step, so the
 * routes are ready when their squads next take stock; and keeps the costs up to date with the ground.
 */
export function navigationSystem(sim: Simulation): void {
  // Also lays the costs on the first step, while the game loads, rather than on the first order of a battle.
  const state = navState(sim)
  for (const [field, cell] of state.unfinished) {
    if (!settle(state, field, cell)) {
      return
    }
  }
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
/** A straight walk is checked this often along its length, in metres: finer than the wire's metre cells. */
const LINE_STEP = 0.25
/** And this far either side of it for wire, in metres: a man is a body's width, and shaves no tangle's edge. */
const LINE_MARGIN = 0.4

/**
 * Whether a straight walk between two points crosses nothing dear: no ruins or pools in the way, and no wire within a
 * body's width of it. Wire is checked at its own finer grain, so a walk past the edge of a gap doesn't clip the tangles.
 * The walker's own spot isn't checked: a man already in the wire can always walk straight out of it.
 */
function clearLine(sim: Simulation, state: NavState, fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  const dx = toX - fromX
  const dz = toZ - fromZ
  const length = Math.sqrt(dx * dx + dz * dz)
  const steps = Math.ceil(length / LINE_STEP)
  // Across the line, a margin's width.
  const sideX = length > 0 ? (-dz / length) * LINE_MARGIN : 0
  const sideZ = length > 0 ? (dx / length) * LINE_MARGIN : 0
  for (let step = 1; step <= steps; step++) {
    const along = step / steps
    const x = fromX + dx * along
    const z = fromZ + dz * along
    const cell = cellAt(state, x, z)
    if (!(read(state.obstacles, cell) < CLEAR_COST)) {
      return false
    }
    for (const side of [0, 1, -1]) {
      const sx = x + sideX * side
      const sz = z + sideZ * side
      if (state.wired[cellAt(state, sx, sz)] === 1 && wirePace(sim.wire, sx, sz) < WIRE_SNAG) {
        return false
      }
    }
  }
  return true
}

/** Offsets tried, nearest first, for a clear spot near a waypoint that lies in the wire: within a metre. */
const NUDGES: readonly (readonly [number, number])[] = [0.5, 1].flatMap((reach) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((eighth): [number, number] => [
    Math.round(Math.cos((eighth * Math.PI) / 4) * reach * 1000) / 1000,
    Math.round(Math.sin((eighth * Math.PI) / 4) * reach * 1000) / 1000
  ])
)

/**
 * The waypoint itself if it's clear of the wire by a body's width, or else the nearest such spot within a metre of it. Routes run
 * through the grid's 2 m cells, and in a gap two or three metres wide a cell's middle can lie in the tangle at the
 * gap's edge: men made for it, and waded.
 */
function clearOfWire(sim: Simulation, point: { x: number; z: number }): { x: number; z: number } {
  // Clear for a body's width all round, or a man coming at it slantwise clips the tangle beside it.
  const clear = (x: number, z: number) =>
    wirePace(sim.wire, x, z) >= WIRE_SNAG &&
    wirePace(sim.wire, x - LINE_MARGIN, z) >= WIRE_SNAG &&
    wirePace(sim.wire, x + LINE_MARGIN, z) >= WIRE_SNAG &&
    wirePace(sim.wire, x, z - LINE_MARGIN) >= WIRE_SNAG &&
    wirePace(sim.wire, x, z + LINE_MARGIN) >= WIRE_SNAG
  if (clear(point.x, point.z)) {
    return point
  }
  for (const [dx, dz] of NUDGES) {
    if (clear(point.x + dx, point.z + dz)) {
      return { x: point.x + dx, z: point.z + dz }
    }
  }
  return point
}

/**
 * Where a soldier should walk next to reach `target`, which lies in `goal`: straight there when the way is clear,
 * otherwise to the furthest point along the cheapest route that he can walk to in a straight line, round ruins and
 * through gaps in the wire. Recomputed every time a squad takes stock, so the route bends smoothly. Null while the route
 * is still being worked out (see `SEARCH_BUDGET`): he carries on as he was.
 */
export function nextWaypoint(
  sim: Simulation,
  soldier: EntityId,
  target: { readonly x: number; readonly z: number },
  goal: NavGoal
): { x: number; z: number } | null {
  const state = navState(sim)
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  if (clearLine(sim, state, x, z, target.x, target.z)) {
    return { x: target.x, z: target.z }
  }
  let cell = cellAt(state, x, z)
  const distance = field(state, goal, cell)
  if (!distance) {
    return null
  }
  if (!Number.isFinite(read(distance, cell))) {
    // Nowhere to go from here (inside a ruin's footprint, say): head straight for it and let the ground sort it out.
    return { x: target.x, z: target.z }
  }
  // Start from the middle of his own cell, which lies on the cheap route; step on along it while he can still walk
  // there in a straight line. Each cell's middle is taken clear of the wire, so a narrow gap is walked down its middle.
  const centre = (of: number) => ({
    x: ((of % state.columns) + 0.5) * NAV_CELL,
    z: (Math.floor(of / state.columns) + 0.5) * NAV_CELL
  })
  const start = clearOfWire(sim, centre(cell))
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
    const point = clearOfWire(sim, centre(cell))
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
