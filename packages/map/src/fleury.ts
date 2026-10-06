import fleuryFile from "../sectors/fleury.json" with { type: "json" }
import { type Crater, slumpGround, stampCrater } from "./craters.ts"
import { type Elevation, elevationAt } from "./elevation.ts"
import { type BattlefieldMap, createFlatMap, sampleIndex, Surface } from "./format.ts"
import { valueNoise } from "./noise.ts"
import { railwayCourse } from "./railways.ts"
import { findDebus, roadsBehindLines, type SideLines } from "./roads.ts"
import { heightAt } from "./sampling.ts"
import {
  footprintRadius,
  type Objective,
  type Railway,
  type Scenery,
  type SceneryKind,
  type WireBelt
} from "./scenery.ts"
import { sculptForRailways, sculptForScenery } from "./sculpt.ts"
import { fromTiledSector, lineZ, type TrenchSide } from "./sector-file.ts"
import { type Bay, communicationRoute, crenellatedTrace, junctionNear, TRENCH_GRID } from "./trench-trace.ts"
import { carveTrenches, type GroundPoint, type Trench, TRENCH_PROFILE } from "./trenches.ts"

/**
 * The Fleury sector: the prototype battlefield, after the ground north-east of Verdun fought over through the summer of
 * 1916. Not a survey of it: the names and the shape of the fighting are borrowed, the ground is laid out for play.
 *
 * The French hold the south, the Germans the ridge to the north. In the west the French front runs through the
 * shattered Bois de la Caillette and the Ravin de la Dame cuts down from the German lines into no man's land, dead
 * ground for whoever dares use it. In the east the ruins of Fleury sit on a low plateau where the lines close to 80 m.
 * A sunken road and two mine craters give cover in the middle of no man's land. Each side has a crenellated front
 * line, a support line and a reserve line joined by zigzag communication trenches, saps pushed out to listening posts,
 * belts of wire, machine guns and a battery of field guns behind.
 */

/**
 * The sector's lie of the ground and what stands on it, as laid out in Tiled (sectors/fleury.json, see sector-file.ts):
 * the generator fills in the trenches, shell holes and scenery round them.
 */
const FEATURES = fromTiledSector(fleuryFile)

/** The one feature of a kind the generator works with in Fleury, which has exactly one. */
function only<T>(list: readonly T[], what: string): T {
  const [first] = list
  if (list.length !== 1 || first === undefined) {
    throw new Error(`The Fleury sector needs exactly one ${what}, and its file has ${list.length}`)
  }
  return first
}

const WIDTH = FEATURES.width
const DEPTH = FEATURES.depth

export interface FleurySectorOptions {
  readonly seed?: number
  /** A hand-drawn layout to use instead of the generated trenches, wire and scenery. */
  readonly layout?: SectorLayout
  /**
   * The real ground, surveyed (see elevation.ts and scripts/fetch-elevation.mjs), in place of the generated rises and
   * plateau. The ravine and sunken road are still cut into it, and fresh shell holes added to the old ones it shows.
   */
  readonly elevation?: Elevation
  /** Grid resolution in metres. The simulation runs on 0.5 m. */
  readonly cellSize?: number
}

/** Seed offsets keep each noise field independent. */
const SEEDS = {
  height: 0,
  surface: 7_919,
  patch: 7_927,
  wire: 7_933,
  wood: 7_937,
  trace: 7_949,
  craters: 7_951,
  scenery: 7_963,
  orchard: 7_993,
  fences: 8_009
} as const

/** Ground height across the sector from south to north, before local landforms: a valley between two rises. */
const RISE = FEATURES.rise

const VILLAGE = only(FEATURES.villages, "village")
/** The ravine's bed from its head on the German ridge down into no man's land. */
const RAVINE_LINE = only(FEATURES.ravines, "ravine")
const RAVINE = RAVINE_LINE.points
const RAVINE_HALF_WIDTH = RAVINE_LINE.halfWidth
/** Deep enough, with steep enough sides, that only guns looking straight down it can see into its bed. */
const RAVINE_DEPTH = RAVINE_LINE.depth
/** The chemin creux: a lane worn below the fields, running west out of the village. */
const SUNKEN_ROAD_LINE = only(FEATURES.sunkenRoads, "sunken road")
const SUNKEN_ROAD = SUNKEN_ROAD_LINE.points
/**
 * Fleury's main street, where the survey still shows it a century on: a smooth band running down the plateau from the
 * German line in the north-west to the French line in the south-east.
 */
const MAIN_STREET = FEATURES.streets[0] ?? []
/** Chalk roads: through the village from the French rear to the German rear, and the lateral supply roads. */
const ROADS = FEATURES.roads
/** The village's other streets: the cross street the survey shows meeting the main street near the French line, and
 * the lane out to the sunken road. */
const SIDE_STREETS = FEATURES.streets.slice(1)
/** Roads behind the lines keep their surface; the one through no man's land and the village is shelled to nothing. */
const REAR_ROAD_LIMITS = FEATURES.rearRoads
const ROAD_HALF_WIDTH = 2.4

/**
 * The French field railway: a 60 cm Decauville line up from the rear toward Fort Souville, in from the sector's south
 * edge on the plateau behind the lines, over the main road and along the lateral road's rear side, down off the plateau
 * to a railhead, its shells and stores carried on up to the line by hand. The rest of the French rear falls a tenth of
 * its length toward the Meuse, too steep for the line, and the reserve line and the road leave it no room further north.
 */
const RAILWAYS = FEATURES.railways
/**
 * Fleury's church, sited as near here as the trenches and the shelling allow: behind the German front on the village's
 * north side, east of the main road, its tower to the west and its apse to the east. It's the landmark's second
 * variant; the great barn is the first.
 */
const CHURCH = only(FEATURES.churches, "church")
/** The church keeps this far, in metres from its middle, from trenches and everything else. */
const CHURCH_CLEARANCE = 9
/**
 * An orchard behind the French support line, east of the main road: `rows` rows of `trees` fruit trees, `spacing`
 * metres apart each way from its south-west tree at (x, z), with the shelling's gaps and stumps among them.
 */
const ORCHARD = only(FEATURES.orchards, "orchard")

/** Nothing is placed within this many metres of a railway's track: half a wagon's width and a margin. */
const RAILWAY_CLEARANCE = 1.8
/** The dumps the railway serves: one by the main road, and the railhead's at its end. */
const RAILWAY_DUMPS = FEATURES.dumps

/** Bois de la Caillette, through which the French front line runs; Bois des Corbeaux at the head of the ravine; and Bois
 * Fumin behind the German lines. */
const WOODS = FEATURES.woods

const MINE_CRATERS = FEATURES.craters

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** 1 between `from` and `to`, easing to 0 over `soft` metres outside them. */
function window(value: number, from: number, to: number, soft: number): number {
  return smoothstep(from - soft, from, value) * (1 - smoothstep(to, to + soft, value))
}

/** Mulberry32: a small deterministic random sequence for placing things. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** A polyline's legs and bounds, measured once: the generator asks after the same few lines millions of times. */
interface MeasuredLine {
  readonly lengths: readonly number[]
  readonly length: number
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

const measuredLines = new WeakMap<readonly GroundPoint[], MeasuredLine>()

function measureLine(line: readonly GroundPoint[]): MeasuredLine {
  const known = measuredLines.get(line)
  if (known) {
    return known
  }
  const lengths = line.slice(1).map((b, index) => {
    const a = line[index]
    return Math.hypot(b[0] - a[0], b[1] - a[1])
  })
  const xs = line.map(([x]) => x)
  const zs = line.map(([, z]) => z)
  const measured = {
    lengths,
    length: lengths.reduce((sum, length) => sum + length, 0),
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs)
  }
  measuredLines.set(line, measured)
  return measured
}

/** Slack on the bounds test, so rounding in the measured distance can't put a point the test ruled out within reach. */
const BOUNDS_SLACK = 1

/**
 * Distance from a point to a polyline, and how far along it (0 to 1) the nearest point lies. A point more than `within`
 * beyond the line's bounds is farther than that from all of it, so isn't measured: it comes back infinitely far.
 */
function nearestOnLine(
  line: readonly GroundPoint[],
  x: number,
  z: number,
  within = Infinity
): { distance: number; along: number } {
  const { lengths, length: lineLength, minX, maxX, minZ, maxZ } = measureLine(line)
  const reach = within + BOUNDS_SLACK
  if (x < minX - reach || x > maxX + reach || z < minZ - reach || z > maxZ + reach) {
    return { distance: Infinity, along: 0 }
  }
  let distance = Infinity
  let along = 0
  let total = 0
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]
    const a = line[index]
    const b = line[index + 1]
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (length * length)))
    const away = Math.hypot(x - (a[0] + (b[0] - a[0]) * t), z - (a[1] + (b[1] - a[1]) * t))
    if (away < distance) {
      distance = away
      along = (total + t * length) / lineLength
    }
    total += length
  }
  return { distance, along }
}

/** Whether a point lies within `within` of a polyline. */
function nearLine(line: readonly GroundPoint[], x: number, z: number, within: number): boolean {
  return nearestOnLine(line, x, z, within).distance < within
}

function riseAt(z: number): number {
  for (let index = 1; index < RISE.length; index++) {
    const [z0, h0] = RISE[index - 1]
    const [z1, h1] = RISE[index]
    if (z <= z1) {
      return h0 + (h1 - h0) * smoothstep(z0, z1, z)
    }
  }
  return RISE[RISE.length - 1][1]
}

/** Each side's trench system, as drawn in the sector file. */
const [FRENCH, GERMAN] = FEATURES.sides
if (FRENCH?.side !== "french" || GERMAN?.side !== "german") {
  throw new Error("The Fleury sector needs a French and a German trench system")
}
const frenchFront = (x: number) => lineZ(FRENCH.front, x)
const germanFront = (x: number) => lineZ(GERMAN.front, x)

/** How hard the ground has been shelled, from 1 in no man's land falling away behind the lines. */
function shelling(x: number, z: number): number {
  const french = frenchFront(x)
  const german = germanFront(x)
  const behind = Math.max(french - z, z - german, 0)
  return behind === 0 ? 1 : 0.08 + 0.6 * Math.exp(-behind / 32)
}

/** Generated ground where no survey is given: a valley between two rises, rolling, with a plateau for the village. */
function generatedGround(seed: number, x: number, z: number): number {
  const rolling =
    valueNoise(seed + SEEDS.height, x, z, 160) * 1 +
    valueNoise(seed + SEEDS.height + 1, x, z, 48) * 0.3 +
    valueNoise(seed + SEEDS.height + 2, x, z, 12) * 0.08
  const height = riseAt(z) + (rolling / 1.38 - 0.5) * 6
  const village = 1 - smoothstep(VILLAGE.radius * 0.55, VILLAGE.radius, Math.hypot(x - VILLAGE.x, z - VILLAGE.z))
  return height + (VILLAGE.height + (valueNoise(seed + 3, x, z, 30) - 0.5) - height) * village
}

/** The ground's height before trenches and shells: surveyed or generated, with the ravine and sunken road cut in. */
function heightAtSample(seed: number, x: number, z: number, elevation: Elevation | undefined): number {
  // Surveyed ground is the ground as it is: its ravine and sunken road are in the survey already.
  if (elevation) {
    return elevationAt(elevation, x, z)
  }
  let height = generatedGround(seed, x, z)

  const ravine = nearestOnLine(RAVINE, x, z, RAVINE_HALF_WIDTH)
  if (ravine.distance < RAVINE_HALF_WIDTH) {
    const across = ravine.distance / RAVINE_HALF_WIDTH
    // A flat bed between steep banks.
    // Deepest along the middle of its course, shallowing out at the head and the mouth.
    const depth = RAVINE_DEPTH * window(ravine.along, 0.12, 0.9, 0.1)
    height -= depth * (1 - smoothstep(0.3, 1, across))
  }

  const { halfWidth, depth } = SUNKEN_ROAD_LINE
  const lane = nearestOnLine(SUNKEN_ROAD, x, z, halfWidth)
  if (lane.distance < halfWidth) {
    height -= depth * (1 - smoothstep(1.8, halfWidth, lane.distance)) * window(lane.along, 0.08, 0.92, 0.08)
  }
  return height
}

/**
 * Heights that set the ground's character: hollows below `low` hold mud and water, ground above `high` shows chalk, and
 * craters above `ridge` throw up chalk rims.
 */
interface GroundLevels {
  readonly low: number
  readonly ridge: number
  readonly high: number
}

const GENERATED_LEVELS: GroundLevels = { low: 4.5, ridge: 11, high: 13 }

/** Levels for surveyed ground, from its own spread of heights. */
function levelsOf(elevation: Elevation): GroundLevels {
  const sorted = Float32Array.from(elevation.heights).sort()
  const at = (share: number) => sorted[Math.floor(share * (sorted.length - 1))] ?? 0
  return { low: at(0.15), ridge: at(0.88), high: at(0.93) }
}

function surfaceAtSample(seed: number, x: number, z: number, height: number, levels: GroundLevels): Surface {
  const intensity = shelling(x, z)
  const grain = valueNoise(seed + SEEDS.surface, x, z, 9)
  const patch = valueNoise(seed + SEEDS.patch, x, z, 26)
  if (nearLine(RAVINE, x, z, 5) || nearLine(SUNKEN_ROAD, x, z, 2.5)) {
    return Surface.Mud
  }
  const village = Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius * 0.7
  if (village) {
    // Broken plaster and chalk rubble showing through the churned earth.
    return grain > 0.78 ? Surface.Chalk : Surface.Churned
  }
  if (intensity > 0.78 + (grain - 0.5) * 0.3) {
    return grain > 0.74 ? Surface.Mud : Surface.Churned
  }
  if (intensity > 0.42 + (patch - 0.5) * 0.35) {
    return grain > 0.6 ? Surface.Churned : Surface.Mud
  }
  // Behind the lines: chalk breaking through on the ridge, mud in the hollows, rough grass elsewhere.
  if (height > levels.high && patch > 0.62) {
    return Surface.Chalk
  }
  if (height < levels.low || patch < 0.24) {
    return Surface.Mud
  }
  return Surface.Grass
}

interface SideLayout {
  readonly towardEnemy: 1 | -1
  /** The lines as drawn, for where each starts and ends. */
  readonly lines: {
    readonly front: readonly GroundPoint[]
    readonly support: readonly GroundPoint[]
    readonly reserve: readonly GroundPoint[]
  }
  readonly front: (x: number) => number
  readonly support: (x: number) => number
  readonly reserve: (x: number) => number
  /** Where communication trenches run up from the support line to the front line, by x. */
  readonly forward: readonly number[]
  /** Where they run up from the reserve line to the support line. */
  readonly rear: readonly number[]
  /** Where saps push out from the front line toward the enemy. */
  readonly saps: readonly number[]
  /** Distances in front of the front line of each belt of wire. */
  readonly wire: readonly number[]
}

interface SideTrenches {
  readonly trenches: Trench[]
  /** The front line's bays, for staking wire in front of them. */
  readonly frontBays: Bay[]
  /** The far ends of the saps, where listening posts and machine guns sit. */
  readonly sapHeads: GroundPoint[]
  /** Where communication trenches leave the support and reserve lines: supply dumps go there. */
  readonly communicationEnds: GroundPoint[]
  /** Front bays with a machine gun on the parapet. */
  readonly machineGunBays: Bay[]
}

/** Where a drawn line starts and ends, west to east. */
function extent(line: readonly GroundPoint[]): { fromX: number; toX: number } {
  return { fromX: line[0]?.[0] ?? 0, toX: line.at(-1)?.[0] ?? 0 }
}

/** Lays out one side's trench system: three crenellated lines, communication trenches between them, and saps. */
function layOutSide(layout: SideLayout, random: () => number): SideTrenches {
  const facing = layout.towardEnemy === 1 ? "north" : "south"
  const pick = (choices: readonly number[]) => () => choices[Math.floor(random() * choices.length)] ?? 1
  const frontSections = pick([2, 3, 4, 4, 5, 6])
  const supportSections = pick([5, 6, 7, 8, 9])
  const reserveSections = pick([8, 10, 12, 14])

  const front = crenellatedTrace({
    ...extent(layout.lines.front),
    frontZ: layout.front,
    towardEnemy: layout.towardEnemy,
    sections: frontSections
  })
  const support = crenellatedTrace({
    ...extent(layout.lines.support),
    frontZ: layout.support,
    towardEnemy: layout.towardEnemy,
    sections: supportSections
  })
  const reserve = crenellatedTrace({
    ...extent(layout.lines.reserve),
    frontZ: layout.reserve,
    towardEnemy: layout.towardEnemy,
    sections: reserveSections
  })
  const trenches: Trench[] = [
    { kind: "fire", points: front.points, facing },
    { kind: "fire", points: support.points, facing },
    { kind: "fire", points: reserve.points, facing }
  ]

  // A junction needs a bay to itself: a sap and a communication trench meeting one bay would cross.
  const used = new Set<number>()
  const freeBays = (bays: readonly Bay[]) => bays.filter((bay) => !used.has(bay.fromX))
  const claim = (bays: readonly Bay[], point: GroundPoint) => {
    const bay = bays.find((candidate) => candidate.fromX <= point[0] && candidate.toX >= point[0])
    if (bay) {
      used.add(bay.fromX)
    }
    return bay
  }

  const communicationEnds: GroundPoint[] = []
  for (const x of layout.forward) {
    const to = junctionNear(freeBays(front.bays), x, true)
    const bay = claim(front.bays, to)
    // Arrive from behind, clear of the rear bays either side of the one it joins.
    const index = bay ? front.bays.indexOf(bay) : -1
    const rearmost = [front.bays[index - 1], front.bays[index + 1]]
      .filter((neighbour) => neighbour !== undefined)
      .reduce((most, neighbour) => Math.max(most, Math.abs(neighbour.z - to[1])), 0)
    const from = junctionNear(support.bays, to[0] + (random() - 0.5) * 6, true)
    trenches.push({
      kind: "communication",
      points: communicationRoute(from, to, { firstLeg: 9, lastLeg: rearmost + TRENCH_GRID.spacing + 1 }),
      facing: null
    })
    communicationEnds.push(from)
  }
  for (const x of layout.rear) {
    const to = junctionNear(support.bays, x, false)
    const from = junctionNear(reserve.bays, to[0] + (random() - 0.5) * 6, true)
    trenches.push({ kind: "communication", points: communicationRoute(from, to, { firstLeg: 9 }), facing: null })
    communicationEnds.push(from)
  }

  const sapHeads: GroundPoint[] = []
  for (const x of layout.saps) {
    const start = junctionNear(freeBays(front.bays), x, true)
    // A sap goes where it's wanted or not at all: one sited by chance can cover ground meant to be dead.
    if (Math.abs(start[0] - x) > 30) {
      continue
    }
    claim(front.bays, start)
    const head: GroundPoint = [start[0], start[1] + layout.towardEnemy * (14 + random() * 4)]
    trenches.push({ kind: "communication", points: [start, head], facing: null })
    sapHeads.push(head)
  }

  // Machine guns on the parapet of every fourth free long bay.
  const machineGunBays = freeBays(front.bays)
    .filter((bay) => bay.front && bay.toX - bay.fromX > 4 * TRENCH_GRID.clearance)
    .filter((_, index) => index % 4 === 1)

  return { trenches, frontBays: front.bays, sapHeads, communicationEnds, machineGunBays }
}

/** A side's layout as drawn: its lines' courses, where its communication trenches and saps go, and its wire. */
function layoutOf(side: TrenchSide): SideLayout {
  return {
    towardEnemy: side.side === "french" ? 1 : -1,
    lines: { front: side.front, support: side.support, reserve: side.reserve },
    front: (x) => lineZ(side.front, x),
    support: (x) => lineZ(side.support, x),
    reserve: (x) => lineZ(side.reserve, x),
    forward: side.forward,
    rear: side.rear,
    saps: side.saps,
    wire: side.wire
  }
}

function segmentsOf(trenches: readonly Trench[]): [GroundPoint, GroundPoint][] {
  return trenches.flatMap((trench) =>
    trench.points.slice(1).map((b, index): [GroundPoint, GroundPoint] => [trench.points[index], b])
  )
}

/** Distance from a point to the nearest trench centre line. */
function trenchDistance(segments: readonly [GroundPoint, GroundPoint][], x: number, z: number): number {
  let nearest = Infinity
  for (const [a, b] of segments) {
    const abx = b[0] - a[0]
    const abz = b[1] - a[1]
    const lengthSquared = abx * abx + abz * abz
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSquared))
    nearest = Math.min(nearest, Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t)))
  }
  return nearest
}

/** How far forward a front line reaches near `x`: the most forward of its bays within `reach` metres either side. */
function forwardEdge(bays: readonly Bay[], towardEnemy: 1 | -1, x: number, reach = 12): number {
  // Front bays only: where a long rear bay is all that lies near, the line still reaches as far as its front bays.
  const fronts = bays.filter((bay) => bay.front)
  let nearby = fronts.filter((bay) => bay.toX >= x - reach && bay.fromX <= x + reach).map((bay) => bay.z)
  if (nearby.length === 0) {
    const distance = (bay: Bay) => Math.abs((bay.fromX + bay.toX) / 2 - x)
    nearby = [...fronts]
      .sort((a, b) => distance(a) - distance(b))
      .slice(0, 2)
      .map((bay) => bay.z)
  }
  return towardEnemy === 1 ? Math.max(...nearby) : Math.min(...nearby)
}

/** Gaps where at most this many of a belt's posts, 5 m apart, are left out are closed at stand-to (see closeGaps). */
const CLOSED_GAP_POSTS = 2

/** A gap in a belt of wire, from its last post before the gap to its first after it. */
interface WireGap {
  readonly from: GroundPoint
  readonly to: GroundPoint
}

/** Patrol gaps in a belt are this many metres wide, from its last post before the gap to its first after it. */
const PATROL_GAP = { narrowest: 10, widest: 16 } as const
/** And this many metres of wire stand between one patrol gap and the next. */
const PATROL_WIRE = { shortest: 22, longest: 50 } as const

/**
 * Where a belt is left open for patrols, from west to east: gaps of 10 to 16 m every few tens of metres, at random, as
 * the thin wire of a shell-hole line was laid in haste by night and never made whole.
 */
function patrolGaps(random: () => number, fromX: number, toX: number): (readonly [number, number])[] {
  const gaps: (readonly [number, number])[] = []
  let start = fromX + PATROL_WIRE.shortest * random()
  while (start < toX) {
    const width = PATROL_GAP.narrowest + (PATROL_GAP.widest - PATROL_GAP.narrowest) * random()
    gaps.push([start, start + width])
    start += width + PATROL_WIRE.shortest + (PATROL_WIRE.longest - PATROL_WIRE.shortest) * random()
  }
  return gaps
}

/**
 * Belts of wire in front of a side's front line, staked out from the bays nearest each point so they clear the line
 * where it bends, and broken by patrol gaps, left open, and gaps for the saps' listening posts. `closed` is every other
 * gap of a post or two, fenced at stand-to (see closeGaps).
 */
function wireBelts(
  seed: number,
  layout: SideLayout,
  own: SideTrenches,
  enemy: SideTrenches
): { belts: WireBelt[]; closed: WireGap[] } {
  const belts: WireBelt[] = []
  const closed: WireGap[] = []
  const enemyToward = layout.towardEnemy === 1 ? -1 : 1
  for (const [beltIndex, offset] of layout.wire.entries()) {
    let points: GroundPoint[] = []
    const flush = () => {
      if (points.length >= 2) {
        belts.push({ points })
      }
      points = []
    }
    // The belt's last post, and how many posts have been left out since.
    let last: GroundPoint | null = null
    let missing = 0
    // Whether the posts left out since the last one make a patrol gap, which is left open.
    let patrolled = false
    const { fromX, toX } = extent(layout.lines.front)
    const random = createRandom(seed + SEEDS.wire + beltIndex * 101 + (layout.towardEnemy === 1 ? 0 : 53))
    const open = patrolGaps(random, fromX, toX)
    for (let x = fromX; x <= toX; x += 5) {
      const ragged = (valueNoise(seed + SEEDS.wire + beltIndex, x, 0, 24) - 0.5) * 8
      const ownEdge = forwardEdge(own.frontBays, layout.towardEnemy, x)
      const z = ownEdge + layout.towardEnemy * (offset + ragged)
      // Stay on our own half of no man's land where the lines close up.
      const middle = (ownEdge + forwardEdge(enemy.frontBays, enemyToward, x)) / 2
      const ownHalf = layout.towardEnemy * (middle - z) > 6
      const patrolGap = open.some(([from, to]) => x > from && x < to)
      const nearSap = own.sapHeads.some(([sapX]) => Math.abs(sapX - x) < 5)
      if (!ownHalf || patrolGap || nearSap) {
        flush()
        missing += 1
        patrolled ||= patrolGap
      } else {
        // Where the lines close up the belt breaks off for tens of metres: no fences close that.
        if (last && missing > 0 && missing <= CLOSED_GAP_POSTS && !patrolled) {
          closed.push({ from: last, to: [x, z] })
        }
        missing = 0
        patrolled = false
        points.push([x, z])
        last = [x, z]
      }
    }
    flush()
  }
  return { belts, closed }
}

/**
 * The simulation stamps a belt's wire this far either side of its line, past its end posts too (sim/wire.ts). A wooden
 * fence (3.64 m long, which men climb) clears the small stuff this far round it, and fences go this far
 * apart at most, so their rails overlap and leave no way through but over them.
 */
const WIRE_STAMP = { belt: 1.7, fence: 1.5, apart: 2.9 } as const
/** What a wooden fence is dragged over or pushes aside: the small stuff of the ground. Anything else blocks the gap itself. */
const UNDERFOOT: ReadonlySet<SceneryKind> = new Set(["tree", "fruit-tree", "stump", "log", "rubble"])

/**
 * Fences the short gaps in the wire at stand-to: the sap gaps and any other break of a post or two (the patrol gaps are
 * left open). Wooden fences go evenly across each gap's clear ground, between the stamps of the belts' end posts, near
 * enough together to leave no way through but over them. Placed after everything else, on random draws of their own,
 * so they move nothing. Trees, stumps, logs and rubble in their way make room. A fence that would stand in a trench, or
 * well inside a ruin, wall or other solid thing, isn't needed: that fills its part of the gap already.
 */
function closeGaps(
  placer: Placer,
  segments: readonly [GroundPoint, GroundPoint][],
  gaps: readonly { readonly gap: WireGap; readonly heading: number }[],
  random: () => number
): void {
  for (const { gap, heading } of gaps) {
    const [fromX, fromZ] = gap.from
    const [toX, toZ] = gap.to
    const length = Math.hypot(toX - fromX, toZ - fromZ)
    const clear = length - 2 * WIRE_STAMP.belt
    const count = Math.max(1, Math.ceil(clear / WIRE_STAMP.apart))
    for (let fence = 0; fence < count; fence++) {
      const t = (WIRE_STAMP.belt + (clear * (fence + 0.5)) / count) / length
      const x = fromX + (toX - fromX) * t
      const z = fromZ + (toZ - fromZ) * t
      const [turn, variant] = [random(), random()]
      const near = (item: Scenery, reach: number) => Math.hypot(item.x - x, item.z - z) < reach + footprintRadius(item)
      // A sap runs through its gap: the fences stand either side of it, and the sap head has its own.
      if (
        trenchDistance(segments, x, z) < TRENCH_PROFILE.parapetOuter ||
        placer.scenery.some((item) => !UNDERFOOT.has(item.kind) && item.kind !== "pool" && near(item, -1))
      ) {
        continue
      }
      placer.remove((item) => UNDERFOOT.has(item.kind) && near(item, WIRE_STAMP.fence))
      placer.place("wooden-fence", x, z, heading + (turn - 0.5) * 0.4, { variant: Math.floor(variant * 1_000) })
    }
  }
}

/** Ground each kind of scenery keeps clear of other scenery, in metres. Pools use their radius; the rest 1.5 m. */
const FOOTPRINTS: Partial<Record<SceneryKind, number>> = { ruin: 6, landmark: 11 }

interface Placer {
  readonly scenery: Scenery[]
  place(kind: SceneryKind, x: number, z: number, heading: number, options?: { variant?: number; scale?: number }): void
  /** True when nothing placed so far, and no trench or railway track, lies within `radius` of the point. */
  isClear(x: number, z: number, radius: number): boolean
  /**
   * Lays field railways through what's been placed: clears away what stands on or beside their track, and keeps what's
   * placed from then on off it. Laid after the rest, the rest is placed exactly as it would be without them.
   */
  layRailways(railways: readonly Railway[]): void
  /** Takes away what's been placed that `test` picks, to make room for something placed after. */
  remove(test: (item: Scenery) => boolean): void
}

/** Ground a piece of scenery keeps clear of others, in metres. */
function footprintOf(kind: SceneryKind, scale: number): number {
  return FOOTPRINTS[kind] ?? (kind === "pool" ? scale : 1.5)
}

function createPlacer(segments: readonly [GroundPoint, GroundPoint][], random: () => number): Placer {
  const scenery: Scenery[] = []
  const footprints: { x: number; z: number; radius: number }[] = []
  let courses: GroundPoint[][] = []
  const onTrack = (x: number, z: number, radius: number) =>
    courses.some((course) => nearLine(course, x, z, radius + RAILWAY_CLEARANCE))
  return {
    scenery,
    place(kind, x, z, heading, { variant = Math.floor(random() * 1_000), scale = 1 } = {}) {
      scenery.push({ kind, x, z, heading, variant, scale })
      footprints.push({ x, z, radius: footprintOf(kind, scale) })
    },
    isClear(x, z, radius) {
      if (x < 2 || z < 2 || x > WIDTH - 2 || z > DEPTH - 2) {
        return false
      }
      if (trenchDistance(segments, x, z) < radius + TRENCH_PROFILE.parapetOuter) {
        return false
      }
      if (onTrack(x, z, radius)) {
        return false
      }
      return footprints.every((footprint) => Math.hypot(footprint.x - x, footprint.z - z) > footprint.radius + radius)
    },
    layRailways(railways) {
      courses = railways.map(railwayCourse)
      const standing = scenery.filter((item) => !onTrack(item.x, item.z, footprintOf(item.kind, item.scale)))
      scenery.splice(0, scenery.length, ...standing)
      const kept = footprints.filter((footprint) => !onTrack(footprint.x, footprint.z, footprint.radius))
      footprints.splice(0, footprints.length, ...kept)
    },
    remove(test) {
      const gone = scenery.filter(test)
      scenery.splice(0, scenery.length, ...scenery.filter((item) => !test(item)))
      const kept = footprints.filter(
        (footprint) => !gone.some((item) => item.x === footprint.x && item.z === footprint.z)
      )
      footprints.splice(0, footprints.length, ...kept)
    }
  }
}

/** What's left of a tree: where the shelling is heaviest nothing is left standing. */
function woodland(shelled: number, roll: number): SceneryKind {
  if (shelled > 0.7) {
    return roll < 0.65 ? "stump" : "log"
  }
  if (roll < 0.62) {
    return "tree"
  }
  return roll < 0.9 ? "stump" : "log"
}

function placeWoods(seed: number, placer: Placer, random: () => number): void {
  const spacing = 4.5
  for (const wood of WOODS) {
    for (let z = wood.z - wood.radiusZ; z <= wood.z + wood.radiusZ; z += spacing) {
      for (let x = wood.x - wood.radiusX; x <= wood.x + wood.radiusX; x += spacing) {
        const px = x + (random() - 0.5) * spacing
        const pz = z + (random() - 0.5) * spacing
        const edge = Math.hypot((px - wood.x) / wood.radiusX, (pz - wood.z) / wood.radiusZ)
        const ragged = edge + (valueNoise(seed + SEEDS.wood, px, pz, 30) - 0.5) * 0.5
        if (ragged > 1 || random() > wood.density * (1 - ragged ** 3) * 0.85 || !placer.isClear(px, pz, 1.2)) {
          continue
        }
        placer.place(woodland(shelling(px, pz), random()), px, pz, random() * Math.PI * 2, {
          scale: 0.8 + random() * 0.45
        })
      }
    }
  }
}

function placeRoadsideTrees(placer: Placer, random: () => number): void {
  for (const road of ROADS) {
    for (let index = 1; index < road.length; index++) {
      const [ax, az] = road[index - 1]
      const [bx, bz] = road[index]
      const length = Math.hypot(bx - ax, bz - az)
      for (let along = 6; along < length; along += 13) {
        const t = along / length
        const side = Math.floor(along / 13) % 2 === 0 ? 1 : -1
        const x = ax + (bx - ax) * t + ((bz - az) / length) * side * 5
        const z = az + (bz - az) * t - ((bx - ax) / length) * side * 5
        if (shelling(x, z) > 0.5 || random() < 0.25 || !placer.isClear(x, z, 1)) {
          continue
        }
        placer.place(random() < 0.7 ? "tree" : "stump", x, z, random() * Math.PI * 2, { scale: 1 + random() * 0.3 })
      }
    }
  }
}

/** No house stands within this many metres of the map's edge, where the ground ends. */
const EDGE_MARGIN = 14
/** House plots front the streets this far apart: a cottage, its barn door and a yard. */
const PLOT_WIDTH = 11
/** From the middle of the street to the middle of a house fronting it. */
const HOUSE_SETBACK = 7.5
/** A point beside a street: `along` metres from its start, `offset` metres to its right (negative: left). */
function besideStreet(
  street: readonly GroundPoint[],
  along: number,
  offset: number
): { x: number; z: number; heading: number } | null {
  let remaining = along
  for (let index = 1; index < street.length; index++) {
    const [ax, az] = street[index - 1]
    const [bx, bz] = street[index]
    const length = Math.hypot(bx - ax, bz - az)
    if (remaining <= length) {
      const t = remaining / length
      return {
        x: ax + (bx - ax) * t + ((bz - az) / length) * offset,
        z: az + (bz - az) * t - ((bx - ax) / length) * offset,
        heading: Math.atan2(bx - ax, bz - az)
      }
    }
    remaining -= length
  }
  return null
}

function streetLength(street: readonly GroundPoint[]): number {
  return street.slice(1).reduce((total, [bx, bz], index) => {
    const [ax, az] = street[index]
    return total + Math.hypot(bx - ax, bz - az)
  }, 0)
}

/** True when a shell hole big enough to have taken a house lies within `reach` of a point. */
function shelledOut(craters: readonly Crater[], x: number, z: number, reach: number): boolean {
  return craters.some((crater) => crater.radius > 2.5 && Math.hypot(crater.x - x, crater.z - z) < crater.radius + reach)
}

/**
 * Houses on their plots either side of a street, gable to the street, with garden walls between the plots. A plot a
 * big shell hole has taken holds only a heap of rubble; a few were yards and gardens to begin with.
 */
function lineStreet(
  placer: Placer,
  street: readonly GroundPoint[],
  craters: readonly Crater[],
  random: () => number
): void {
  const length = streetLength(street)
  for (let along = PLOT_WIDTH / 2; along < length; along += PLOT_WIDTH) {
    for (const side of [-1, 1]) {
      const plot = besideStreet(street, along, side * (HOUSE_SETBACK + random() * 1.5))
      if (!plot || Math.min(plot.x, plot.z, WIDTH - plot.x, DEPTH - plot.z) < EDGE_MARGIN) {
        continue
      }
      const facing = plot.heading - (side * Math.PI) / 2
      if (random() < 0.15) {
        // A yard: only its wall along the street is left.
        const front = besideStreet(street, along, side * 4)
        if (front && placer.isClear(front.x, front.z, 1.5)) {
          placer.place("wall", front.x, front.z, plot.heading + (random() - 0.5) * 0.2)
        }
      } else if (shelledOut(craters, plot.x, plot.z, 2)) {
        if (placer.isClear(plot.x, plot.z, 2)) {
          placer.place("rubble", plot.x, plot.z, random() * Math.PI * 2, { scale: 0.9 + random() * 0.4 })
        }
      } else if (placer.isClear(plot.x, plot.z, 4.5)) {
        placer.place("ruin", plot.x, plot.z, facing)
      }
      // The garden wall between this plot and the next, running back from the street.
      const boundary = besideStreet(street, along + PLOT_WIDTH / 2, side * (HOUSE_SETBACK + 6))
      if (boundary && random() < 0.55 && placer.isClear(boundary.x, boundary.z, 1.5)) {
        placer.place("wall", boundary.x, boundary.z, boundary.heading + Math.PI / 2 + (random() - 0.5) * 0.25)
      }
    }
  }
}

/** How deep into big shell holes a site reaches: 0 when none comes within `reach`. */
function shellDamage(craters: readonly Crater[], x: number, z: number, reach: number): number {
  return craters
    .filter((crater) => crater.radius > 2.5)
    .reduce((damage, crater) => damage + Math.max(0, crater.radius + reach - Math.hypot(crater.x - x, crater.z - z)), 0)
}

/**
 * The village's landmark: the great barn of the farm on the main street, its chimney stack still standing, seen from
 * anywhere in the sector. It takes the plot beside the street, near the middle of the village, that big shell holes
 * have reached least.
 */
function placeLandmark(placer: Placer, craters: readonly Crater[]): void {
  const length = streetLength(MAIN_STREET)
  let best: { x: number; z: number; heading: number; damage: number } | null = null
  for (let step = 0; step < 40 && best?.damage !== 0; step++) {
    const along = length / 2 + (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 3
    const site = besideStreet(MAIN_STREET, along, -(HOUSE_SETBACK + 4))
    if (site && placer.isClear(site.x, site.z, 8)) {
      const damage = shellDamage(craters, site.x, site.z, 6)
      if (!best || damage < best.damage) {
        best = { ...site, damage }
      }
    }
  }
  if (best) {
    placer.place("landmark", best.x, best.z, best.heading + Math.PI / 2, { variant: 0 })
  }
}

/** Fleury's church (see CHURCH): on the clearest, least shelled ground within a few rings of its site. */
function placeChurch(placer: Placer, craters: readonly Crater[]): void {
  let best: { x: number; z: number; damage: number } | null = null
  for (let ring = 0; ring < 5 && best?.damage !== 0; ring++) {
    for (let step = 0; step < Math.max(1, ring * 8); step++) {
      const angle = (step / Math.max(1, ring * 8)) * Math.PI * 2
      const x = CHURCH.x + Math.cos(angle) * ring * 3
      const z = CHURCH.z + Math.sin(angle) * ring * 3
      if (placer.isClear(x, z, CHURCH_CLEARANCE)) {
        const damage = shellDamage(craters, x, z, 6)
        if (!best || damage < best.damage) {
          best = { x, z, damage }
        }
      }
    }
  }
  if (best) {
    placer.place("landmark", best.x, best.z, CHURCH.heading, { variant: CHURCH.variant })
  }
}

/**
 * The orchard (see ORCHARD): a fruit tree where each stood, one in eight gone and one in five shot down to a stump.
 * Every tree's draws are made whether it stands or not, so one gone moves none of the rest.
 */
function placeOrchard(placer: Placer, random: () => number): void {
  for (let row = 0; row < ORCHARD.rows; row++) {
    for (let tree = 0; tree < ORCHARD.trees; tree++) {
      const [acrossJitter, alongJitter, fate, turn, size] = [random(), random(), random(), random(), random()]
      const x = ORCHARD.x + tree * ORCHARD.spacing + (acrossJitter - 0.5) * ORCHARD.jitter
      const z = ORCHARD.z + row * ORCHARD.spacing + (alongJitter - 0.5) * ORCHARD.jitter
      if (fate < 0.12 || !placer.isClear(x, z, 0.8)) {
        continue
      }
      const heading = turn * Math.PI * 2
      if (fate < 0.32) {
        placer.place("stump", x, z, heading, { variant: 0, scale: 0.5 + size * 0.25 })
      } else {
        placer.place("fruit-tree", x, z, heading, { variant: Math.floor(size * 4), scale: 0.9 + size * 0.25 })
      }
    }
  }
}

function placeVillage(placer: Placer, craters: readonly Crater[], random: () => number): void {
  placeLandmark(placer, craters)
  for (const street of [MAIN_STREET, ...SIDE_STREETS]) {
    lineStreet(placer, street, craters, random)
  }
  // Houses off the streets, and rubble thrown everywhere.
  for (let attempt = 0; attempt < 300; attempt++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * VILLAGE.radius
    const x = VILLAGE.x + Math.cos(angle) * distance
    const z = VILLAGE.z + Math.sin(angle) * distance
    if (attempt % 6 === 0 && !shelledOut(craters, x, z, 2) && placer.isClear(x, z, 6)) {
      placer.place("ruin", x, z, Math.round(random() * 4) * (Math.PI / 2) + 0.12)
    } else if (placer.isClear(x, z, 2)) {
      placer.place("rubble", x, z, random() * Math.PI * 2, { scale: 0.6 + random() * 0.4 })
    }
  }
}

function placeBattery(placer: Placer, guns: readonly GroundPoint[], heading: number): void {
  for (const [x, z] of guns) {
    if (placer.isClear(x, z, 3)) {
      placer.place("gun", x, z, heading, { variant: 0 })
    }
  }
}

/** Nearest clear spot to a wanted one, searching outward in rings. */
function placeNear(placer: Placer, kind: SceneryKind, x: number, z: number, heading: number, radius: number): void {
  for (let ring = 0; ring < 8; ring++) {
    for (let step = 0; step < Math.max(1, ring * 6); step++) {
      const angle = (step / Math.max(1, ring * 6)) * Math.PI * 2
      const px = x + Math.cos(angle) * ring * 3
      const pz = z + Math.sin(angle) * ring * 3
      if (placer.isClear(px, pz, radius)) {
        placer.place(kind, px, pz, heading)
        return
      }
    }
  }
}

function placeCraters(
  seed: number,
  map: BattlefieldMap,
  segments: readonly [GroundPoint, GroundPoint][],
  random: () => number,
  count: number,
  ridge: number
): Crater[] {
  const craters: Crater[] = [...MINE_CRATERS]
  const rearRoad = (x: number, z: number) =>
    ROADS.some((road) => nearLine(road, x, z, ROAD_HALF_WIDTH + 2)) &&
    (z < REAR_ROAD_LIMITS.french || z > REAR_ROAD_LIMITS.german)
  for (let attempt = 0; attempt < 40_000 && craters.length < count; attempt++) {
    const x = random() * WIDTH
    const z = random() * DEPTH
    if (random() > shelling(x, z) ** 1.6) {
      continue
    }
    // Mostly field-gun shells; one in thirty from the heavy howitzers.
    const heavy = random() < 1 / 30
    const radius = heavy ? 4.5 + random() * 2.5 : 1.1 + 3 * random() ** 2.2
    const depth = radius * (heavy ? 0.5 : 0.34 + random() * 0.14)
    // Keep clear of the trench kit's lips, and of the roads still in use behind the lines.
    if (trenchDistance(segments, x, z) < radius * 1.5 + TRENCH_PROFILE.parapetOuter + 0.5 || rearRoad(x, z)) {
      continue
    }
    craters.push({ x, z, radius, depth })
  }
  // Shells bursting on the ridge throw up the chalk beneath the topsoil.
  const onRidge = craters.map((crater) => heightAt(map, crater.x, crater.z) > ridge)
  // Fresh walls and lips settle: no wall left standing steeper than about 45 degrees.
  slumpGround(
    map,
    craters.map((crater) => stampCrater(map, crater))
  )
  // Only the bigger shells dig down to the chalk, and not every time.
  craters.forEach((crater, index) => {
    if (onRidge[index] && crater.radius > 2 && random() < 0.5) {
      exposeChalk(seed, map, crater)
    }
  })
  return craters
}

/** Marks the spoil thrown up around a crater's rim as chalk, raggedly. */
function exposeChalk(seed: number, map: BattlefieldMap, crater: Crater): void {
  const reach = crater.radius * 1.45
  const minColumn = Math.max(0, Math.floor((crater.x - reach) / map.cellSize))
  const maxColumn = Math.min(map.columns, Math.ceil((crater.x + reach) / map.cellSize))
  const minRow = Math.max(0, Math.floor((crater.z - reach) / map.cellSize))
  const maxRow = Math.min(map.rows, Math.ceil((crater.z + reach) / map.cellSize))
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const x = column * map.cellSize
      const z = row * map.cellSize
      const distance = Math.hypot(x - crater.x, z - crater.z) / crater.radius
      if (distance > 0.9 && distance < 1.45 && valueNoise(seed + SEEDS.surface, x, z, 2) > 0.35) {
        map.surfaces[sampleIndex(map, column, row)] = Surface.Chalk
      }
    }
  }
}

/** Rainwater lying in the deeper shell holes in the low ground, below `lowGround`. */
function placePools(
  map: BattlefieldMap,
  craters: readonly Crater[],
  placer: Placer,
  random: () => number,
  lowGround: number
): void {
  const waterDepth = 0.4
  for (const crater of craters) {
    if (crater.depth < 1.2 || random() > 0.5) {
      continue
    }
    const lowest =
      map.heights[sampleIndex(map, Math.round(crater.x / map.cellSize), Math.round(crater.z / map.cellSize))]
    if (lowest > lowGround) {
      continue
    }
    // The bowl is a paraboloid, so water a fraction of its depth deep spreads over the square root of that fraction.
    const radius = crater.radius * Math.sqrt(waterDepth / crater.depth)
    placer.place("pool", crater.x, crater.z, random() * Math.PI * 2, { variant: 0, scale: radius })
  }
}

/**
 * Lays the chalk roads into the ground. Where the shelling is heaviest only fragments of the road surface survive among
 * the craters.
 */
function paintRoads(seed: number, map: BattlefieldMap): void {
  for (const road of ROADS) {
    const xs = road.map(([x]) => x)
    const zs = road.map(([, z]) => z)
    const minColumn = Math.max(0, Math.floor((Math.min(...xs) - ROAD_HALF_WIDTH) / map.cellSize))
    const maxColumn = Math.min(map.columns, Math.ceil((Math.max(...xs) + ROAD_HALF_WIDTH) / map.cellSize))
    const minRow = Math.max(0, Math.floor((Math.min(...zs) - ROAD_HALF_WIDTH) / map.cellSize))
    const maxRow = Math.min(map.rows, Math.ceil((Math.max(...zs) + ROAD_HALF_WIDTH) / map.cellSize))
    for (let row = minRow; row <= maxRow; row++) {
      const z = row * map.cellSize
      for (let column = minColumn; column <= maxColumn; column++) {
        const x = column * map.cellSize
        const { distance } = nearestOnLine(road, x, z)
        const survives = shelling(x, z) < 0.9 || valueNoise(seed + SEEDS.surface, x, z, 6) > 0.62
        if (distance < ROAD_HALF_WIDTH && survives) {
          const index = sampleIndex(map, column, row)
          map.surfaces[index] = Surface.Chalk
          map.heights[index] -= 0.15 * (1 - distance / ROAD_HALF_WIDTH)
        }
      }
    }
  }
}

/** Where a road crosses a trench, the trench gets a bridge of planks. */
function placeBridges(segments: readonly [GroundPoint, GroundPoint][], placer: Placer): void {
  for (const road of ROADS) {
    for (let index = 1; index < road.length; index++) {
      const a = road[index - 1]
      const b = road[index]
      for (const [c, d] of segments) {
        const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
        if (Math.abs(denominator) < 1e-9) {
          continue
        }
        const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denominator
        const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denominator
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          const heading = Math.atan2(d[0] - c[0], d[1] - c[1])
          placer.place("bridge", a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, heading, { variant: 0 })
        }
      }
    }
  }
}

/** Where the German front line crosses the ravine: the x along the line closest to the ravine's bed. */
function ravineCrossing(): number {
  let best = { x: 0, distance: Infinity }
  for (let x = 100; x <= 260; x += 1) {
    const { distance } = nearestOnLine(RAVINE, x, germanFront(x))
    if (distance < best.distance) {
      best = { x, distance }
    }
  }
  return best.x
}

/**
 * A layout drawn by hand, for example in Tiled (see tiled.ts): trenches, wire and scenery to use in place of the
 * generated ones, and objectives if it has them. Pools and bridges follow the generated craters and roads, so they are
 * always regenerated.
 */
export interface SectorLayout {
  readonly trenches: readonly Trench[]
  readonly wire: readonly WireBelt[]
  readonly scenery: readonly Scenery[]
  readonly objectives?: readonly Objective[]
  /** Field railways: absent, the generated ones. */
  readonly railways?: readonly Railway[]
}

/** Generates the Fleury sector: 600 m by 400 m, French to the south and Germans to the north. */
export function generateFleurySector({
  seed = 1916,
  cellSize = 0.5,
  layout,
  elevation
}: FleurySectorOptions = {}): BattlefieldMap {
  const levels = elevation ? levelsOf(elevation) : GENERATED_LEVELS
  const traceRandom = createRandom(seed + SEEDS.trace)
  const french = layoutOf(FRENCH)
  const german = layoutOf(GERMAN)
  const frenchTrenches = layOutSide(french, traceRandom)
  const germanTrenches = layOutSide(german, traceRandom)
  const trenches = layout ? [...layout.trenches] : [...frenchTrenches.trenches, ...germanTrenches.trenches]
  const segments = segmentsOf(trenches)

  const map = {
    ...createFlatMap({
      name: FEATURES.name,
      cellSize,
      columns: Math.round(WIDTH / cellSize),
      rows: Math.round(DEPTH / cellSize)
    }),
    // Verdun's right bank: history's weather as recorded round Fleury.
    weatherRegion: FEATURES.weatherRegion
  }
  for (let row = 0; row <= map.rows; row++) {
    for (let column = 0; column <= map.columns; column++) {
      const x = column * cellSize
      const z = row * cellSize
      const index = sampleIndex(map, column, row)
      const height = heightAtSample(seed, x, z, elevation)
      map.heights[index] = height
      map.surfaces[index] = surfaceAtSample(seed, x, z, height, levels)
    }
  }

  const random = createRandom(seed + SEEDS.craters)
  // Surveyed ground is left as the survey has it, its century-old crater field and all, but for the craters the
  // sector file draws: the battle blasts fresh ones as its shells land. Generated ground is shelled to begin with.
  const craters = placeCraters(seed, map, segments, random, elevation ? MINE_CRATERS.length : 2_600, levels.ridge)
  paintRoads(seed, map)
  carveTrenches(map, trenches)

  const sceneryRandom = createRandom(seed + SEEDS.scenery)
  const railways = layout?.railways ?? RAILWAYS.map((points) => ({ points }))
  const placer = createPlacer(segments, sceneryRandom)
  placeBridges(segments, placer)
  placePools(map, craters, placer, sceneryRandom, levels.low + 1.5)
  const objectives = layout?.objectives ? [...layout.objectives] : [...FEATURES.objectives]
  if (layout) {
    placer.layRailways(railways)
    placer.scenery.push(...layout.scenery.filter((item) => item.kind !== "pool" && item.kind !== "bridge"))
    const drawn = { ...map, trenches, scenery: placer.scenery, wire: [...layout.wire], objectives, railways }
    sculptForScenery(drawn, drawn.scenery)
    sculptForRailways(drawn, railways)
    return withRoads(drawn, segments)
  }

  placeVillage(placer, craters, sceneryRandom)
  // The batteries, then the wrecks and concrete posts, each at the nearest clear spot to where it's drawn.
  for (const battery of FEATURES.batteries) {
    placeBattery(placer, battery.guns, battery.heading)
  }
  for (const item of FEATURES.placed) {
    placeNear(placer, item.kind, item.x, item.z, item.heading, item.radius)
  }
  const ravine = ravineCrossing()
  const frenchWire = wireBelts(seed, french, frenchTrenches, germanTrenches)
  const germanWire = wireBelts(seed, german, germanTrenches, frenchTrenches)
  for (const [side, trenchesOfSide] of [
    [french, frenchTrenches],
    [german, germanTrenches]
  ] as const) {
    const heading = side.towardEnemy === 1 ? 0 : Math.PI
    const variant = side === french ? 0 : 1
    for (const [x, z] of trenchesOfSide.sapHeads) {
      placer.place("machine-gun", x, z + side.towardEnemy * 2.6, heading, { variant })
      // A wooden fence across the sap's mouth.
      placer.place("wooden-fence", x, z + side.towardEnemy * 5.5, heading)
    }
    // The ravine is dead ground to every gun but the concrete post sited at its head.
    const coversRavine = (bay: Bay) => Math.abs((bay.fromX + bay.toX) / 2 - ravine) < 35
    for (const bay of trenchesOfSide.machineGunBays.filter((candidate) => !coversRavine(candidate))) {
      placer.place("machine-gun", (bay.fromX + bay.toX) / 2, bay.z + side.towardEnemy * 2.6, heading, { variant })
    }
    for (const [x, z] of trenchesOfSide.communicationEnds) {
      placeNear(placer, "stores", x + 9, z - side.towardEnemy * 5, heading, 1.5)
    }
  }
  placeRoadsideTrees(placer, sceneryRandom)
  placeWoods(seed, placer, sceneryRandom)
  // The railway last, so everything else stands where it would without it, then the dumps it serves.
  placer.layRailways(railways)
  for (const [x, z] of RAILWAY_DUMPS) {
    placeNear(placer, "stores", x, z, 0, 1.5)
  }
  // Last too, so they move nothing else: the church behind the German front, the orchard behind the French support,
  // and the wooden fences across the short gaps in the wire.
  placeChurch(placer, craters)
  placeOrchard(placer, createRandom(seed + SEEDS.orchard))
  closeGaps(
    placer,
    segments,
    [
      ...frenchWire.closed.map((gap) => ({ gap, heading: french.towardEnemy === 1 ? 0 : Math.PI })),
      ...germanWire.closed.map((gap) => ({ gap, heading: german.towardEnemy === 1 ? 0 : Math.PI }))
    ],
    createRandom(seed + SEEDS.fences)
  )

  const sector = {
    ...map,
    trenches,
    scenery: placer.scenery,
    wire: [...frenchWire.belts, ...germanWire.belts],
    objectives,
    railways
  }
  // Level house plots and dumps, dig the gun pits, bank the concrete posts, lay the railway's bed: the ground the art
  // stands on.
  sculptForScenery(sector, sector.scenery)
  sculptForRailways(sector, railways)
  return withRoads(sector, segments)
}

function sideLines(side: TrenchSide): SideLines {
  return {
    side: side.side,
    towardEnemy: side.side === "french" ? 1 : -1,
    front: side.front,
    lines: [side.front, side.support, side.reserve]
  }
}

/**
 * The sector's roads, cut at each side's rear limit, and where each side's lorries set down its men: on its own roads,
 * out of the enemy's sight and off the bridges over its trenches. Last, on the finished ground and scenery.
 */
function withRoads(map: BattlefieldMap, segments: readonly [GroundPoint, GroundPoint][]): BattlefieldMap {
  const roads = roadsBehindLines([...ROADS, ...FEATURES.streets], REAR_ROAD_LIMITS, sideLines(FRENCH).towardEnemy)
  const onTrench = (x: number, z: number) => trenchDistance(segments, x, z) < TRENCH_PROFILE.parapetOuter + 1
  const debus = [
    findDebus(map, roads, sideLines(FRENCH), sideLines(GERMAN), onTrench),
    findDebus(map, roads, sideLines(GERMAN), sideLines(FRENCH), onTrench)
  ].filter((point) => point !== null)
  return { ...map, roads, debus }
}
