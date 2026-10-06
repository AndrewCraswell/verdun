import type { Debus, Objective, Railway, Road, Scenery, WireBelt } from "./scenery.ts"
import type { Trench } from "./trenches.ts"

/** Bump when the shape of a saved map changes, and add a migration for older files in serialization.ts. */
export const MAP_FORMAT_VERSION = 7

/** Ground surface types. Stored per height sample, so terrain materials blend smoothly between them. */
export const Surface = {
  Grass: 0,
  Mud: 1,
  Chalk: 2,
  /** Shell-torn no man's land. */
  Churned: 3
} as const
export type Surface = (typeof Surface)[keyof typeof Surface]
export const SURFACE_COUNT = 4

export function isSurface(value: unknown): value is Surface {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < SURFACE_COUNT
}

/**
 * A battlefield grid. Heights and surfaces are sampled at grid corners, so a map of `columns` x `rows` cells holds
 * `(columns + 1) * (rows + 1)` samples per layer, stored row by row. The map spans x in [0, columns * cellSize] and z in
 * [0, rows * cellSize], in metres.
 */
export interface BattlefieldMap {
  readonly version: typeof MAP_FORMAT_VERSION
  readonly name: string
  /** Edge length of one grid cell, in metres. */
  readonly cellSize: number
  readonly columns: number
  readonly rows: number
  readonly heights: Float32Array
  /** One `Surface` per sample. */
  readonly surfaces: Uint8Array
  /** Trench lines, already carved into `heights`. Added in version 3. */
  readonly trenches: readonly Trench[]
  /** Ruins, trees, guns and other things standing on the ground. Added in version 4. */
  readonly scenery: readonly Scenery[]
  /** Barbed-wire belts. Added in version 4. */
  readonly wire: readonly WireBelt[]
  /** Ground to take and hold. Added in version 4. */
  readonly objectives: readonly Objective[]
  /**
   * Whose history's weather the battle is fought in: a region the simulation knows (`WEATHER_REGIONS`), such as
   * "fleury" or "somme". Absent, the simulation's default. Added in version 5.
   */
  readonly weatherRegion?: string
  /** Narrow-gauge field railways behind the lines. Added in version 6. */
  readonly railways: readonly Railway[]
  /** Roads, each with whose rear it serves. Added in version 7. */
  readonly roads: readonly Road[]
  /** Where each side's lorries set down its men, one or none a side. Added in version 7. */
  readonly debus: readonly Debus[]
}

interface MapDimensions {
  readonly name: string
  readonly cellSize: number
  readonly columns: number
  readonly rows: number
}

export function sampleCount(columns: number, rows: number): number {
  return (columns + 1) * (rows + 1)
}

export function createFlatMap(
  { name, cellSize, columns, rows }: MapDimensions,
  height = 0,
  surface: Surface = Surface.Mud
): BattlefieldMap {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    throw new RangeError(`Map needs at least one whole cell in each direction, got ${columns} x ${rows}`)
  }
  if (!(cellSize > 0)) {
    throw new RangeError(`Cell size must be positive, got ${cellSize}`)
  }
  const samples = sampleCount(columns, rows)
  return {
    version: MAP_FORMAT_VERSION,
    name,
    cellSize,
    columns,
    rows,
    heights: new Float32Array(samples).fill(height),
    surfaces: new Uint8Array(samples).fill(surface),
    trenches: [],
    scenery: [],
    wire: [],
    objectives: [],
    railways: [],
    roads: [],
    debus: []
  }
}

export function mapWidth(map: BattlefieldMap): number {
  return map.columns * map.cellSize
}

export function mapDepth(map: BattlefieldMap): number {
  return map.rows * map.cellSize
}

/** Index of the sample at a grid corner. */
export function sampleIndex(map: BattlefieldMap, column: number, row: number): number {
  return row * (map.columns + 1) + column
}
