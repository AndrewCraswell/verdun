import { type BattlefieldMap, heightAt, type Trench, TRENCH_PROFILE } from "@verdun/map"
import { hashOf, type Placement, upForSlope, yawAlong } from "./placement.ts"

/**
 * Synty deep trench kit dimensions, in metres, in the kit's own axes: trench sections run along +z, 2.2 m between the
 * revetments, with the floor 1.36 m below the piece origin.
 */
const KIT = {
  straight: 3.22,
  /** How far a corner piece reaches along each of its two arms. */
  cornerArm: 4.04,
  /** How far a T junction reaches along each of its arms. */
  teeArm: 4.06,
  /** An end cap covers one straight section's length, closed at one end. */
  end: 3.22,
  /** Piece origin above the simulation's trench floor: the kit floor sits 1.36 m below it, 4 cm proud of the ground. */
  floorOffset: 1.4,
  fireStepLong: 7.64,
  fireStepShort: 2.82,
  fireStepHalfHeight: 0.53,
  fireStepDepth: 1.18,
  duckboard: 2.72,
  duckboardWidth: 1.76
} as const

/** Fire steps run along the front wall where the simulation's profile has them. */
const FIRE_STEP = { inner: TRENCH_PROFILE.floorHalfWidth, outer: TRENCH_PROFILE.fireStepOuter } as const
const WALL = TRENCH_PROFILE.wallHalfWidth
/** Turns sharper than this get a corner piece; gentler bends are just straights meeting. */
const CORNER_ANGLE = Math.PI / 6
/** Which way along z each trench faces: communication trenches face neither way. */
const FACING_Z = { north: 1, south: -1, none: 0 } as const
/** How close a trench's end must be to another trench's centre line to join it. */
const JOIN_DISTANCE = 0.75

export const TRENCH_PIECES = {
  straights: [
    "Env_Trench_Deep_Straight_01",
    "Env_Trench_Deep_Straight_01",
    "Env_Trench_Deep_Straight_02",
    "Env_Trench_Deep_Straight_03"
  ],
  dugout: "Env_Trench_Deep_Straight_Dugout_01",
  corner: "Env_Trench_Deep_Corner_01",
  tee: "Env_Trench_Deep_Intersection_02",
  end: "Env_Trench_Deep_End_02",
  fireStepLong: "Env_Trench_Firestep_05",
  fireStepShort: "Env_Trench_Firestep_02",
  duckboard: "Prop_Trench_Planks_01",
  ladder: "Prop_Ladder_01",
  sandbags: "Env_Sandbag_Wall_Long_01",
  /** A short length of sandbag wall, for a course broken by shellfire. */
  sandbagsShort: "Env_Sandbag_Wall_01",
  /** Where a shell burst in the course: a slumped heap of bags. */
  sandbagHeap: "Env_Sandbag_Pile_01",
  pole: "Env_Trench_Pole_01",
  /** Stores and tools left along the floor against the rear wall. */
  clutter: ["Gen_Prop_Crate_02", "Gen_Prop_Barrel_Wood_01", "Gen_Prop_Sack_Stack_01"],
  /** Things leant against the rear wall. */
  leaning: ["Prop_Iron_Sheet_01", "Prop_Iron_Sheet_02", "Gen_Wep_Spade_01"],
  /** Rainwater standing on the trench floor, under the duckboards: a flat plane of the kit's muddy water. */
  water: "Env_Crater_Water_02",
  /** A blanket hung across a dugout's doorway, damped against gas (made in code: see trench-life.ts). */
  gasCurtain: "Gas_Curtain",
  /** The pipe of a dugout's stove, poking up through the earth over it (made in code: see trench-life.ts). */
  stovepipe: "Stovepipe",
  /** Washing hung out to dry on a line behind a dugout (made in code: see trench-life.ts). */
  laundry: "Laundry_Line",
  /** An oil drum pierced for a brazier, burning by a dugout. */
  brazier: "Gen_Prop_Barrel_Metal_01",
  /** A signboard where a communication trench meets a fire trench. */
  sign: "Prop_RoadSign_01"
} as const

/** The kit's water plane is this many metres square. */
const WATER_SIZE = 7.64
/** Dugout doorways open in the dugout section's -x wall, `along` metres up its z axis from its middle. */
const DUGOUT_DOOR = { across: 0.98, along: 1.1, height: 0.8 } as const
/**
 * A dugout's stovepipe stands on the ground over the dug-out room behind the doorway, `out` metres from the trench's
 * centre line, its foot `base` metres over the trench floor: the ground's level, the spoil having thinned out there.
 * About `share` of the dugouts have a stove going.
 */
const STOVEPIPE = { out: 3.4, base: 1.8, share: 0.6 } as const
/** Washing hangs on a line along the trench `out` metres behind about `share` of the dugouts, on the ground. */
const LAUNDRY = { out: 4.6, base: 1.85, share: 0.3 } as const
/**
 * Duckboards where water stands on the floor have settled into the mud: sunk up to `depth` metres and tipped up to
 * `tilt` radians along the trench (less across it), each its own way.
 */
const SINKING = { depth: 0.08, tilt: 0.07 } as const

/**
 * Sandbags laid along the parapet's crest, on the kit's lip of spoil: one course, its top below the eye of a man on the
 * fire step (1.65 m over the step, the step 1.05 m over the floor). Lengths and heights are the kit pieces' own.
 */
const SANDBAGS = {
  long: { length: 8.78, height: 1 },
  short: { length: 3.36, height: 0.86 },
  offset: 1.55,
  /** The course's foot above the trench floor, sunk a little into the lip, whose crest is 2.35 m up. */
  height: 2.22,
  course: 0.38,
  depth: 0.8,
  /** Of the bays a course is laid along: nearly all in the front line, most behind it. */
  laid: { front: 0.95, rear: 0.75 },
  /** About one stretch in this many metres has been blown in by a shell. */
  breachEvery: 11,
  breachLength: 1.8
} as const
/**
 * Stores and timber left lying on the trench's lips, how often each turns up, and how much larger than life: a burst
 * bag, planks, a sheet of iron, a box of ammunition, a spare duckboard, a spade, a dud.
 */
const LIP_LITTER: readonly (readonly [piece: string, weight: number, size: number])[] = [
  ["Env_Sandbag_01", 8, 1.1],
  ["Env_Sandbag_03", 6, 1.1],
  ["Gen_Prop_Plank_01", 5, 1],
  ["Gen_Prop_Plank_02", 5, 1],
  ["Prop_Iron_Sheet_01", 3, 1],
  ["Prop_Iron_Sheet_03", 3, 1],
  ["Gen_Prop_Crate_02", 2, 0.8],
  ["Prop_Trench_Planks_02", 2, 1],
  ["Gen_Wep_Spade_01", 2, 1.3],
  ["Prop_Shell_01", 2, 1.3]
]
const LIP_LITTER_WEIGHT = LIP_LITTER.reduce((total, [, weight]) => total + weight, 0)
/** Lip litter is considered every this many metres along each lip, and laid at about half the places. */
const LIP_SPACING = 6
/** It lies on the kit's lip of spoil, this far from the centre line and this high above the floor. */
const LIP = { from: 1.6, to: 2.3, height: 2.33 } as const
/** Telephone poles along communication trenches, beside the spoil. */
const POLES = { spacing: 16, offset: 3.4, height: 1.4 } as const
/** About one place in this many metres along a trench gets clutter: more in the rear lines than the front. */
const CLUTTER_SPACING = 7

interface Segment {
  readonly ax: number
  readonly az: number
  readonly length: number
  /** Unit direction along the segment. */
  readonly dx: number
  readonly dz: number
  /** Trench length used up by pieces at each end and at junctions part way along. */
  start: number
  end: number
  readonly taken: { from: number; to: number }[]
}

function segmentsOf(trench: Trench): Segment[] {
  return trench.points.slice(1).map(([bx, bz], index) => {
    const [ax, az] = trench.points[index]
    const length = Math.hypot(bx - ax, bz - az)
    return { ax, az, length, dx: (bx - ax) / length, dz: (bz - az) / length, start: 0, end: 0, taken: [] }
  })
}

/** Lengths along a segment not covered by turns, junctions or end caps. */
function freeRuns(segment: Segment): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = []
  let from = segment.start
  for (const taken of [...segment.taken].sort((a, b) => a.from - b.from)) {
    if (taken.from > from) {
      runs.push({ from, to: taken.from })
    }
    from = Math.max(from, taken.to)
  }
  if (segment.length - segment.end > from) {
    runs.push({ from, to: segment.length - segment.end })
  }
  return runs.filter((run) => run.to - run.from > 0.3)
}

/** Splits a run into `count` equal pieces of about `length`, for kit pieces scaled to fit exactly. */
function tile(run: { from: number; to: number }, length: number): { centre: number; length: number }[] {
  const span = run.to - run.from
  const count = Math.max(1, Math.round(span / length))
  return Array.from({ length: count }, (_, index) => ({
    centre: run.from + ((index + 0.5) * span) / count,
    length: span / count
  }))
}

/** The fire trench on each side nearest the enemy: its bays get ladders for going over the top. */
function frontLines(trenches: readonly Trench[]): Set<Trench> {
  const meanZ = (trench: Trench) => trench.points.reduce((sum, [, z]) => sum + z, 0) / trench.points.length
  const fronts = new Set<Trench>()
  for (const facing of ["north", "south"] as const) {
    const fire = trenches.filter((trench) => trench.kind === "fire" && trench.facing === facing)
    const [front] = fire.sort((a, b) => (facing === "north" ? meanZ(b) - meanZ(a) : meanZ(a) - meanZ(b)))
    if (front) {
      fronts.add(front)
    }
  }
  return fronts
}

/**
 * Lines every trench with the deep trench kit: straight sections scaled to fit each run, corner pieces at right-angle
 * turns, T junctions where one trench ends on another, end caps on free ends, fire steps along the front wall of fire
 * trench bays, duckboards on the floor, dugout entrances in the rear lines and scaling ladders in the front line.
 * Pieces sit on the simulation's trench floor and tilt to follow it.
 */
export function layOutTrenchKit(map: BattlefieldMap): Placement[] {
  const placements: Placement[] = []
  const floorAt = (x: number, z: number) => heightAt(map, x, z)
  const segmentsByTrench = new Map(map.trenches.map((trench) => [trench, segmentsOf(trench)]))
  const fronts = frontLines(map.trenches)

  // Ends: a T junction where the end meets another trench part way along, otherwise an end cap.
  for (const [trench, segments] of segmentsByTrench) {
    const first = segments[0]
    const last = segments.at(-1)
    if (!first || !last) {
      continue
    }
    const ends = [
      { segment: first, x: first.ax, z: first.az, inX: first.dx, inZ: first.dz, atStart: true },
      {
        segment: last,
        x: last.ax + last.dx * last.length,
        z: last.az + last.dz * last.length,
        inX: -last.dx,
        inZ: -last.dz,
        atStart: false
      }
    ]
    for (const end of ends) {
      const host = findHost(segmentsByTrench, trench, end.x, end.z)
      if (host) {
        host.segment.taken.push({ from: host.along - KIT.teeArm, to: host.along + KIT.teeArm })
        const y = floorAt(end.x, end.z) + KIT.floorOffset
        placements.push({ piece: TRENCH_PIECES.tee, x: end.x, y, z: end.z, yaw: yawAlong(end.inX, end.inZ) })
        end.segment[end.atStart ? "start" : "end"] = KIT.teeArm
        if (trench.kind === "communication") {
          placements.push(signAt(map, end.x, end.z, end.inX, end.inZ))
        }
      } else {
        const x = end.x + end.inX * (KIT.end / 2)
        const z = end.z + end.inZ * (KIT.end / 2)
        placements.push({
          piece: TRENCH_PIECES.end,
          x,
          y: floorAt(x, z) + KIT.floorOffset,
          z,
          yaw: yawAlong(end.inX, end.inZ)
        })
        end.segment[end.atStart ? "start" : "end"] = KIT.end
      }
    }
  }

  // Turns: a corner piece at every right-angle bend, tilted to the plane of the floor around it.
  for (const segments of segmentsByTrench.values()) {
    for (let index = 1; index < segments.length; index++) {
      const incoming = segments[index - 1]
      const outgoing = segments[index]
      const turn = Math.acos(Math.max(-1, Math.min(1, incoming.dx * outgoing.dx + incoming.dz * outgoing.dz)))
      if (turn < CORNER_ANGLE) {
        continue
      }
      incoming.end = Math.max(incoming.end, KIT.cornerArm)
      outgoing.start = Math.max(outgoing.start, KIT.cornerArm)
      placements.push(cornerAt(outgoing.ax, outgoing.az, incoming, outgoing, floorAt))
    }
  }

  for (const [trench, segments] of segmentsByTrench) {
    const facingZ = FACING_Z[trench.facing ?? "none"]
    const front = fronts.has(trench)
    for (const segment of segments) {
      // A bay of a fire trench runs across the line of fire; legs between bays run along it and get no fire step.
      const bay = facingZ !== 0 && Math.abs(segment.dz) < 0.3
      // Toward the enemy, square to the segment.
      const enemySide = Math.sign(segment.dx * facingZ) || 1
      const towardX = -segment.dz * enemySide
      const towardZ = segment.dx * enemySide
      for (const run of freeRuns(segment)) {
        const sections = straights(segment, run, trench.kind === "fire" && !front, floorAt)
        placements.push(...sections, ...sections.flatMap(dugoutLife))
        placements.push(...duckboards(segment, run, bay, towardX, towardZ, floorAt))
        placements.push(...standingWater(segment, run, bay, towardX, towardZ, floorAt))
        placements.push(...clutter(segment, run, bay, towardX, towardZ, front, floorAt))
        placements.push(...lipLitter(segment, run, bay, towardX, towardZ, floorAt))
        if (bay) {
          placements.push(...fireSteps(segment, run, towardX, towardZ, floorAt))
          placements.push(...sandbags(segment, run, towardX, towardZ, front, floorAt))
          if (front && run.to - run.from > 6) {
            placements.push(ladderIn(segment, run, towardX, towardZ, floorAt))
          }
        }
      }
      if (trench.kind === "communication") {
        placements.push(...poles(map, segment))
      }
    }
  }
  return placements
}

function findHost(
  segmentsByTrench: ReadonlyMap<Trench, Segment[]>,
  branch: Trench,
  x: number,
  z: number
): { segment: Segment; along: number } | null {
  for (const [trench, segments] of segmentsByTrench) {
    if (trench === branch) {
      continue
    }
    for (const segment of segments) {
      const along = (x - segment.ax) * segment.dx + (z - segment.az) * segment.dz
      const across = Math.abs((x - segment.ax) * segment.dz - (z - segment.az) * segment.dx)
      if (across < JOIN_DISTANCE && along > KIT.teeArm && along < segment.length - KIT.teeArm) {
        return { segment, along }
      }
    }
  }
  return null
}

/**
 * The corner piece's arms point along its -x and +z axes. Turn it so they point back along the incoming segment and on
 * along the outgoing one: for a turn one way that puts +z on the outgoing arm, for the other way on the incoming.
 */
function cornerAt(
  x: number,
  z: number,
  incoming: Segment,
  outgoing: Segment,
  floorAt: (x: number, z: number) => number
): Placement {
  const outward = yawAlong(outgoing.dx, outgoing.dz)
  const minusX = [-Math.cos(outward), Math.sin(outward)]
  const yaw = minusX[0] * -incoming.dx + minusX[1] * -incoming.dz > 0.7 ? outward : yawAlong(-incoming.dx, -incoming.dz)
  // Tilt to the plane through the floor at the ends of both arms.
  const reach = KIT.cornerArm
  const centre = floorAt(x, z)
  const back = floorAt(x - incoming.dx * reach, z - incoming.dz * reach)
  const on = floorAt(x + outgoing.dx * reach, z + outgoing.dz * reach)
  const slopeX = ((on - centre) * outgoing.dx + (centre - back) * incoming.dx) / reach
  const slopeZ = ((on - centre) * outgoing.dz + (centre - back) * incoming.dz) / reach
  const length = Math.hypot(slopeX, 1, slopeZ)
  return {
    piece: TRENCH_PIECES.corner,
    x,
    y: centre + KIT.floorOffset,
    z,
    yaw,
    up: [-slopeX / length, 1 / length, -slopeZ / length]
  }
}

/** Ground point a distance along a segment, its floor height, and the floor's slope over a length centred there. */
function along(segment: Segment, centre: number, length: number, floorAt: (x: number, z: number) => number) {
  const x = segment.ax + segment.dx * centre
  const z = segment.az + segment.dz * centre
  const from = floorAt(x - (segment.dx * length) / 2, z - (segment.dz * length) / 2)
  const to = floorAt(x + (segment.dx * length) / 2, z + (segment.dz * length) / 2)
  return { x, z, floor: (from + to) / 2, slope: (to - from) / length }
}

function straights(
  segment: Segment,
  run: { from: number; to: number },
  rearLine: boolean,
  floorAt: (x: number, z: number) => number
): Placement[] {
  return tile(run, KIT.straight).map(({ centre, length }) => {
    const { x, z, floor, slope } = along(segment, centre, length, floorAt)
    const roll = hashOf(x, z)
    const pieces = TRENCH_PIECES.straights
    // Dugouts open off the support and reserve lines, about one section in eight.
    const piece = rearLine && roll < 0.12 ? TRENCH_PIECES.dugout : pieces[Math.floor(roll * pieces.length)]
    return {
      piece: piece ?? TRENCH_PIECES.straights[0],
      x,
      y: floor + KIT.floorOffset,
      z,
      yaw: yawAlong(segment.dx, segment.dz) + (hashOf(x, z, 1) < 0.5 ? 0 : Math.PI),
      up: upForSlope(segment.dx, segment.dz, slope),
      scale: [1, 1, length / KIT.straight]
    }
  })
}

/**
 * What goes with a dugout: a gas curtain hung across its doorway, at about half of them a brazier burning beside it,
 * and at most a stovepipe over the room behind. Other sections get nothing.
 */
function dugoutLife(section: Placement): Placement[] {
  if (section.piece !== TRENCH_PIECES.dugout) {
    return []
  }
  // The section's -x axis, turned by its yaw: toward the doorway's wall. Its z axis runs along the trench.
  const doorX = -Math.cos(section.yaw)
  const doorZ = Math.sin(section.yaw)
  const alongX = Math.sin(section.yaw)
  const alongZ = Math.cos(section.yaw)
  const floor = section.y - KIT.floorOffset
  const life: Placement[] = [
    {
      piece: TRENCH_PIECES.gasCurtain,
      x: section.x + doorX * DUGOUT_DOOR.across + alongX * DUGOUT_DOOR.along,
      y: floor + DUGOUT_DOOR.height,
      z: section.z + doorZ * DUGOUT_DOOR.across + alongZ * DUGOUT_DOOR.along,
      yaw: section.yaw
    }
  ]
  if (hashOf(section.x, section.z, 21) < 0.5) {
    // Beside the doorway, against the same wall.
    life.push({
      piece: TRENCH_PIECES.brazier,
      x: section.x + doorX * 0.62 - alongX * 0.6,
      y: floor + 0.04,
      z: section.z + doorZ * 0.62 - alongZ * 0.6,
      yaw: hashOf(section.x, section.z, 22) * Math.PI * 2,
      scale: [0.85, 0.75, 0.85]
    })
  }
  if (hashOf(section.x, section.z, 29) < LAUNDRY.share) {
    // A line along the trench behind the doorway's side, a few paces along from the door.
    life.push({
      piece: TRENCH_PIECES.laundry,
      x: section.x + doorX * LAUNDRY.out - alongX * 1.2,
      y: floor + LAUNDRY.base,
      z: section.z + doorZ * LAUNDRY.out - alongZ * 1.2,
      yaw: section.yaw + (hashOf(section.x, section.z, 30) - 0.5) * 0.3
    })
  }
  if (hashOf(section.x, section.z, 27) < STOVEPIPE.share) {
    // Over the room dug in behind the doorway, a little along from it.
    life.push({
      piece: TRENCH_PIECES.stovepipe,
      x: section.x + doorX * STOVEPIPE.out + alongX * DUGOUT_DOOR.along,
      y: floor + STOVEPIPE.base,
      z: section.z + doorZ * STOVEPIPE.out + alongZ * DUGOUT_DOOR.along,
      yaw: hashOf(section.x, section.z, 28) * Math.PI * 2
    })
  }
  return life
}

/** A signboard on the parados where a communication trench joins a fire trench, pointing the way up it. */
function signAt(map: BattlefieldMap, x: number, z: number, inX: number, inZ: number): Placement {
  const sx = x + inX * (KIT.teeArm + 1.5) - inZ * 2.4
  const sz = z + inZ * (KIT.teeArm + 1.5) + inX * 2.4
  return {
    piece: TRENCH_PIECES.sign,
    x: sx,
    y: heightAt(map, sx, sz) - 0.1,
    z: sz,
    yaw: yawAlong(inX, inZ) + (hashOf(sx, sz, 23) - 0.5) * 0.3
  }
}

/**
 * Whether rainwater lies on the floor at a point along a trench: wherever the floor dips below the trench either side
 * of it, and in about a third of the rest, Verdun being Verdun.
 */
function standsInWater(
  segment: Segment,
  x: number,
  z: number,
  floor: number,
  floorAt: (x: number, z: number) => number
): boolean {
  const either = Math.min(
    floorAt(x - segment.dx * 6, z - segment.dz * 6),
    floorAt(x + segment.dx * 6, z + segment.dz * 6)
  )
  return floor <= either - 0.05 || hashOf(x, z, 20) <= 0.33
}

/** Up for a board lying on a plane rising `along` per metre along a direction and `across` per metre to its left. */
function upForPlane(dx: number, dz: number, along: number, across: number): [number, number, number] {
  const gx = along * dx - across * dz
  const gz = along * dz + across * dx
  const length = Math.hypot(gx, 1, gz)
  return [-gx / length, 1 / length, -gz / length]
}

/** Rainwater lying on the floor under the duckboards, wherever it stands (see standsInWater). */
function standingWater(
  segment: Segment,
  run: { from: number; to: number },
  bay: boolean,
  towardX: number,
  towardZ: number,
  floorAt: (x: number, z: number) => number
): Placement[] {
  const width = bay ? FIRE_STEP.inner + WALL - 0.1 : 2 * WALL - 0.1
  const offset = bay ? (FIRE_STEP.inner - WALL) / 2 : 0
  return tile(run, KIT.duckboard).flatMap(({ centre, length }) => {
    const { x, z, floor, slope } = along(segment, centre, length, floorAt)
    if (!standsInWater(segment, x, z, floor, floorAt)) {
      return []
    }
    return [
      {
        piece: TRENCH_PIECES.water,
        x: x + towardX * offset,
        y: floor + 0.07,
        z: z + towardZ * offset,
        yaw: yawAlong(segment.dx, segment.dz),
        up: upForSlope(segment.dx, segment.dz, slope),
        scale: [width / WATER_SIZE, 1, length / WATER_SIZE]
      }
    ]
  })
}

function duckboards(
  segment: Segment,
  run: { from: number; to: number },
  bay: boolean,
  towardX: number,
  towardZ: number,
  floorAt: (x: number, z: number) => number
): Placement[] {
  // In a bay the fire step takes the front of the floor, so the boards run down the rest.
  const width = bay ? FIRE_STEP.inner + WALL - 0.15 : KIT.duckboardWidth
  const offset = bay ? (FIRE_STEP.inner - WALL) / 2 : 0
  return tile(run, KIT.duckboard).map(({ centre, length }) => {
    const { x, z, floor, slope } = along(segment, centre, length, floorAt)
    // Boards in standing water have settled into the mud under it, each its own way.
    const wet = standsInWater(segment, x, z, floor, floorAt)
    const sunk = wet ? SINKING.depth * (0.4 + 0.6 * hashOf(x, z, 40)) : 0
    const pitch = wet ? (hashOf(x, z, 41) - 0.5) * 2 * SINKING.tilt : 0
    const roll = wet ? (hashOf(x, z, 42) - 0.5) * 1.2 * SINKING.tilt : 0
    return {
      piece: TRENCH_PIECES.duckboard,
      x: x + towardX * offset,
      y: floor + 0.1 - sunk,
      z: z + towardZ * offset,
      yaw: yawAlong(segment.dx, segment.dz),
      up: upForPlane(segment.dx, segment.dz, slope + Math.tan(pitch), Math.tan(roll)),
      scale: [width / KIT.duckboardWidth, 1, (length / KIT.duckboard) * 0.97]
    }
  })
}

function fireSteps(
  segment: Segment,
  run: { from: number; to: number },
  towardX: number,
  towardZ: number,
  floorAt: (x: number, z: number) => number
): Placement[] {
  const short = run.to - run.from < KIT.fireStepLong / 2
  const pieceLength = short ? KIT.fireStepShort : KIT.fireStepLong
  const offset = (FIRE_STEP.inner + FIRE_STEP.outer) / 2
  const depth = (FIRE_STEP.outer - FIRE_STEP.inner) / KIT.fireStepDepth
  return tile(run, pieceLength).map(({ centre, length }) => {
    const { x, z, floor, slope } = along(segment, centre, length, floorAt)
    return {
      piece: short ? TRENCH_PIECES.fireStepShort : TRENCH_PIECES.fireStepLong,
      x: x + towardX * offset,
      y: floor + 0.04 + KIT.fireStepHalfHeight,
      z: z + towardZ * offset,
      // The fire step's length runs along its x axis: turn x onto the segment, with its face toward the floor.
      yaw: yawAlong(towardX, towardZ) + Math.PI,
      up: upForSlope(segment.dx, segment.dz, slope),
      scale: [length / pieceLength, 1, depth]
    }
  })
}

function ladderIn(
  segment: Segment,
  run: { from: number; to: number },
  towardX: number,
  towardZ: number,
  floorAt: (x: number, z: number) => number
): Placement {
  const where = run.from + 2 + hashOf(segment.ax, segment.az, 2) * (run.to - run.from - 4)
  const x = segment.ax + segment.dx * where
  const z = segment.az + segment.dz * where
  // Footed on the fire step, leaning on the parapet.
  const lean = 0.32
  return {
    piece: TRENCH_PIECES.ladder,
    x: x + towardX * 0.55,
    y: floorAt(x, z) + 1.1,
    z: z + towardZ * 0.55,
    yaw: yawAlong(towardX, towardZ),
    up: [Math.sin(lean) * towardX, Math.cos(lean), Math.sin(lean) * towardZ]
  }
}

/**
 * A course of sandbags along the parapet crest of a bay, on nearly every bay in the front line and most behind it. Here
 * and there a shell has blown a stretch in, leaving a gap and a heap of burst bags slumped into it.
 */
function sandbags(
  segment: Segment,
  run: { from: number; to: number },
  towardX: number,
  towardZ: number,
  front: boolean,
  floorAt: (x: number, z: number) => number
): Placement[] {
  const laid = front ? SANDBAGS.laid.front : SANDBAGS.laid.rear
  if (run.to - run.from < 3 || hashOf(segment.ax + run.from, segment.az, 9) > laid) {
    return []
  }
  // Breaches part way along, never at the ends where the course meets a traverse.
  const breaches: number[] = []
  for (let at = run.from + 3; at < run.to - 3; at += SANDBAGS.breachEvery) {
    if (hashOf(segment.ax + at, segment.az, 24) < 0.5) {
      breaches.push(at + hashOf(segment.ax + at, segment.az, 25) * Math.min(SANDBAGS.breachEvery, run.to - 3 - at))
    }
  }
  const courses: { from: number; to: number }[] = []
  let from = run.from
  for (const breach of breaches) {
    courses.push({ from, to: breach - SANDBAGS.breachLength / 2 })
    from = breach + SANDBAGS.breachLength / 2
  }
  courses.push({ from, to: run.to })
  const crest = (centre: number, length: number) => {
    const { x, z, floor, slope } = along(segment, centre, length, floorAt)
    return {
      x: x + towardX * SANDBAGS.offset,
      y: floor + SANDBAGS.height,
      z: z + towardZ * SANDBAGS.offset,
      up: upForSlope(segment.dx, segment.dz, slope)
    }
  }
  const walls = courses
    .filter((course) => course.to - course.from > 1)
    .flatMap((course) => {
      // Long lengths where they fit, short ones in what's left.
      const long = course.to - course.from > 6.5
      const wall = long ? SANDBAGS.long : SANDBAGS.short
      const piece = long ? TRENCH_PIECES.sandbags : TRENCH_PIECES.sandbagsShort
      return tile(course, wall.length).map(({ centre, length }): Placement => ({
        piece,
        ...crest(centre, length),
        yaw: yawAlong(towardX, towardZ) + Math.PI,
        scale: [length / wall.length, SANDBAGS.course / wall.height, SANDBAGS.depth]
      }))
    })
  const heaps = breaches.map((breach): Placement => {
    const { x, y, z } = crest(breach, SANDBAGS.breachLength)
    return {
      piece: TRENCH_PIECES.sandbagHeap,
      x: x - towardX * 0.15,
      y: y - 0.2,
      z: z - towardZ * 0.15,
      yaw: yawAlong(towardX, towardZ) + Math.PI + (hashOf(x, z, 26) - 0.5) * 0.6,
      scale: [0.9, 0.55, 0.9]
    }
  })
  return [...walls, ...heaps]
}

/**
 * Stores and timber left lying on the lips of spoil either side of a trench: a burst bag, planks, a sheet of iron, an
 * ammunition box, a spare duckboard, a spade, a dud. Behind a bay only, clear of its fire step and sandbags.
 */
function lipLitter(
  segment: Segment,
  run: { from: number; to: number },
  bay: boolean,
  towardX: number,
  towardZ: number,
  floorAt: (x: number, z: number) => number
): Placement[] {
  const placements: Placement[] = []
  for (let at = run.from + LIP_SPACING / 2; at < run.to - 1; at += LIP_SPACING) {
    for (const side of bay ? [-1] : [-1, 1]) {
      const x0 = segment.ax + segment.dx * at
      const z0 = segment.az + segment.dz * at
      if (hashOf(x0, z0, 30 + side) > 0.5) {
        continue
      }
      const out = LIP.from + hashOf(x0, z0, 32 + side) * (LIP.to - LIP.from)
      const slide = (hashOf(x0, z0, 34 + side) - 0.5) * LIP_SPACING * 0.6
      const x = x0 + segment.dx * slide + towardX * side * out
      const z = z0 + segment.dz * slide + towardZ * side * out
      let roll = hashOf(x, z, 36) * LIP_LITTER_WEIGHT
      const [piece, , size] = LIP_LITTER.find(([, weight]) => (roll -= weight) < 0) ?? LIP_LITTER[0] ?? ["", 0, 1]
      const tilt = (hashOf(x, z, 37) - 0.5) * 0.3
      placements.push({
        piece,
        x,
        y: floorAt(x0, z0) + LIP.height,
        z,
        yaw: hashOf(x, z, 38) * Math.PI * 2,
        up: [Math.sin(tilt) * towardX * side, Math.cos(tilt), Math.sin(tilt) * towardZ * side],
        scale: [size, size, size]
      })
    }
  }
  return placements
}

/**
 * Stores, tools and sheets of iron left along a trench, against its rear wall (or either wall of a communication
 * trench): an occupied line, not a clean model.
 */
function clutter(
  segment: Segment,
  run: { from: number; to: number },
  bay: boolean,
  towardX: number,
  towardZ: number,
  front: boolean,
  floorAt: (x: number, z: number) => number
): Placement[] {
  const placements: Placement[] = []
  const chance = front ? 0.25 : 0.5
  for (let at = run.from + 1.5; at < run.to - 1.5; at += CLUTTER_SPACING) {
    const x = segment.ax + segment.dx * at
    const z = segment.az + segment.dz * at
    if (hashOf(x, z, 10) > chance) {
      continue
    }
    // Against the rear wall in a bay, where the fire step doesn't need clearing; either wall elsewhere.
    const side = bay || hashOf(x, z, 11) < 0.5 ? -1 : 1
    const wallX = towardX * side
    const wallZ = towardZ * side
    const floor = floorAt(x, z) + 0.1
    const roll = hashOf(x, z, 12)
    if (roll < 0.35) {
      const piece = TRENCH_PIECES.leaning[Math.floor(hashOf(x, z, 13) * TRENCH_PIECES.leaning.length)]
      const lean = piece === "Gen_Wep_Spade_01" ? 0.3 : 1.15
      placements.push({
        piece: piece ?? TRENCH_PIECES.leaning[0],
        x: x + wallX * 0.85,
        y: floor + (piece === "Gen_Wep_Spade_01" ? 0.3 : 0.55),
        z: z + wallZ * 0.85,
        yaw: yawAlong(segment.dx, segment.dz),
        up: [-wallX * Math.sin(lean), Math.cos(lean), -wallZ * Math.sin(lean)]
      })
    } else {
      const piece = TRENCH_PIECES.clutter[Math.floor(hashOf(x, z, 14) * TRENCH_PIECES.clutter.length)]
      placements.push({
        piece: piece ?? TRENCH_PIECES.clutter[0],
        x: x + wallX * 0.65,
        y: floor,
        z: z + wallZ * 0.65,
        yaw: yawAlong(segment.dx, segment.dz) + (hashOf(x, z, 15) - 0.5) * 0.8
      })
    }
  }
  return placements
}

/** Telephone poles carrying the line forward beside a communication trench, one to each long leg. */
function poles(map: BattlefieldMap, segment: Segment): Placement[] {
  const placements: Placement[] = []
  for (let at = POLES.spacing / 2; at < segment.length - 4; at += POLES.spacing) {
    const x = segment.ax + segment.dx * at - segment.dz * POLES.offset
    const z = segment.az + segment.dz * at + segment.dx * POLES.offset
    placements.push({
      piece: TRENCH_PIECES.pole,
      x,
      y: heightAt(map, x, z) - 0.15,
      z,
      yaw: hashOf(x, z, 16) * Math.PI,
      scale: [1, POLES.height, 1]
    })
  }
  return placements
}
