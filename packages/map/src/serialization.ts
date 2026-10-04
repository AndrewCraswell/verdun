import { type BattlefieldMap, isSurface, MAP_FORMAT_VERSION, sampleCount, Surface, SURFACE_COUNT } from "./format.ts"
import {
  isObjective,
  isRailway,
  isScenery,
  isWireBelt,
  type Objective,
  type Railway,
  type Scenery,
  type WireBelt
} from "./scenery.ts"
import type { GroundPoint, Trench } from "./trenches.ts"

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
  /** Added in version 3. */
  readonly trenches?: readonly Trench[]
  /** Added in version 4. */
  readonly scenery?: readonly Scenery[]
  /** Added in version 4. */
  readonly wire?: readonly WireBelt[]
  /** Added in version 4. */
  readonly objectives?: readonly Objective[]
  /** Added in version 5. */
  readonly weatherRegion?: string
  /** Added in version 6. */
  readonly railways?: readonly Railway[]
}

export function toMapDocument(map: BattlefieldMap): MapDocument {
  return {
    version: map.version,
    name: map.name,
    cellSize: map.cellSize,
    columns: map.columns,
    rows: map.rows,
    heights: Array.from(map.heights),
    surfaces: Array.from(map.surfaces),
    trenches: map.trenches,
    scenery: map.scenery,
    wire: map.wire,
    objectives: map.objectives,
    ...(map.weatherRegion === undefined ? {} : { weatherRegion: map.weatherRegion }),
    railways: map.railways
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

function isGroundPoint(value: unknown): value is GroundPoint {
  return Array.isArray(value) && value.length === 2 && isNumberArray(value)
}

function isTrench(value: unknown): value is Trench {
  if (!isRecord(value)) {
    return false
  }
  const { kind, points, facing } = value
  const validKind = kind === "fire" || kind === "communication"
  const validFacing = kind === "fire" ? facing === "north" || facing === "south" : facing === null
  return validKind && validFacing && Array.isArray(points) && points.length >= 2 && points.every(isGroundPoint)
}

function isSurfaceArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isSurface)
}

/**
 * Validates a parsed map file and migrates older versions. Throws with the reason when the document is not a readable
 * map. Version 1 files have no surface layer; they load as all mud. Versions 1 and 2 have no trenches, versions 1 to 3
 * no scenery or wire, and versions 1 to 5 no railways.
 */
export function fromMapDocument(document: unknown): BattlefieldMap {
  if (!isRecord(document)) {
    throw new TypeError("Map document must be an object")
  }
  const {
    version,
    name,
    cellSize,
    columns,
    rows,
    heights,
    surfaces,
    trenches,
    scenery,
    wire,
    objectives,
    weatherRegion,
    railways
  } = document
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > MAP_FORMAT_VERSION) {
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

  let trenchLines: readonly Trench[] = []
  if (version >= 3) {
    if (!Array.isArray(trenches) || !trenches.every(isTrench)) {
      throw new TypeError("Map trenches must be a list of fire or communication trench lines")
    }
    trenchLines = trenches
  }

  let sceneryItems: readonly Scenery[] = []
  let wireBelts: readonly WireBelt[] = []
  let objectiveList: readonly Objective[] = []
  if (version >= 4) {
    if (!Array.isArray(scenery) || !scenery.every(isScenery)) {
      throw new TypeError("Map scenery must be a list of placed ruins, trees, guns and other known kinds")
    }
    if (!Array.isArray(wire) || !wire.every(isWireBelt)) {
      throw new TypeError("Map wire must be a list of belts, each a line of at least two points")
    }
    if (!Array.isArray(objectives) || !objectives.every(isObjective)) {
      throw new TypeError("Map objectives must be a list of named points, each with a positive radius")
    }
    sceneryItems = scenery
    wireBelts = wire
    objectiveList = objectives
  }
  if (weatherRegion !== undefined && typeof weatherRegion !== "string") {
    throw new TypeError("Map weather region must be a string")
  }
  let railwayLines: readonly Railway[] = []
  if (version >= 6) {
    if (!Array.isArray(railways) || !railways.every(isRailway)) {
      throw new TypeError("Map railways must be a list of lines, each of at least two points")
    }
    railwayLines = railways
  }

  return {
    version: MAP_FORMAT_VERSION,
    name,
    cellSize,
    columns,
    rows,
    heights: Float32Array.from(heights),
    surfaces: surfaceLayer,
    trenches: trenchLines,
    scenery: sceneryItems,
    wire: wireBelts,
    objectives: objectiveList,
    ...(typeof weatherRegion === "string" ? { weatherRegion } : {}),
    railways: railwayLines
  }
}
