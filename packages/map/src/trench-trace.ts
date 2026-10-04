import type { GroundPoint } from "./trenches.ts"

/**
 * Trench lines are traced for the client's modular trench kit: straight runs joined by right-angle turns, with enough
 * straight trench either side of every turn and junction for the kit's corner and junction pieces.
 */
export const TRENCH_GRID = {
  /** Length of one straight kit section. */
  section: 3.22,
  /** Straight trench a turn or junction takes up either side of it. */
  clearance: 4.1,
  /** Closest two parallel trenches can run, centre to centre, without their spoil lips overlapping. */
  spacing: 6.4
} as const

/** A straight stretch of fire trench parallel to the front, between two turns. */
export interface Bay {
  readonly fromX: number
  readonly toX: number
  readonly z: number
  /** Front bays face the enemy across open ground; rear bays sit stepped back between them. */
  readonly front: boolean
}

export interface CrenellationOptions {
  readonly fromX: number
  readonly toX: number
  /** Where front bays run, as a function of x. Each front bay sits at this z at its middle. */
  readonly frontZ: (x: number) => number
  /** Which way the enemy lies: 1 for north (+z), -1 for south. */
  readonly towardEnemy: 1 | -1
  /** Straight kit sections in each bay beyond its two turns, by bay index. */
  readonly sections: (bay: number) => number
  /** How far rear bays step back behind the front bays either side of them. At least two turns' clearance. */
  readonly stepBack?: number
}

export interface Crenellation {
  readonly points: GroundPoint[]
  readonly bays: Bay[]
}

/**
 * The crenellated trace of a WW1 fire trench: bays alternately forward and stepped back, joined by short legs at right
 * angles, so a shell burst or an enfilading machine gun can only sweep one bay. Seen from the air it is the square wave
 * of every trench map of the Western Front.
 */
export function crenellatedTrace(options: CrenellationOptions): Crenellation {
  const { fromX, toX, frontZ, towardEnemy, sections } = options
  const stepBack = Math.max(options.stepBack ?? 2 * TRENCH_GRID.clearance, 2 * TRENCH_GRID.clearance)
  const turns = 2 * TRENCH_GRID.clearance
  if (toX - fromX < turns) {
    throw new RangeError(`A crenellated trench needs at least ${turns} m, got ${toX - fromX}`)
  }

  const spans: { fromX: number; toX: number }[] = []
  for (let x = fromX, bay = 0; x < toX; bay++) {
    let end = x + turns + Math.max(0, Math.round(sections(bay))) * TRENCH_GRID.section
    // A stub too short for its own turns joins the bay before it.
    if (toX - end < turns) {
      end = toX
    }
    spans.push({ fromX: x, toX: end })
    x = end
  }

  const frontAt = (index: number) => {
    const span = spans[index]
    return span ? frontZ((span.fromX + span.toX) / 2) : null
  }
  const bays = spans.map((span, index): Bay => {
    if (index % 2 === 0) {
      return { ...span, z: frontAt(index) ?? 0, front: true }
    }
    // Rear bays step back from whichever neighbouring front bay is further back.
    const neighbours = [frontAt(index - 1), frontAt(index + 1)].filter((z) => z !== null)
    const rearmost = towardEnemy === 1 ? Math.min(...neighbours) : Math.max(...neighbours)
    return { ...span, z: rearmost - towardEnemy * stepBack, front: false }
  })

  // Each bay starts where the last ended, so consecutive bays are joined by a leg along z.
  const points = bays.flatMap((bay): GroundPoint[] => [
    [bay.fromX, bay.z],
    [bay.toX, bay.z]
  ])
  return { points, bays }
}

/**
 * Where a junction can meet a bay: the point on its centre line nearest `x` with a junction's clearance from the turns
 * at either end. Null when the bay is too short for one.
 */
export function junctionOnBay(bay: Bay, x: number): GroundPoint | null {
  const margin = 2 * TRENCH_GRID.clearance
  if (bay.toX - bay.fromX < 2 * margin) {
    return null
  }
  return [Math.min(bay.toX - margin, Math.max(bay.fromX + margin, x)), bay.z]
}

/** The bay of a trace, of the given kind, that can take a junction nearest to `x`. */
export function junctionNear(bays: readonly Bay[], x: number, front: boolean): GroundPoint {
  let best: GroundPoint | null = null
  for (const bay of bays) {
    const point = bay.front === front ? junctionOnBay(bay, x) : null
    if (point && (!best || Math.abs(point[0] - x) < Math.abs(best[0] - x))) {
      best = point
    }
  }
  if (!best) {
    throw new RangeError(`No ${front ? "front" : "rear"} bay is long enough for a junction`)
  }
  return best
}

export interface RouteOptions {
  /** Shortest first leg, leaving `from`. */
  readonly firstLeg?: number
  /** Shortest last leg, arriving at `to`: long enough to clear whatever the destination trench has behind it. */
  readonly lastLeg?: number
  /** Preferred length of the legs between jogs. */
  readonly legLength?: number
}

/**
 * A communication trench from one trench line to another: legs along z, alternately jogging east and west, so it can't
 * be swept along its length. Every turn is a right angle and every leg and jog leaves room for the kit's corners. Throws
 * when the ends are too close together for that.
 */
export function communicationRoute(from: GroundPoint, to: GroundPoint, options: RouteOptions = {}): GroundPoint[] {
  const minimum = 2 * TRENCH_GRID.clearance + 0.2
  const firstLeg = Math.max(options.firstLeg ?? minimum, minimum)
  const lastLeg = Math.max(options.lastLeg ?? minimum, minimum)
  const legLength = Math.max(options.legLength ?? 13, minimum)
  const [fromX, fromZ] = from
  const [toX, toZ] = to
  const along = Math.abs(toZ - fromZ)
  const direction = Math.sign(toZ - fromZ)
  const across = toX - fromX

  // Enough legs for the distance, and at least two jogs whenever the ends are offset, so the jogs can always add up.
  let legs = Math.max(2, Math.round(along / legLength))
  if (Math.abs(across) > 0.01 && legs < 3 && along >= firstLeg + lastLeg + minimum) {
    legs = 3
  }
  while (legs > 2 && along < firstLeg + lastLeg + (legs - 2) * minimum) {
    legs -= 1
  }
  if (along < firstLeg + lastLeg) {
    throw new RangeError(`Trench ends ${along.toFixed(1)} m apart along z; the route needs ${firstLeg + lastLeg} m`)
  }

  const middle = (along - firstLeg - lastLeg) / Math.max(1, legs - 2)
  // With only two legs the first takes up the slack; with more, the middle legs share it.
  const legLengths = Array.from({ length: legs }, (_, leg) => {
    if (leg === legs - 1) {
      return lastLeg
    }
    if (leg === 0) {
      return legs === 2 ? along - lastLeg : firstLeg
    }
    return middle
  })

  const jogs = jogLengths(legs - 1, across, minimum)
  const points: GroundPoint[] = [[fromX, fromZ]]
  let x = fromX
  let z = fromZ
  for (const [leg, length] of legLengths.entries()) {
    z += direction * length
    const jog = jogs[leg]
    if (leg === legs - 1) {
      z = toZ
    }
    points.push([x, z])
    if (jog !== undefined) {
      x += jog
      points.push([x, z])
    }
  }
  return points
}

/** Signed jogs, alternating east and west, each at least `minimum` long, adding up to `total`. */
function jogLengths(count: number, total: number, minimum: number): number[] {
  if (count === 0) {
    if (Math.abs(total) > 0.01) {
      throw new RangeError("A straight route can't reach an offset end")
    }
    return []
  }
  if (count === 1) {
    if (Math.abs(total) < minimum) {
      throw new RangeError(`One jog of ${total.toFixed(1)} m is shorter than a turn needs (${minimum} m)`)
    }
    return [total]
  }
  // Start the zigzag toward the far end, then lengthen the first jog going that way to make up the difference.
  const firstSign = total >= 0 ? 1 : -1
  const jogs = Array.from({ length: count }, (_, jog) => (jog % 2 === 0 ? firstSign : -firstSign) * minimum)
  const missing = total - jogs.reduce((sum, jog) => sum + jog, 0)
  const index = jogs.findIndex((jog) => Math.sign(jog) === Math.sign(missing))
  if (index >= 0) {
    jogs[index] += missing
  }
  return jogs
}
