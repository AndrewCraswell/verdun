import type { GroundPoint } from "./trenches.ts"

/**
 * Things standing on the battlefield. The client picks the art for each kind; later the simulation will use them for
 * cover and line of sight.
 */
export const SCENERY_KINDS = [
  /** A shell-wrecked house. */
  "ruin",
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

export function isWireBelt(value: unknown): value is WireBelt {
  if (!isRecord(value) || !Array.isArray(value.points) || value.points.length < 2) {
    return false
  }
  return value.points.every(
    (point: unknown) => Array.isArray(point) && point.length === 2 && point.every(isFiniteNumber)
  )
}
