import { type BattlefieldMap, MAP_FORMAT_VERSION, sampleCount } from "./format.ts"

/** JSON-safe form of a map, as written to a map file. */
export interface MapDocument {
  readonly version: number
  readonly name: string
  readonly cellSize: number
  readonly columns: number
  readonly rows: number
  readonly heights: readonly number[]
}

export function toMapDocument(map: BattlefieldMap): MapDocument {
  return {
    version: map.version,
    name: map.name,
    cellSize: map.cellSize,
    columns: map.columns,
    rows: map.rows,
    heights: Array.from(map.heights)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item))
}

/** Validates a parsed map file. Throws with the reason when the document is not a readable map. */
export function fromMapDocument(document: unknown): BattlefieldMap {
  if (!isRecord(document)) {
    throw new TypeError("Map document must be an object")
  }
  const { version, name, cellSize, columns, rows, heights } = document
  if (version !== MAP_FORMAT_VERSION) {
    throw new TypeError(`Unsupported map format version ${String(version)}; expected ${MAP_FORMAT_VERSION}`)
  }
  if (typeof name !== "string") {
    throw new TypeError("Map name must be a string")
  }
  if (typeof cellSize !== "number" || !(cellSize > 0)) {
    throw new TypeError("Map cell size must be a positive number")
  }
  if (!isPositiveInteger(columns) || !isPositiveInteger(rows)) {
    throw new TypeError("Map columns and rows must be positive integers")
  }
  if (!isNumberArray(heights) || heights.length !== sampleCount(columns, rows)) {
    throw new TypeError(`Map heights must hold ${sampleCount(columns, rows)} finite numbers`)
  }
  return { version, name, cellSize, columns, rows, heights: Float32Array.from(heights) }
}
