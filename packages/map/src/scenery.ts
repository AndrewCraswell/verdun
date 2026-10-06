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
  /** The broken remains of a field or garden wall, running across its heading: men climb over it. */
  "wall",
  /** A tree killed by shellfire, still standing. */
  "tree",
  /** A tree shot down to a splintered stump. */
  "stump",
  /** A fallen trunk. */
  "log",
  /** An orchard's fruit tree, stripped bare by the shelling: a gnarled trunk and a few limbs, a man and a half high. */
  "fruit-tree",
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
  /**
   * A wooden rail fence about 3.6 m long, running across its heading, closing a gap in a belt or the mouth of a sap: no
   * wire on it, so men climb over it, as they do a low wall, where the belt's barbed wire can only be waded or cut.
   */
  "wooden-fence",
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
  /**
   * Nobody walks through it, but men climb over it (the simulation's vault.ts): a fence, a low wall. Its `walkCost` is
   * what a route reckons the climb costs.
   */
  readonly climbed?: boolean
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
  // Climbing over takes as long as walking a few metres round.
  wall: { radius: 1.5, sightHeight: 1.3, walkCost: 3, climbed: true },
  tree: { radius: 0.6, sightHeight: 8, walkCost: Infinity },
  stump: { radius: 0.5, sightHeight: 0.8, walkCost: 2 },
  log: { radius: 1, sightHeight: 0.6, walkCost: 3 },
  "fruit-tree": { radius: 0.3, sightHeight: 2.8, walkCost: Infinity },
  gun: { radius: 2.2, sightHeight: 1.6, walkCost: Infinity },
  "wrecked-gun": { radius: 2.2, sightHeight: 1.4, walkCost: Infinity },
  "wrecked-plane": { radius: 4, sightHeight: 2.2, walkCost: Infinity },
  bunker: { radius: 3, sightHeight: 2.4, walkCost: Infinity },
  "machine-gun": { radius: 1.5, sightHeight: 0.9, walkCost: 4 },
  // Open rails: no cover from sight.
  "wooden-fence": { radius: 1.2, sightHeight: 0, walkCost: 3, climbed: true },
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

/** The side whose rear a road serves. */
export type RoadSide = "french" | "german"

/**
 * A road: the line along its middle, and whose rear it serves. Behind each side's lines its lorries can drive it;
 * between the lines the shelling has left only fragments of it, and it serves no one.
 */
export interface Road {
  readonly points: readonly GroundPoint[]
  /** The side whose lorries can drive it, or null where it runs between the lines. */
  readonly behind: RoadSide | null
}

/** Where a side's lorries set down its men: a spot on one of its roads hidden from the enemy's lines. */
export interface Debus {
  readonly side: RoadSide
  readonly x: number
  readonly z: number
  /** Radians clockwise from north: the way a lorry faces as it stops there, along the road toward the front. */
  readonly heading: number
  /**
   * How many places along the enemy's trench lines, 20 m apart, see some part of a lorry stopped there: 0 where it is
   * hidden. Where the enemy overlooks a side's whole rear, this is the least-seen spot, and lorries are best sent by night.
   */
  readonly seenBy: number
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

function isRoadSide(value: unknown): value is RoadSide {
  return value === "french" || value === "german"
}

export function isRoad(value: unknown): value is Road {
  return isLine(value) && "behind" in value && (value.behind === null || isRoadSide(value.behind))
}

export function isDebus(value: unknown): value is Debus {
  if (!isRecord(value)) {
    return false
  }
  const { side, x, z, heading, seenBy } = value
  return (
    isRoadSide(side) &&
    isFiniteNumber(x) &&
    isFiniteNumber(z) &&
    isFiniteNumber(heading) &&
    typeof seenBy === "number" &&
    Number.isInteger(seenBy) &&
    seenBy >= 0
  )
}
