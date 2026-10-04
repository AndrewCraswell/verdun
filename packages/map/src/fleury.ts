import { type Crater, slumpGround, stampCrater } from "./craters.ts"
import { type Elevation, elevationAt } from "./elevation.ts"
import { type BattlefieldMap, createFlatMap, sampleIndex, Surface } from "./format.ts"
import { valueNoise } from "./noise.ts"
import { heightAt } from "./sampling.ts"
import type { Objective, Scenery, SceneryKind, WireBelt } from "./scenery.ts"
import { sculptForScenery } from "./sculpt.ts"
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

const WIDTH = 600
const DEPTH = 400

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
  frenchFront: 101,
  germanFront: 103,
  reserve: 107,
  surface: 7_919,
  patch: 7_927,
  wire: 7_933,
  wood: 7_937,
  trace: 7_949,
  craters: 7_951,
  scenery: 7_963
} as const

/** Ground height across the sector from south to north, before local landforms: a valley between two rises. */
const RISE: readonly GroundPoint[] = [
  [0, 4],
  [70, 5],
  [125, 6.5],
  [195, 3],
  [265, 9],
  [330, 13],
  [400, 16]
]

const VILLAGE = { x: 505, z: 205, radius: 72, height: 7.5 } as const
/** The ravine's bed from its head on the German ridge down into no man's land. */
const RAVINE: readonly GroundPoint[] = [
  [62, 400],
  [110, 335],
  [168, 268],
  [212, 216],
  [250, 182]
]
const RAVINE_HALF_WIDTH = 16
/** Deep enough, with steep enough sides, that only guns looking straight down it can see into its bed. */
const RAVINE_DEPTH = 9
/** The chemin creux: a lane worn below the fields, running west out of the village. */
const SUNKEN_ROAD: readonly GroundPoint[] = [
  [452, 200],
  [405, 195],
  [352, 189]
]
/**
 * Fleury's main street, where the survey still shows it a century on: a smooth band running down the plateau from the
 * German line in the north-west to the French line in the south-east.
 */
const MAIN_STREET: readonly GroundPoint[] = [
  [471, 270],
  [502, 215],
  [533, 160]
]
/** Chalk roads: through the village from the French rear to the German rear, and the lateral supply roads. */
const ROADS: readonly (readonly GroundPoint[])[] = [
  [[468, 0], [478, 60], [505, 112], ...MAIN_STREET.toReversed(), [480, 330], [510, 400]],
  [
    [0, 20],
    [150, 27],
    [300, 23],
    [474, 14]
  ],
  [
    [250, 383],
    [400, 380],
    [524, 376],
    [600, 384]
  ]
]
/** The village's other streets: the cross street the survey shows meeting the main street near the French line, and
 * the lane out to the sunken road. */
const SIDE_STREETS: readonly (readonly GroundPoint[])[] = [
  [
    [480, 152],
    [526, 174],
    [595, 207]
  ],
  [
    [452, 200],
    [507, 207]
  ]
]
/** Where the cross street meets the main street. */
const CROSSROADS: GroundPoint = [526, 174]
/** Roads behind the lines keep their surface; the one through no man's land and the village is shelled to nothing. */
const REAR_ROAD_LIMITS = { french: 110, german: 300 } as const
const ROAD_HALF_WIDTH = 2.4

const WOODS = [
  /** Bois de la Caillette, through which the French front line runs. */
  { x: 118, z: 112, radiusX: 112, radiusZ: 78, density: 1 },
  /** Bois des Corbeaux, at the head of the ravine. */
  { x: 92, z: 368, radiusX: 72, radiusZ: 40, density: 0.75 },
  /** Bois Fumin, behind the German lines. */
  { x: 512, z: 372, radiusX: 112, radiusZ: 36, density: 0.6 }
] as const

const MINE_CRATERS: readonly Crater[] = [
  { x: 296, z: 210, radius: 13, depth: 6 },
  { x: 323, z: 229, radius: 9, depth: 4.2 }
]

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

/** Distance from a point to a polyline, and how far along it (0 to 1) the nearest point lies. */
function nearestOnLine(line: readonly GroundPoint[], x: number, z: number): { distance: number; along: number } {
  let best = { distance: Infinity, along: 0 }
  let total = 0
  const lengths = line.slice(1).map((b, index) => {
    const a = line[index]
    return Math.hypot(b[0] - a[0], b[1] - a[1])
  })
  const lineLength = lengths.reduce((sum, length) => sum + length, 0)
  for (const [index, length] of lengths.entries()) {
    const a = line[index]
    const b = line[index + 1]
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (length * length)))
    const distance = Math.hypot(x - (a[0] + (b[0] - a[0]) * t), z - (a[1] + (b[1] - a[1]) * t))
    if (distance < best.distance) {
      best = { distance, along: (total + t * length) / lineLength }
    }
    total += length
  }
  return best
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

function frenchFront(seed: number, x: number): number {
  return 126 + (valueNoise(seed + SEEDS.frenchFront, x, 0, 120) - 0.5) * 10 + 34 * window(x, 470, 540, 28)
}

function germanFront(seed: number, x: number): number {
  return 270 + (valueNoise(seed + SEEDS.germanFront, x, 0, 120) - 0.5) * 10 - 26 * window(x, 470, 540, 28)
}

/** How hard the ground has been shelled, from 1 in no man's land falling away behind the lines. */
function shelling(seed: number, x: number, z: number): number {
  const french = frenchFront(seed, x)
  const german = germanFront(seed, x)
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
  let height = elevation ? elevationAt(elevation, x, z) : generatedGround(seed, x, z)

  const ravine = nearestOnLine(RAVINE, x, z)
  if (ravine.distance < RAVINE_HALF_WIDTH) {
    const across = ravine.distance / RAVINE_HALF_WIDTH
    // A flat bed between steep banks.
    // Deepest along the middle of its course, shallowing out at the head and the mouth.
    const depth = RAVINE_DEPTH * window(ravine.along, 0.12, 0.9, 0.1)
    height -= depth * (1 - smoothstep(0.3, 1, across))
  }

  const lane = nearestOnLine(SUNKEN_ROAD, x, z)
  if (lane.distance < 4.5) {
    height -= 2.3 * (1 - smoothstep(1.8, 4.5, lane.distance)) * window(lane.along, 0.08, 0.92, 0.08)
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
  const intensity = shelling(seed, x, z)
  const grain = valueNoise(seed + SEEDS.surface, x, z, 9)
  const patch = valueNoise(seed + SEEDS.patch, x, z, 26)
  if (nearestOnLine(RAVINE, x, z).distance < 5 || nearestOnLine(SUNKEN_ROAD, x, z).distance < 2.5) {
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

const TRACE_FROM = 8
const TRACE_TO = WIDTH - 8

/** Lays out one side's trench system: three crenellated lines, communication trenches between them, and saps. */
function layOutSide(layout: SideLayout, random: () => number): SideTrenches {
  const facing = layout.towardEnemy === 1 ? "north" : "south"
  const pick = (choices: readonly number[]) => () => choices[Math.floor(random() * choices.length)] ?? 1
  const frontSections = pick([2, 3, 4, 4, 5, 6])
  const supportSections = pick([5, 6, 7, 8, 9])
  const reserveSections = pick([8, 10, 12, 14])

  const front = crenellatedTrace({
    fromX: TRACE_FROM,
    toX: TRACE_TO,
    frontZ: layout.front,
    towardEnemy: layout.towardEnemy,
    sections: frontSections
  })
  const support = crenellatedTrace({
    fromX: TRACE_FROM,
    toX: TRACE_TO,
    frontZ: layout.support,
    towardEnemy: layout.towardEnemy,
    sections: supportSections
  })
  const reserve = crenellatedTrace({
    fromX: TRACE_FROM,
    toX: TRACE_TO,
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

function frenchLayout(seed: number): SideLayout {
  const front = (x: number) => frenchFront(seed, x)
  return {
    towardEnemy: 1,
    front,
    support: (x) => Math.min(front(x), 132) - 46,
    reserve: (x) => 40 + (valueNoise(seed + SEEDS.reserve, x, 0, 90) - 0.5) * 8,
    forward: [64, 186, 302, 412, 512],
    rear: [124, 246, 362, 470],
    saps: [128, 244, 352, 560],
    wire: [22, 33]
  }
}

function germanLayout(seed: number): SideLayout {
  const front = (x: number) => germanFront(seed, x)
  return {
    towardEnemy: -1,
    front,
    support: (x) => Math.max(front(x), 268) + 46,
    reserve: (x) => 362 + (valueNoise(seed + SEEDS.reserve + 1, x, 0, 90) - 0.5) * 8,
    forward: [92, 230, 338, 446, 530],
    rear: [56, 274, 392, 566],
    saps: [40, 280, 396, 486],
    wire: [18, 30, 42]
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

/**
 * Belts of wire in front of a side's front line, staked out from the bays nearest each point so they clear the line
 * where it bends, and broken by gaps for patrols and the saps' listening posts.
 */
function wireBelts(
  seed: number,
  layout: SideLayout,
  own: SideTrenches,
  enemy: SideTrenches
): { belts: WireBelt[]; gaps: GroundPoint[] } {
  const belts: WireBelt[] = []
  const gaps: GroundPoint[] = []
  const enemyToward = layout.towardEnemy === 1 ? -1 : 1
  for (const [beltIndex, offset] of layout.wire.entries()) {
    let points: GroundPoint[] = []
    const flush = () => {
      if (points.length >= 2) {
        belts.push({ points })
      }
      points = []
    }
    for (let x = TRACE_FROM; x <= TRACE_TO; x += 5) {
      const ragged = (valueNoise(seed + SEEDS.wire + beltIndex, x, 0, 24) - 0.5) * 6
      const ownEdge = forwardEdge(own.frontBays, layout.towardEnemy, x)
      const z = ownEdge + layout.towardEnemy * (offset + ragged)
      // Stay on our own half of no man's land where the lines close up.
      const middle = (ownEdge + forwardEdge(enemy.frontBays, enemyToward, x)) / 2
      const ownHalf = layout.towardEnemy * (middle - z) > 6
      // Staggered patrol gaps, so no lane runs straight through every belt.
      const patrolGap = (x + beltIndex * 31) % 90 < 6
      const nearSap = own.sapHeads.some(([sapX]) => Math.abs(sapX - x) < 5)
      // A knife rest stands ready in each patrol gap, to be dragged across it at night.
      if (patrolGap && points.length > 0) {
        gaps.push([x + 2, z])
      }
      if (!ownHalf || patrolGap || nearSap) {
        flush()
      } else {
        points.push([x, z])
      }
    }
    flush()
  }
  return { belts, gaps }
}

/** Ground each kind of scenery keeps clear of other scenery, in metres. Pools use their radius; the rest 1.5 m. */
const FOOTPRINTS: Partial<Record<SceneryKind, number>> = { ruin: 6, landmark: 11 }

interface Placer {
  readonly scenery: Scenery[]
  place(kind: SceneryKind, x: number, z: number, heading: number, options?: { variant?: number; scale?: number }): void
  /** True when nothing placed so far, and no trench, lies within `radius` of the point. */
  isClear(x: number, z: number, radius: number): boolean
}

function createPlacer(segments: readonly [GroundPoint, GroundPoint][], random: () => number): Placer {
  const scenery: Scenery[] = []
  const footprints: { x: number; z: number; radius: number }[] = []
  return {
    scenery,
    place(kind, x, z, heading, { variant = Math.floor(random() * 1_000), scale = 1 } = {}) {
      scenery.push({ kind, x, z, heading, variant, scale })
      footprints.push({ x, z, radius: FOOTPRINTS[kind] ?? (kind === "pool" ? scale : 1.5) })
    },
    isClear(x, z, radius) {
      if (x < 2 || z < 2 || x > WIDTH - 2 || z > DEPTH - 2) {
        return false
      }
      if (trenchDistance(segments, x, z) < radius + TRENCH_PROFILE.parapetOuter) {
        return false
      }
      return footprints.every((footprint) => Math.hypot(footprint.x - x, footprint.z - z) > footprint.radius + radius)
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
        placer.place(woodland(shelling(seed, px, pz), random()), px, pz, random() * Math.PI * 2, {
          scale: 0.8 + random() * 0.45
        })
      }
    }
  }
}

function placeRoadsideTrees(seed: number, placer: Placer, random: () => number): void {
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
        if (shelling(seed, x, z) > 0.5 || random() < 0.25 || !placer.isClear(x, z, 1)) {
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
    ROADS.some((road) => nearestOnLine(road, x, z).distance < ROAD_HALF_WIDTH + 2) &&
    (z < REAR_ROAD_LIMITS.french || z > REAR_ROAD_LIMITS.german)
  for (let attempt = 0; attempt < 40_000 && craters.length < count; attempt++) {
    const x = random() * WIDTH
    const z = random() * DEPTH
    if (random() > shelling(seed, x, z) ** 1.6) {
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
        const survives = shelling(seed, x, z) < 0.9 || valueNoise(seed + SEEDS.surface, x, z, 6) > 0.62
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
function ravineCrossing(seed: number): number {
  let best = { x: 0, distance: Infinity }
  for (let x = 100; x <= 260; x += 1) {
    const { distance } = nearestOnLine(RAVINE, x, germanFront(seed, x))
    if (distance < best.distance) {
      best = { x, distance }
    }
  }
  return best.x
}

/** The ground both sides fight over. */
function objectivesOf(seed: number): Objective[] {
  const [mouthX, mouthZ] = RAVINE[RAVINE.length - 1] ?? [250, 182]
  const [crossroadsX, crossroadsZ] = CROSSROADS
  const head = ravineCrossing(seed)
  return [
    { name: "Fleury", x: VILLAGE.x, z: VILLAGE.z, radius: 28 },
    { name: "Fleury crossroads", x: crossroadsX, z: crossroadsZ, radius: 14 },
    { name: "The mine craters", x: 308, z: 218, radius: 18 },
    { name: "Ravin de la Dame", x: mouthX - 10, z: mouthZ + 12, radius: 18 },
    { name: "Ravine head", x: head, z: germanFront(seed, head), radius: 16 }
  ]
}

/**
 * A layout drawn by hand, for example in Tiled (see tiled.ts): trenches, wire and scenery to use in place of the
 * generated ones. Pools and bridges follow the generated craters and roads, so they are always regenerated.
 */
export interface SectorLayout {
  readonly trenches: readonly Trench[]
  readonly wire: readonly WireBelt[]
  readonly scenery: readonly Scenery[]
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
  const french = frenchLayout(seed)
  const german = germanLayout(seed)
  const frenchTrenches = layOutSide(french, traceRandom)
  const germanTrenches = layOutSide(german, traceRandom)
  const trenches = layout ? [...layout.trenches] : [...frenchTrenches.trenches, ...germanTrenches.trenches]
  const segments = segmentsOf(trenches)

  const map = createFlatMap({
    name: "Fleury sector",
    cellSize,
    columns: Math.round(WIDTH / cellSize),
    rows: Math.round(DEPTH / cellSize)
  })
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
  // Surveyed ground already carries a century-old crater field; fewer fresh shell holes go on top.
  const craters = placeCraters(seed, map, segments, random, elevation ? 1_500 : 2_600, levels.ridge)
  paintRoads(seed, map)
  carveTrenches(map, trenches)

  const sceneryRandom = createRandom(seed + SEEDS.scenery)
  const placer = createPlacer(segments, sceneryRandom)
  placeBridges(segments, placer)
  placePools(map, craters, placer, sceneryRandom, levels.low + 1.5)
  const objectives = objectivesOf(seed)
  if (layout) {
    placer.scenery.push(...layout.scenery.filter((item) => item.kind !== "pool" && item.kind !== "bridge"))
    const drawn = { ...map, trenches, scenery: placer.scenery, wire: [...layout.wire], objectives }
    sculptForScenery(drawn, drawn.scenery)
    return drawn
  }

  placeVillage(placer, craters, sceneryRandom)
  placeBattery(
    placer,
    [
      [138, 12],
      [162, 13],
      [186, 12],
      [210, 13]
    ],
    0
  )
  placeBattery(
    placer,
    [
      [252, 392],
      [276, 392],
      [300, 391]
    ],
    Math.PI
  )
  placeNear(placer, "wrecked-gun", 338, 62, 0.4, 3)
  placeNear(placer, "wrecked-gun", 432, 388, 2.8, 3)
  placeNear(placer, "wrecked-plane", 262, 203, 2.2, 5)
  // Concrete machine-gun posts behind the German front, one of them sited to sweep the ravine.
  const ravine = ravineCrossing(seed)
  for (const x of [ravine + 9, 258, 392]) {
    placeNear(placer, "bunker", x, germanFront(seed, x) + 15, Math.PI, 4)
  }
  const frenchWire = wireBelts(seed, french, frenchTrenches, germanTrenches)
  const germanWire = wireBelts(seed, german, germanTrenches, frenchTrenches)
  for (const [side, trenchesOfSide, wire] of [
    [french, frenchTrenches, frenchWire],
    [german, germanTrenches, germanWire]
  ] as const) {
    const heading = side.towardEnemy === 1 ? 0 : Math.PI
    const variant = side === french ? 0 : 1
    for (const [x, z] of trenchesOfSide.sapHeads) {
      placer.place("machine-gun", x, z + side.towardEnemy * 2.6, heading, { variant })
      placer.place("knife-rest", x, z + side.towardEnemy * 5.5, heading)
    }
    // The ravine is dead ground to every gun but the concrete post sited at its head.
    const coversRavine = (bay: Bay) => Math.abs((bay.fromX + bay.toX) / 2 - ravine) < 35
    for (const bay of trenchesOfSide.machineGunBays.filter((candidate) => !coversRavine(candidate))) {
      placer.place("machine-gun", (bay.fromX + bay.toX) / 2, bay.z + side.towardEnemy * 2.6, heading, { variant })
    }
    for (const [x, z] of trenchesOfSide.communicationEnds) {
      placeNear(placer, "stores", x + 9, z - side.towardEnemy * 5, heading, 1.5)
    }
    for (const [x, z] of wire.gaps) {
      placer.place("knife-rest", x, z, heading + (sceneryRandom() - 0.5) * 0.4)
    }
  }
  placeRoadsideTrees(seed, placer, sceneryRandom)
  placeWoods(seed, placer, sceneryRandom)

  const sector = {
    ...map,
    trenches,
    scenery: placer.scenery,
    wire: [...frenchWire.belts, ...germanWire.belts],
    objectives
  }
  // Level house plots and dumps, dig the gun pits, bank the concrete posts: the ground the art stands on.
  sculptForScenery(sector, sector.scenery)
  return sector
}
