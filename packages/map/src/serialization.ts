import { type BattlefieldMap, isSurface, MAP_FORMAT_VERSION, sampleCount, Surface, SURFACE_COUNT } from "./format.ts"

/** JSON-safe form of a map, as written to a map file. */
export interface MapDocument {
  readonly version: number
  readonly name: string
  readonly cellSize: number
  readonly columns: number
  readonly rows: number
  readonly heights: readonly number[]
  /** Added in version 2. */
  readonly surfaces?: readonly number[]
}

export function toMapDocument(map: BattlefieldMap): MapDocument {
  return {
    version: map.version,
    name: map.name,
    cellSize: map.cellSize,
    columns: map.columns,
    rows: map.rows,
    heights: Array.from(map.heights),
    surfaces: Array.from(map.surfaces)
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

function isSurfaceArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isSurface)
}

/**
 * Validates a parsed map file and migrates older versions. Throws with the reason when the document is not a readable
 * map. Version 1 files have no surface layer; they load as all mud.
 */
export function fromMapDocument(document: unknown): BattlefieldMap {
  if (!isRecord(document)) {
    throw new TypeError("Map document must be an object")
  }
  const { version, name, cellSize, columns, rows, heights, surfaces } = document
  if (version !== 1 && version !== MAP_FORMAT_VERSION) {
    throw new TypeError(`Unsupported map format version ${String(version)}; expected 1 to ${MAP_FORMAT_VERSION}`)
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
  const samples = sampleCount(columns, rows)
  if (!isNumberArray(heights) || heights.length !== samples) {
    throw new TypeError(`Map heights must hold ${samples} finite numbers`)
  }

  let surfaceLayer: Uint8Array
  if (version === 1) {
    surfaceLayer = new Uint8Array(samples).fill(Surface.Mud)
  } else if (isSurfaceArray(surfaces) && surfaces.length === samples) {
    surfaceLayer = Uint8Array.from(surfaces)
  } else {
    throw new TypeError(`Map surfaces must hold ${samples} surface types from 0 to ${SURFACE_COUNT - 1}`)
  }

  return {
    version: MAP_FORMAT_VERSION,
    name,
    cellSize,
    columns,
    rows,
    heights: Float32Array.from(heights),
    surfaces: surfaceLayer
  }
}
