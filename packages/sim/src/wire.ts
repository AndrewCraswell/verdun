import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import type { Side } from "./components.ts"
import type { Simulation } from "./simulation.ts"
import { soldiersNear } from "./spatial.ts"
import { isAlive } from "./squads.ts"

/** Wire is tracked on a grid of cells this many metres across. */
export const WIRE_CELL = 1
/** A belt's stakes, coils and tangles reach this far either side of its line, in metres: a belt about 3.4 m deep. */
const BELT_HALF_DEPTH = 1.7
/** A knife rest blocks ground this far around its centre, in metres. */
const KNIFE_REST_RADIUS = 1.5
/**
 * Walking pace through intact wire, as a fraction of normal: crawling under it or cutting a way through by hand with
 * the issue cutters, snagging at every step. About a minute to get through a belt.
 */
const WIRE_PACE = 0.05
/** Below this density, what's left of the wire is no obstacle. */
const CUT_THROUGH = 0.15
/** Shells cut wire clean within this fraction of their cut radius, and less and less out to its edge. */
const CLEAN_CUT = 0.5

/** Barbed wire in front of the trenches: how intact it is, cell by cell, from 0 (cut away) to 1 (an intact belt). */
export interface WireField {
  readonly columns: number
  readonly rows: number
  readonly density: Float32Array
  /** The density each cell started with, so a save need only record what has been cut. */
  readonly staked: Float32Array
  /** Counts cuts and mends, so anything derived from the wire (routes through it) knows when to look again. */
  cuts: number
}

/** A shell cutting wire, for renderers to tear away the wire art around the burst. */
export interface WireCutEvent {
  readonly type: "wire-cut"
  readonly x: number
  readonly z: number
  readonly radius: number
}

/** Math.hypot isn't correctly rounded on every engine; Math.sqrt is, which keeps the simulation deterministic. */
function length(dx: number, dz: number): number {
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * Lays wire on every cell within `within` metres of a point, or of a segment when `along` is given, searching a square
 * `radius` around the point.
 */
function stamp(
  field: WireField,
  x: number,
  z: number,
  radius: number,
  within: number,
  along?: [number, number, number, number]
): void {
  const minColumn = Math.max(0, Math.floor((x - radius) / WIRE_CELL))
  const maxColumn = Math.min(field.columns - 1, Math.floor((x + radius) / WIRE_CELL))
  const minRow = Math.max(0, Math.floor((z - radius) / WIRE_CELL))
  const maxRow = Math.min(field.rows - 1, Math.floor((z + radius) / WIRE_CELL))
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const px = (column + 0.5) * WIRE_CELL
      const pz = (row + 0.5) * WIRE_CELL
      let distance: number
      if (along) {
        const [ax, az, bx, bz] = along
        const dx = bx - ax
        const dz = bz - az
        const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)))
        distance = length(ax + t * dx - px, az + t * dz - pz)
      } else {
        distance = length(x - px, z - pz)
      }
      if (distance <= within) {
        const cell = row * field.columns + column
        field.density[cell] = 1
        field.staked[cell] = 1
      }
    }
  }
}

/** Stakes out the map's wire belts and knife rests. */
export function createWireField(map: BattlefieldMap): WireField {
  const columns = Math.max(1, Math.ceil(mapWidth(map) / WIRE_CELL))
  const rows = Math.max(1, Math.ceil(mapDepth(map) / WIRE_CELL))
  const field: WireField = {
    columns,
    rows,
    density: new Float32Array(columns * rows),
    staked: new Float32Array(columns * rows),
    cuts: 0
  }
  for (const belt of map.wire) {
    for (let index = 1; index < belt.points.length; index++) {
      const [ax, az] = belt.points[index - 1] ?? [0, 0]
      const [bx, bz] = belt.points[index] ?? [0, 0]
      const reach = length(bx - ax, bz - az) / 2 + BELT_HALF_DEPTH
      stamp(field, (ax + bx) / 2, (az + bz) / 2, reach, BELT_HALF_DEPTH, [ax, az, bx, bz])
    }
  }
  for (const scenery of map.scenery) {
    if (scenery.kind === "knife-rest") {
      const radius = KNIFE_REST_RADIUS * scenery.scale
      stamp(field, scenery.x, scenery.z, radius, radius)
    }
  }
  return field
}

/** How intact the wire is at a ground point, from 0 to 1. */
export function wireAt(field: WireField, x: number, z: number): number {
  const column = Math.floor(x / WIRE_CELL)
  const row = Math.floor(z / WIRE_CELL)
  if (column < 0 || row < 0 || column >= field.columns || row >= field.rows) {
    return 0
  }
  return field.density[row * field.columns + column] ?? 0
}

/**
 * How much of the wire staked in a rectangle of ground still stands, from 0 (all cut) to 1 (untouched, or none staked
 * there to cut).
 */
export function wireStanding(field: WireField, fromX: number, toX: number, fromZ: number, toZ: number): number {
  const minColumn = Math.max(0, Math.floor(Math.min(fromX, toX) / WIRE_CELL))
  const maxColumn = Math.min(field.columns - 1, Math.floor(Math.max(fromX, toX) / WIRE_CELL))
  const minRow = Math.max(0, Math.floor(Math.min(fromZ, toZ) / WIRE_CELL))
  const maxRow = Math.min(field.rows - 1, Math.floor(Math.max(fromZ, toZ) / WIRE_CELL))
  let staked = 0
  let standing = 0
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const cell = row * field.columns + column
      staked += field.staked[cell] ?? 0
      standing += field.density[cell] ?? 0
    }
  }
  return staked > 0 ? Math.min(1, standing / staked) : 1
}

/** Walking pace through the wire at a point, as a fraction of normal: 1 where there's none or it's been cut away. */
export function wirePace(field: WireField, x: number, z: number): number {
  const density = wireAt(field, x, z)
  if (density <= CUT_THROUGH) {
    return 1
  }
  return 1 - ((density - CUT_THROUGH) / (1 - CUT_THROUGH)) * (1 - WIRE_PACE)
}

/**
 * Cuts a lane through the wire, as engineers did through their own belts the night before an attack: every cell within
 * `halfWidth` of x between two depths is cleared, and renderers hear of it as a run of cuts along the lane. Returns
 * whether any wire was there to cut.
 */
export function cutLane(sim: Simulation, x: number, fromZ: number, toZ: number, halfWidth: number): boolean {
  const field = sim.wire
  const minColumn = Math.max(0, Math.floor((x - halfWidth) / WIRE_CELL))
  const maxColumn = Math.min(field.columns - 1, Math.floor((x + halfWidth) / WIRE_CELL))
  const minRow = Math.max(0, Math.floor(Math.min(fromZ, toZ) / WIRE_CELL))
  const maxRow = Math.min(field.rows - 1, Math.floor(Math.max(fromZ, toZ) / WIRE_CELL))
  let cutFrom = -1
  let cut = false
  const tear = (from: number, to: number) => {
    const z = ((from + to + 1) / 2) * WIRE_CELL
    sim.events.push({ type: "wire-cut", x, z, radius: Math.max(halfWidth, ((to - from + 1) * WIRE_CELL) / 2) })
  }
  for (let row = minRow; row <= maxRow; row++) {
    let rowCut = false
    for (let column = minColumn; column <= maxColumn; column++) {
      const cell = row * field.columns + column
      if ((field.density[cell] ?? 0) > 0) {
        field.density[cell] = 0
        rowCut = true
      }
    }
    if (rowCut && cutFrom < 0) {
      cutFrom = row
    } else if (!rowCut && cutFrom >= 0) {
      tear(cutFrom, row - 1)
      cutFrom = -1
    }
    cut ||= rowCut
  }
  if (cutFrom >= 0) {
    tear(cutFrom, maxRow)
  }
  if (cut) {
    field.cuts++
  }
  return cut
}

/** Cuts wire around a burst. Returns whether any was cut, so renderers need only hear about bursts that mattered. */
export function cutWire(sim: Simulation, x: number, z: number, radius: number): boolean {
  if (radius <= 0) {
    return false
  }
  const field = sim.wire
  const minColumn = Math.max(0, Math.floor((x - radius) / WIRE_CELL))
  const maxColumn = Math.min(field.columns - 1, Math.floor((x + radius) / WIRE_CELL))
  const minRow = Math.max(0, Math.floor((z - radius) / WIRE_CELL))
  const maxRow = Math.min(field.rows - 1, Math.floor((z + radius) / WIRE_CELL))
  let cut = false
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const cell = row * field.columns + column
      const density = field.density[cell] ?? 0
      if (density === 0) {
        continue
      }
      const distance = length((column + 0.5) * WIRE_CELL - x, (row + 0.5) * WIRE_CELL - z)
      if (distance <= radius) {
        const left = Math.min(1, Math.max(0, (distance / radius - CLEAN_CUT) / (1 - CLEAN_CUT)))
        field.density[cell] = density * left
        cut = true
      }
    }
  }
  if (cut) {
    field.cuts++
    sim.events.push({ type: "wire-cut", x, z, radius })
  }
  return cut
}

/** The cells cut so far and how much wire is left in each: all a save needs, since the rest is as staked. */
/** Cut wire a wiring party mends in one go, in cells (square metres of belt). */
const MENDED_PER_PARTY = 3
/** Wiring parties stay away from enemies this close, in metres. */
const MENDERS_KEEP_CLEAR = 30
/** Wiring parties go out from a trench garrison this near, in metres. */
const MENDERS_FROM = 60

/**
 * A wiring party's work on a night: the cut wire nearest `ownFront`, on the near side of `midZ`, staked again where no
 * enemy is close and friends are near enough to go out to it. Wiring parties went out every night the shelling allowed,
 * with stakes, coils and mallets wrapped in sacking against the noise. Returns the cells mended.
 */
export function mendWire(
  sim: Simulation,
  ownFront: number,
  midZ: number,
  canReach: (x: number, z: number) => boolean
): number {
  const field = sim.wire
  const ownSide = Math.sign(ownFront - midZ) || 1
  const candidates: { cell: number; distance: number }[] = []
  for (let cell = 0; cell < field.density.length; cell++) {
    if (field.density[cell]! >= field.staked[cell]!) {
      continue
    }
    const z = (Math.floor(cell / field.columns) + 0.5) * WIRE_CELL
    if ((z - midZ) * ownSide > 0) {
      candidates.push({ cell, distance: Math.abs(z - ownFront) })
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.cell - b.cell)
  let mended = 0
  for (const { cell } of candidates) {
    if (mended >= MENDED_PER_PARTY) {
      break
    }
    const x = ((cell % field.columns) + 0.5) * WIRE_CELL
    const z = (Math.floor(cell / field.columns) + 0.5) * WIRE_CELL
    if (canReach(x, z)) {
      field.density[cell] = field.staked[cell]!
      mended++
    }
  }
  if (mended > 0) {
    field.cuts++
  }
  return mended
}

/** Whether a wiring party could work at a point: friends near enough to go out, no enemy close by. */
export function wiringPartyCanReach(sim: Simulation, side: Side, x: number, z: number): boolean {
  let friends = false
  for (const soldier of soldiersNear(sim, x, z, MENDERS_FROM)) {
    if (!isAlive(sim, soldier)) {
      continue
    }
    const distance = Math.sqrt(
      (sim.soldiers.position.x[soldier] - x) ** 2 + (sim.soldiers.position.z[soldier] - z) ** 2
    )
    if (sim.soldiers.side.value[soldier] !== side) {
      if (distance <= MENDERS_KEEP_CLEAR) {
        return false
      }
    } else {
      friends = true
    }
  }
  return friends
}

export function wireCuts(field: WireField): [number, number][] {
  const cuts: [number, number][] = []
  field.density.forEach((density, cell) => {
    if (density !== field.staked[cell]) {
      cuts.push([cell, density])
    }
  })
  return cuts
}
