import type { GroundPoint } from "./trenches.ts"

/**
 * Things standing on the battlefield. The client picks the art for each kind; later the simulation will use them for
 * cover and line of sight.
 */
export const SCENERY_KINDS = [
  /** A shell-wrecked house. */
  "ruin",
  /** The ruin the village is known by, standing out from everywhere in the sector. */
  "landmark",
  /** A heap of brick and stone. */
  "rubble",
  /** The broken remains of a field or garden wall. */
  "wall",
  /** A tree killed by shellfire, still standing. */
  "tree",
  /** A tree shot down to a splintered stump. */
  "stump",
  /** A fallen trunk. */
  "log",
  /** A field gun in its pit. */
  "gun",
  /** A field gun knocked out by counter-battery fire. */
  "wrecked-gun",
  /** A crashed aeroplane. */
  "wrecked-plane",
  /** A concrete machine-gun post. */
  "bunker",
  /** A sandbagged machine-gun emplacement. */
  "machine-gun",
  /** A knife rest: a timber trestle strung with wire, closing a gap in a belt or the mouth of a sap. */
  "knife-rest",
  /** Crates, barrels and sacks in a supply dump. */
  "stores",
  /** A plank bridge carrying a road over a trench. Its heading runs along the trench. */
  "bridge",
  /** Rainwater standing in a shell hole, 0.4 m deep over the lowest ground at its centre. Scale is its radius in m. */
  "pool"
] as const

export type SceneryKind = (typeof SCENERY_KINDS)[number]

export interface Scenery {
  readonly kind: SceneryKind
  readonly x: number
  readonly z: number
  /** Which way it faces, in radians clockwise from north (+z) seen from above. */
  readonly heading: number
  /** Picks between the art variants of a kind; the client wraps it to however many it has. */
  readonly variant: number
  /** Size relative to the kind's usual size. */
  readonly scale: number
}

/** How a kind of scenery stands in the way: of men walking, and of men seeing. */
export interface SceneryFootprint {
  /** Ground it takes up, as a circle this many metres across its middle, times the item's scale (a pool's is its scale). */
  readonly radius: number
  /** How high it stands above the ground, blocking sight below that, in metres times the scale; 0 sees through it. */
  readonly sightHeight: number
  /** Cost of walking through it as a multiple of firm ground: Infinity where nobody can. */
  readonly walkCost: number
}

/**
 * The one table of what scenery blocks, shared by walking (the sim's navigation) and seeing (its line of sight), so
 * the two agree. Sight heights are of what's left standing: a ruin's broken walls, a wall's few courses, a dead tree's
 * trunk and splintered crown.
 */
export const SCENERY_FOOTPRINTS: Readonly<Record<SceneryKind, SceneryFootprint>> = {
  ruin: { radius: 4, sightHeight: 4.5, walkCost: Infinity },
  landmark: { radius: 7, sightHeight: 7, walkCost: Infinity },
  rubble: { radius: 2.5, sightHeight: 1.1, walkCost: 2.5 },
  wall: { radius: 1.5, sightHeight: 1.3, walkCost: Infinity },
  tree: { radius: 0.6, sightHeight: 8, walkCost: Infinity },
  stump: { radius: 0.5, sightHeight: 0.8, walkCost: 2 },
  log: { radius: 1, sightHeight: 0.6, walkCost: 3 },
  gun: { radius: 2.2, sightHeight: 1.6, walkCost: Infinity },
  "wrecked-gun": { radius: 2.2, sightHeight: 1.4, walkCost: Infinity },
  "wrecked-plane": { radius: 4, sightHeight: 2.2, walkCost: Infinity },
  bunker: { radius: 3, sightHeight: 2.4, walkCost: Infinity },
  "machine-gun": { radius: 1.5, sightHeight: 0.9, walkCost: 4 },
  // Wire on a timber trestle: slow to get through, no cover from sight.
  "knife-rest": { radius: 1.2, sightHeight: 0, walkCost: 6 },
  stores: { radius: 2, sightHeight: 1.8, walkCost: Infinity },
  bridge: { radius: 1, sightHeight: 0, walkCost: 1 },
  // Wading through a flooded shell hole: possible, but slow and cold.
  pool: { radius: 1, sightHeight: 0, walkCost: 4 }
}

/** The ground a piece of scenery takes up, in metres: a pool's radius is its scale, everything else's scales. */
export function footprintRadius(item: Scenery): number {
  return item.kind === "pool" ? item.scale : SCENERY_FOOTPRINTS[item.kind].radius * item.scale
}

/** Ground worth fighting for: a ruin, a crossroads, a crater. Whoever holds it holds the sector. */
export interface Objective {
  readonly name: string
  readonly x: number
  readonly z: number
  /** Soldiers within this many metres of the point hold it. */
  readonly radius: number
}

/** A belt of barbed wire staked out along a line, in front of a fire trench. */
export interface WireBelt {
  readonly points: readonly GroundPoint[]
}

/**
 * A narrow-gauge field railway: one of the 60 cm Decauville lines that carried shells and stores up from the railheads
 * to the dumps behind the lines. The line of its track's centre. Neither cover nor obstacle: the simulation takes no
 * notice of it.
 */
export interface Railway {
  readonly points: readonly GroundPoint[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isSceneryKind(value: unknown): value is SceneryKind {
  return SCENERY_KINDS.some((kind) => kind === value)
}

export function isScenery(value: unknown): value is Scenery {
  if (!isRecord(value)) {
    return false
  }
  const { kind, x, z, heading, variant, scale } = value
  return (
    isSceneryKind(kind) &&
    isFiniteNumber(x) &&
    isFiniteNumber(z) &&
    isFiniteNumber(heading) &&
    isFiniteNumber(scale) &&
    scale > 0 &&
    typeof variant === "number" &&
    Number.isInteger(variant) &&
    variant >= 0
  )
}

export function isObjective(value: unknown): value is Objective {
  if (!isRecord(value)) {
    return false
  }
  const { name, x, z, radius } = value
  return typeof name === "string" && isFiniteNumber(x) && isFiniteNumber(z) && isFiniteNumber(radius) && radius > 0
}

/** Whether a value is a line of at least two ground points, as wire belts and railways are. */
function isLine(value: unknown): value is { readonly points: readonly GroundPoint[] } {
  if (!isRecord(value) || !Array.isArray(value.points) || value.points.length < 2) {
    return false
  }
  return value.points.every(
    (point: unknown) => Array.isArray(point) && point.length === 2 && point.every(isFiniteNumber)
  )
}

export function isWireBelt(value: unknown): value is WireBelt {
  return isLine(value)
}

export function isRailway(value: unknown): value is Railway {
  return isLine(value)
}
