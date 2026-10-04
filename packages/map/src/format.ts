/** Bump when the shape of a saved map changes, and add a migration for older files. */
export const MAP_FORMAT_VERSION = 1

/**
 * A battlefield height grid. Heights are sampled at grid corners, so a map of `columns` x `rows` cells holds
 * `(columns + 1) * (rows + 1)` samples, stored row by row. The map spans x in [0, columns * cellSize] and z in
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

export function createFlatMap({ name, cellSize, columns, rows }: MapDimensions, height = 0): BattlefieldMap {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    throw new RangeError(`Map needs at least one whole cell in each direction, got ${columns} x ${rows}`)
  }
  if (!(cellSize > 0)) {
    throw new RangeError(`Cell size must be positive, got ${cellSize}`)
  }
  const heights = new Float32Array(sampleCount(columns, rows)).fill(height)
  return { version: MAP_FORMAT_VERSION, name, cellSize, columns, rows, heights }
}

export function mapWidth(map: BattlefieldMap): number {
  return map.columns * map.cellSize
}

export function mapDepth(map: BattlefieldMap): number {
  return map.rows * map.cellSize
}

/** Index of the height sample at a grid corner. */
export function sampleIndex(map: BattlefieldMap, column: number, row: number): number {
  return row * (map.columns + 1) + column
}
