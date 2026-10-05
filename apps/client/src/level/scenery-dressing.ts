import {
  type BattlefieldMap,
  beltLayout,
  type GroundPoint,
  heightAt,
  sampleIndex,
  type Scenery,
  type SceneryKind,
  Surface,
  type Trench,
  type WireBelt
} from "@verdun/map"
import { hashOf, type Placement, upForSlope, yawAlong } from "./placement.ts"

/** A piece of a scenery item, relative to the item: offsets are in metres along its heading (z) and to its right (x). */
interface Part {
  readonly pieces: readonly string[]
  readonly right?: number
  readonly forward?: number
  readonly turn?: number
  readonly lift?: number
  /** Leans with the ground instead of standing upright. */
  readonly tilt?: boolean
  /** Scales with the item. */
  readonly scaled?: boolean
  /** Its own size relative to the piece's, on top of the item's scale where it has one. */
  readonly size?: number
  /** Leans up to this many radians off upright, which way and how far picked by where it stands. */
  readonly lean?: number
  /** Lies felled along the item's heading, centred on it: the piece's length up its own axis, in metres. */
  readonly felled?: number
}

const RUINS = [
  "Bld_City_Destroyed_01",
  "Bld_City_Destroyed_02",
  "Bld_City_Destroyed_03",
  "Bld_TownHouse_Rubble_01",
  "Bld_TownHouse_Rubble_02"
]
const SANDBAGS = ["Env_Sandbag_Wall_Curved_01"]
/** Brick and plaster brought down against a ruin's walls. */
const HEAPS = ["Env_Rubble_Pile_Corner", "Env_Rubble_Pile_Small", "Env_Rubble_Pile_Big"]
/** Roof timbers and floorboards brought down with the rest, and the roof tiles off them. */
const BEAMS = ["Prop_Rubble_House_Plank_01", "Prop_Rubble_House_Plank_02"]
const TILES = ["Prop_Rubble_House_Tile_01", "Prop_Rubble_House_Tile_02"]

/** Heaps of rubble outside the ruin's walls, front and back. */
const OUTSIDE_HEAPS: readonly Part[] = [
  { pieces: HEAPS, right: 2.5, forward: 3.2, turn: 0.4, tilt: true, lift: -0.1 },
  { pieces: HEAPS, right: -3, forward: -2.6, turn: 2.6, tilt: true, lift: -0.1 }
]

/**
 * Fleury's houses as the summer of 1916 left them, most of the village razed: what's left of a house on its plot, by
 * how much of it still stands.
 */
const RUIN_KINDS = {
  /** Razed: mounds of brick and stone, a chimney stack left standing over its hearth, a stump of garden wall. */
  razed: [
    { pieces: ["Env_Rubble_Pile_Big"], tilt: true, lift: -0.25, size: 1.1 },
    {
      pieces: ["Env_Rubble_Pile_Big", "Env_Rubble_Pile_Corner"],
      right: -3,
      forward: -2.5,
      turn: 2.2,
      tilt: true,
      lift: -0.15
    },
    { pieces: ["Prop_Chimney_01"], right: 3, forward: -3.5, size: 0.6, lift: -0.3 },
    { pieces: ["Prop_Fireplace_01"], right: 3, forward: -2.7, turn: Math.PI, lift: -0.1 },
    {
      pieces: ["Env_StoneWall_Rubble_01", "Env_StoneWall_Rubble_03"],
      right: -4.5,
      forward: 1,
      turn: Math.PI / 2,
      lift: -0.1
    },
    { pieces: BEAMS, right: -1, forward: 1.5, turn: 0.7, tilt: true, lift: 0.3 },
    { pieces: TILES, right: 1.5, forward: 2.5, turn: 1.9, tilt: true },
    { pieces: TILES, right: -2.5, forward: -0.5, turn: 0.4, tilt: true }
  ],
  /** Gutted: the walls still standing round a floor of rubble. */
  shell: (piece: string): Part[] => [{ pieces: [piece], lift: -0.3 }, ...OUTSIDE_HEAPS],
  /** Torn open: one side brought down, the rooms open to the street, heaped with what fell into them. */
  torn: (piece: string): Part[] => [
    { pieces: [piece], lift: -0.3 },
    { pieces: ["Env_Rubble_Pile_Big"], right: 0.5, forward: 0.5, turn: 0.3, tilt: true, size: 0.8, lift: 0.1 },
    { pieces: BEAMS, right: 1, forward: -1, turn: 1.1, tilt: true, lift: 0.6 },
    { pieces: BEAMS, right: -1.5, forward: 1, turn: -0.6, tilt: true, lift: 0.4 },
    ...OUTSIDE_HEAPS
  ]
} as const

/** Dead trees still crowned with bare branches, where the shelling has only thinned the wood. */
const CROWNED: Part = {
  pieces: ["Env_Tree_Dead_04", "Gen_Env_Tree_Dead_01", "Gen_Env_Tree_Dead_02", "Gen_Env_Tree_Dead_03"],
  scaled: true,
  lift: -0.2,
  lean: 0.1
}
/** Trunks stripped to poles, their branches shot away, leaning where the blast left them: the woods by the lines. */
const STRIPPED: Part = {
  pieces: ["Env_Tree_Dead_01", "Env_Tree_Dead_02", "Env_Tree_Dead_03"],
  scaled: true,
  lift: -0.2,
  lean: 0.28
}

/**
 * Fleury's church as the shelling left it: the War Pack's modular walls, each 2.5 m long and a storey high, running
 * along their own +x from their origin. A nave 10 m square between z = -3.75 and 6.25 (x right, z toward the apse), the
 * tower 5 m square west of it, the apse's half circle east.
 */
const STOREY = 3.01
const CHURCH_PIECES = {
  wall: "Bld_Base_Wall_01",
  half: "Bld_Base_Wall_Half_01",
  broken: "Bld_Base_Wall_Destroyed_01",
  stub: "Bld_Base_Wall_Destroyed_02",
  window: "Bld_Base_Wall_Window_01",
  door: "Bld_Base_Wall_Door_Double_Large_01",
  pillar: "Bld_Base_Pillar_01",
  apse: "Bld_Base_Wall_Round_01",
  roof: "Bld_Base_Roof_Straight_01"
} as const
/** Walls stand a little into the ground, so no slope shows a gap under them. */
const FOOTING = -0.15

/**
 * A run of wall from one point to another, `storey` storeys up, one piece to a 2.5 m module: null where the module has
 * been shot away. Each piece is turned to run from its module's start to its end.
 */
function wallRun(
  pieces: readonly (string | null)[],
  [fromX, fromZ]: GroundPoint,
  [toX, toZ]: GroundPoint,
  storey = 0
): Part[] {
  const turn = Math.atan2(fromZ - toZ, toX - fromX)
  return pieces.flatMap((piece, index): Part[] => {
    const along = index / pieces.length
    return piece
      ? [
          {
            pieces: [piece],
            right: fromX + (toX - fromX) * along,
            forward: fromZ + (toZ - fromZ) * along,
            turn,
            lift: storey * STOREY + FOOTING
          }
        ]
      : []
  })
}

/** A corner pillar standing `storeys` storeys high. */
function pillar([right, forward]: GroundPoint, storeys: number): Part[] {
  return Array.from({ length: storeys }, (_, storey) => ({
    pieces: [CHURCH_PIECES.pillar],
    right,
    forward,
    lift: storey * STOREY + FOOTING
  }))
}

const { wall, half, broken, stub, window: opening, door } = CHURCH_PIECES
/**
 * The church: the nave's walls broken to one storey or two, their windows blown in; the tower standing to its shattered
 * belfry over the west door; the apse; the roof fallen into the nave in slabs, with rubble, beams and tiles; what fell
 * from the belfry heaped outside; stumps of the churchyard wall.
 */
const CHURCH: readonly Part[] = [
  // The nave's north and south walls, west to east, a storey at a time.
  ...wallRun([opening, opening, broken, wall], [-5, -3.75], [-5, 6.25]),
  ...wallRun([wall, stub, null, half], [-5, -3.75], [-5, 6.25], 1),
  ...wallRun([wall, opening, opening, stub], [5, -3.75], [5, 6.25]),
  ...wallRun([broken, null, opening, wall], [5, -3.75], [5, 6.25], 1),
  // Its west wall either side of the tower and its east wall either side of the apse.
  ...wallRun([wall], [-5, -3.75], [-2.5, -3.75]),
  ...wallRun([wall], [-5, -3.75], [-2.5, -3.75], 1),
  ...wallRun([wall], [2.5, -3.75], [5, -3.75]),
  ...wallRun([broken], [2.5, -3.75], [5, -3.75], 1),
  ...wallRun([wall], [-5, 6.25], [-2.5, 6.25]),
  ...wallRun([half], [-5, 6.25], [-2.5, 6.25], 1),
  ...wallRun([broken], [2.5, 6.25], [5, 6.25]),
  // The tower: the west door, open to the nave below, three storeys to the belfry's broken openings.
  ...wallRun([door, wall], [-2.5, -8.75], [2.5, -8.75]),
  ...wallRun([wall, opening], [-2.5, -8.75], [2.5, -8.75], 1),
  ...wallRun([opening, broken], [-2.5, -8.75], [2.5, -8.75], 2),
  ...wallRun([wall, wall], [-2.5, -8.75], [-2.5, -3.75]),
  ...wallRun([opening, wall], [-2.5, -8.75], [-2.5, -3.75], 1),
  ...wallRun([stub, null], [-2.5, -8.75], [-2.5, -3.75], 2),
  ...wallRun([wall, opening], [2.5, -8.75], [2.5, -3.75]),
  ...wallRun([wall, wall], [2.5, -8.75], [2.5, -3.75], 1),
  ...wallRun([opening, broken], [2.5, -8.75], [2.5, -3.75], 2),
  ...wallRun([wall, wall], [-2.5, -3.75], [2.5, -3.75], 1),
  ...wallRun([broken, null], [-2.5, -3.75], [2.5, -3.75], 2),
  // The apse: two quarter circles meeting on the axis, east of the nave. Each curves from its origin, running +x, a
  // quarter turn round a centre 2.5 m to its -z.
  { pieces: [CHURCH_PIECES.apse], right: 0, forward: 8.75, lift: FOOTING },
  { pieces: [CHURCH_PIECES.apse], right: -2.5, forward: 6.25, turn: -Math.PI / 2, lift: FOOTING },
  ...pillar([-5, -3.75], 2),
  ...pillar([5, -3.75], 2),
  ...pillar([-5, 6.25], 2),
  ...pillar([5, 6.25], 1),
  ...pillar([-2.5, -8.75], 3),
  ...pillar([2.5, -8.75], 2),
  ...pillar([-2.5, -3.75], 3),
  ...pillar([2.5, -3.75], 2),
  // The roof, fallen in slabs against the walls, and what came down with it. A slab's ridge runs along its +x from its
  // origin, its eaves 2.5 m to its +z and 3.1 m lower.
  { pieces: [CHURCH_PIECES.roof], right: -4.7, forward: 2.8, turn: Math.PI / 2, lift: 3 },
  { pieces: [CHURCH_PIECES.roof], right: 4.7, forward: -0.5, turn: -Math.PI / 2, lift: 2.8 },
  { pieces: ["Env_Rubble_Pile_Big"], right: 1, forward: 2.5, turn: 0.6, tilt: true, lift: -0.2 },
  { pieces: ["Env_Rubble_Pile_Corner"], right: 3.6, forward: -2.4, turn: Math.PI, tilt: true, lift: -0.1 },
  { pieces: ["Env_Rubble_Pile_Small"], right: -3, forward: 4.8, turn: 2, tilt: true },
  { pieces: BEAMS, right: -0.5, forward: -1, turn: 0.9, tilt: true, lift: 0.3 },
  { pieces: BEAMS, right: 2, forward: 0.5, turn: -0.4, tilt: true, lift: 0.4 },
  { pieces: TILES, right: 0.5, forward: 4.2, turn: 1.3, tilt: true },
  { pieces: TILES, right: -2.2, forward: -2, turn: 2.6, tilt: true },
  // The belfry's stones heaped west of the tower; the churchyard wall's stumps either side.
  { pieces: ["Env_Rubble_Pile_Big"], right: -1, forward: -10.5, turn: 0.2, tilt: true, lift: -0.2 },
  { pieces: ["Env_Rubble_Pile_Corner"], right: 3.2, forward: -9.6, turn: -1, tilt: true, lift: -0.1 },
  { pieces: ["Env_StoneWall_Rubble_02"], right: -7.5, forward: 2, turn: Math.PI / 2, lift: -0.1 },
  { pieces: ["Env_StoneWall_Rubble_04"], right: 7.6, forward: -1, turn: Math.PI / 2, lift: -0.1 }
]

/** The orchard's fruit trees, stripped bare by the shelling (see build-level-kit.py), one to a variant. */
export const FRUIT_TREES = [
  "Env_Tree_Apple_01_Bare",
  "Env_Tree_Pear_01_Bare",
  "Env_Tree_Plum_01_Bare",
  "Env_Tree_Cherry_01_Bare"
] as const

/** The art for each kind of scenery: one or more parts, picked between by the item's variant. */
const ART: Readonly<Record<Exclude<SceneryKind, "pool">, readonly (readonly Part[])[]>> = {
  // Most razed, some gutted, a few torn open, one in eight a front wall standing alone.
  ruin: [
    RUIN_KINDS.razed,
    RUIN_KINDS.shell("Bld_TownHouse_Rubble_01"),
    RUIN_KINDS.torn("Bld_City_Destroyed_02"),
    RUIN_KINDS.razed,
    RUIN_KINDS.shell("Bld_TownHouse_Rubble_02"),
    RUIN_KINDS.torn("Bld_City_Destroyed_03"),
    RUIN_KINDS.razed,
    [
      { pieces: ["Bld_City_Destroyed_01"], lift: -0.3 },
      { pieces: HEAPS, right: 0, forward: -2.5, turn: 1.4, tilt: true, lift: -0.1 },
      { pieces: BEAMS, right: 1, forward: -3.5, turn: 0.4, tilt: true, lift: 0.2 }
    ]
  ],
  // The great barn of the farm on Fleury's main street, its chimney stack still standing; and the church.
  landmark: [
    [
      { pieces: ["Bld_Barn_Broken_01"], lift: -0.4 },
      { pieces: ["Prop_Chimney_01"], right: -8.5, forward: -4, lift: -0.2 },
      { pieces: ["Env_Rubble_Pile_Big"], right: 4, forward: 8, turn: 0.3, tilt: true, lift: -0.1 },
      { pieces: ["Env_Rubble_Pile_Corner"], right: -7.5, forward: 5, turn: -0.8, tilt: true, lift: -0.1 },
      { pieces: ["Env_StoneWall_Rubble_02"], right: 9, forward: 6, turn: 1.57, lift: -0.1 }
    ],
    CHURCH
  ],
  rubble: [
    [
      {
        pieces: [
          "Env_Rubble_Pile_01",
          "Env_Rubble_Pile_02",
          "Env_Brick_Debris_01",
          "Env_Brick_Debris_02",
          "Env_Brick_Debris_03"
        ],
        tilt: true,
        scaled: true,
        lift: -0.05
      }
    ]
  ],
  // One wall piece per variant, so the simulation's sight shapes (sim/sight-shapes.ts) can match each exactly.
  wall: [
    "Env_StoneWall_Rubble_01",
    "Env_StoneWall_Rubble_02",
    "Env_StoneWall_Rubble_03",
    "Env_StoneWall_Rubble_04"
  ].map((piece) => [{ pieces: [piece], lift: -0.1 }]),
  // Crowned or stripped, by how hard the shelling has hit the wood there (see treeVariant).
  tree: [[CROWNED], [STRIPPED]],
  // Stripped bare, leaning where the blasts left them.
  "fruit-tree": FRUIT_TREES.map((piece) => [{ pieces: [piece], scaled: true, lift: -0.1, lean: 0.12 }]),
  stump: [
    [
      {
        pieces: [
          "Env_Tree_Destroyed_01",
          "Env_Tree_Destroyed_02",
          "Env_Tree_Destroyed_03",
          "Env_Tree_Destroyed_04",
          "Gen_Env_Stump_01",
          "Gen_Env_Stump_02",
          "Gen_Env_Stump_03"
        ],
        scaled: true,
        lift: -0.1
      },
      { pieces: ["Env_Tree_Shards_01", "Env_Tree_Shards_02", "Env_Tree_Shards_03"], right: 1.2, tilt: true }
    ]
  ],
  log: [
    // A limb or a length of trunk brought down, half sunk in the mud.
    [
      {
        pieces: [
          "Env_Tree_Branch_01",
          "Env_Tree_Branch_02",
          "Env_Tree_Branch_03",
          "Env_Tree_Branch_04",
          "Tree_Log_01",
          "Tree_Log_02"
        ],
        tilt: true,
        scaled: true,
        lift: -0.1
      }
    ],
    // A trunk felled whole, its shattered top lying where it fell.
    [{ pieces: ["Env_Tree_Destroyed_01", "Env_Tree_Destroyed_02"], felled: 3, scaled: true, lift: 0.22 }]
  ],
  gun: [
    [
      { pieces: ["Veh_Artillery_01"], tilt: true },
      { pieces: SANDBAGS, forward: 3.6, tilt: true },
      { pieces: SANDBAGS, right: -3.1, forward: 1, turn: -1.2, tilt: true },
      { pieces: SANDBAGS, right: 3.1, forward: 1, turn: 1.2, tilt: true },
      { pieces: ["Prop_Crate_Pile_01"], right: 2.4, forward: -3, turn: 0.3, tilt: true }
    ]
  ],
  "wrecked-gun": [[{ pieces: ["Veh_Artillery_01_Destroyed"], tilt: true, lift: -0.15 }]],
  "wrecked-plane": [[{ pieces: ["Veh_German_Plane_01_Destroyed"], tilt: true, lift: -0.35 }]],
  bunker: [[{ pieces: ["Bld_Bunker_01"], lift: -0.6 }]],
  "machine-gun": [
    [
      { pieces: ["Wep_British_HeavyMachineGun_01"], lift: 0.2 },
      { pieces: ["Wep_British_HeavyMachineGun_Tripod_01"], lift: 0.2 },
      { pieces: SANDBAGS, forward: 1.2, tilt: true }
    ],
    [
      { pieces: ["Wep_German_HeavyMachineGun_01"], lift: 0.2 },
      { pieces: ["Wep_German_HeavyMachineGun_Tripod_01"], lift: 0.2 },
      { pieces: SANDBAGS, forward: 1.2, tilt: true }
    ]
  ],
  "knife-rest": [[{ pieces: ["Prop_Barricade_03", "Prop_Barricade_03", "Prop_Barricade_01"], tilt: true, lift: 0.15 }]],
  stores: [
    [
      { pieces: ["Prop_Crate_Pile_01"], tilt: true },
      { pieces: ["Prop_Barrel_Pile_01"], right: 2.4, forward: 0.4, turn: 0.5, tilt: true },
      { pieces: ["Gen_Prop_Sack_Stack_01"], right: -2, forward: 0.3, turn: -0.3, tilt: true },
      { pieces: ["Gen_Prop_Crate_01", "Gen_Prop_Crate_02"], right: 0.7, forward: -1.8, turn: 0.7, tilt: true }
    ]
  ],
  // The long plank bridge spans its z axis across the trench.
  bridge: [[{ pieces: ["Prop_Trench_Bridge_02"], turn: Math.PI / 2, lift: 0.35 }]]
}

/** Scenery pieces whose models have their origin at a corner instead of under their middle. */
export const CENTRED_PIECES: ReadonlySet<string> = new Set(RUINS)

const WATER = { piece: "Env_Crater_Water_01", radius: 5.41, depth: 0.4 } as const

/** Normal of the ground at a point, from the heights a metre either side. */
function groundNormal(map: BattlefieldMap, x: number, z: number): [number, number, number] {
  const slopeX = (heightAt(map, x + 1, z) - heightAt(map, x - 1, z)) / 2
  const slopeZ = (heightAt(map, x, z + 1) - heightAt(map, x, z - 1)) / 2
  const length = Math.hypot(slopeX, 1, slopeZ)
  return [-slopeX / length, 1 / length, -slopeZ / length]
}

function pick(pieces: readonly string[], x: number, z: number, salt: number): string {
  return pieces[Math.floor(hashOf(x, z, salt) * pieces.length)] ?? pieces[0] ?? ""
}

/** A trench's leg: a straight run of its centre line. */
type Leg = readonly [readonly [number, number], readonly [number, number]]

function legsOf(map: BattlefieldMap, kinds: readonly Trench["kind"][] = ["fire", "communication"]): Leg[] {
  return map.trenches
    .filter((trench) => kinds.includes(trench.kind))
    .flatMap((trench) => trench.points.slice(1).map((b, index): Leg => [trench.points[index] ?? b, b]))
}

/** Distance from a point to the nearest of `legs`' centre lines, Infinity when there are none. */
function distanceToLegs(legs: readonly Leg[], x: number, z: number): number {
  let nearest = Infinity
  for (const [a, b] of legs) {
    const abx = b[0] - a[0]
    const abz = b[1] - a[1]
    const lengthSquared = abx * abx + abz * abz
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSquared))
    nearest = Math.min(nearest, Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t)))
  }
  return nearest
}

/** Metres behind a fire trench over which the woods go from stripped to crowned. */
const BATTERED_REACH = 45

/**
 * How hard the shelling has hit the ground at a point, from 1 on a fire trench to nothing far behind the lines: the
 * barrages fell on the lines, and the woods round them were stripped first.
 */
function batteringFrom(legs: readonly Leg[]): (x: number, z: number) => number {
  return (x, z) => Math.exp(-distanceToLegs(legs, x, z) / BATTERED_REACH)
}

/** A tree stripped to a pole or still crowned: stripped near the lines, crowned far behind them, mixed between. */
function treeVariant(item: Scenery, battering: number): number {
  return hashOf(item.x, item.z, 60) < 0.12 + 0.8 * battering ? 1 : 0
}

/** The up axis for a part leaning up to `lean` radians, which way and how far picked by the item's place. */
function leaning(item: Scenery, lean: number): [number, number, number] {
  const angle = lean * hashOf(item.x, item.z, 61) ** 1.5
  const toward = hashOf(item.x, item.z, 62) * Math.PI * 2
  return [Math.sin(angle) * Math.sin(toward), Math.cos(angle), Math.sin(angle) * Math.cos(toward)]
}

/**
 * A piece laid down along the item's heading, centred on it: its own up axis, the trunk, lies along the ground and
 * follows its slope, its foot half its length behind the item, rolled about its length by where it lies.
 */
function felledAlong(map: BattlefieldMap, item: Scenery, part: Part, size: number, piece: string): Placement {
  const length = (part.felled ?? 0) * size
  const dx = Math.sin(item.heading + (part.turn ?? 0))
  const dz = Math.cos(item.heading + (part.turn ?? 0))
  const x = item.x - (dx * length) / 2
  const z = item.z - (dz * length) / 2
  const foot = heightAt(map, x, z)
  const rise = (heightAt(map, item.x + (dx * length) / 2, item.z + (dz * length) / 2) - foot) / length
  const along = Math.hypot(1, rise)
  return {
    piece,
    x,
    y: foot + (part.lift ?? 0) * size,
    z,
    yaw: hashOf(item.x, item.z, 63) * Math.PI * 2,
    up: [dx / along, rise / along, dz / along],
    scale: [size, size, size]
  }
}

function sceneryPlacements(map: BattlefieldMap, item: Scenery, battering = 0): Placement[] {
  if (item.kind === "pool") {
    // Water fills the shell hole to a fixed depth over its lowest point.
    return [
      {
        piece: WATER.piece,
        x: item.x,
        y: heightAt(map, item.x, item.z) + WATER.depth,
        z: item.z,
        yaw: item.heading,
        scale: [item.scale / WATER.radius, 1, item.scale / WATER.radius]
      }
    ]
  }
  const variants = ART[item.kind]
  const variant = item.kind === "tree" ? treeVariant(item, battering) : item.variant
  const parts = variants[variant % variants.length] ?? []
  const forwardX = Math.sin(item.heading)
  const forwardZ = Math.cos(item.heading)
  return parts.map((part, index) => {
    const size = (part.scaled ? item.scale : 1) * (part.size ?? 1)
    const piece = pick(part.pieces, item.x, item.z, index)
    if (part.felled !== undefined) {
      return felledAlong(map, item, part, size, piece)
    }
    const x = item.x + forwardZ * (part.right ?? 0) + forwardX * (part.forward ?? 0)
    const z = item.z - forwardX * (part.right ?? 0) + forwardZ * (part.forward ?? 0)
    // A bridge spans a trench: it sits at the level of the ground either side, not the trench floor beneath it.
    const ground = item.kind === "bridge" ? heightAt(map, x, z) + 1.9 : heightAt(map, x, z)
    let up: [number, number, number] | undefined
    if (part.tilt) {
      up = groundNormal(map, x, z)
    } else if (part.lean !== undefined) {
      up = leaning(item, part.lean)
    }
    return {
      piece,
      x,
      y: ground + (part.lift ?? 0) * size,
      z,
      yaw: item.heading + (part.turn ?? 0),
      up,
      scale: [size, size, size]
    }
  })
}

const FENCES = ["Prop_Wire_Fence_01", "Prop_Wire_Fence_02"]
/** The kit's fence piece is this long; each length of a belt's fence stretches one to fit. */
const FENCE_LENGTH = 10.06
const TANGLES = ["Prop_Wire_Fence_Tangled_01", "Prop_Wire_Fence_Tangled_02", "Prop_Wire_Fence_Tangled_03"]

/**
 * A belt of wire as the map lays it out (`beltLayout`): a staked fence along the line, with tangled coils thrown in front
 * of and behind it. Fence pieces run along their x axis and lean with the ground between their ends.
 */
function wirePlacements(map: BattlefieldMap, belt: WireBelt): Placement[] {
  const { fences, tangles } = beltLayout(belt)
  const placements: Placement[] = fences.map(({ x, z, dx, dz, length }) => {
    const start = heightAt(map, x - (dx * length) / 2, z - (dz * length) / 2)
    const end = heightAt(map, x + (dx * length) / 2, z + (dz * length) / 2)
    return {
      piece: pick(FENCES, x, z, 0),
      x,
      y: (start + end) / 2 - 0.05,
      z,
      yaw: yawAlong(dx, dz) - Math.PI / 2,
      up: upForSlope(dx, dz, (end - start) / length),
      scale: [length / FENCE_LENGTH, 1, 1]
    }
  })
  for (const { x, z, dx, dz } of tangles) {
    placements.push({
      piece: pick(TANGLES, x, z, 5),
      x,
      y: heightAt(map, x, z) - 0.1,
      z,
      yaw: yawAlong(dx, dz) - Math.PI / 2 + (hashOf(x, z, 6) - 0.5) * 0.8,
      up: groundNormal(map, x, z)
    })
  }
  return placements
}

/** Tufts of coarse grass, short and tall. */
const TUFTS = ["Gen_Env_Grass_01", "Gen_Env_Grass_02", "Gen_Env_Grass_03"]
const TALL_TUFTS = ["Gen_Env_Grass_Tall_01", "Gen_Env_Grass_Tall_02"]
/** Ground cover is considered every this many metres, jittered within the square. */
const COVER_SPACING = 2.5

/**
 * Tufts of grass where the shelling spared the ground: on the grass surface, thickest where the grass is unbroken all
 * round, and never on mud, chalk or churned ground.
 */
export function layOutGroundCover(map: BattlefieldMap): Placement[] {
  const placements: Placement[] = []
  const isGrass = (x: number, z: number) => {
    const column = Math.round(Math.min(map.columns, Math.max(0, x / map.cellSize)))
    const row = Math.round(Math.min(map.rows, Math.max(0, z / map.cellSize)))
    return map.surfaces[sampleIndex(map, column, row)] === Surface.Grass
  }
  for (let gz = COVER_SPACING / 2; gz < map.rows * map.cellSize; gz += COVER_SPACING) {
    for (let gx = COVER_SPACING / 2; gx < map.columns * map.cellSize; gx += COVER_SPACING) {
      const x = gx + (hashOf(gx, gz, 30) - 0.5) * COVER_SPACING
      const z = gz + (hashOf(gx, gz, 31) - 0.5) * COVER_SPACING
      if (!isGrass(x, z)) {
        continue
      }
      // Unbroken grass a few metres round grows thicker and taller.
      const unbroken = [
        [3, 0],
        [-3, 0],
        [0, 3],
        [0, -3]
      ].filter(([dx = 0, dz = 0]) => isGrass(x + dx, z + dz)).length
      if (hashOf(x, z, 32) > 0.2 + unbroken * 0.12) {
        continue
      }
      const tall = unbroken === 4 && hashOf(x, z, 33) < 0.15
      // Short tufts about knee high; the tall ones, rank grass and nettles, up to a man's waist.
      const size = tall ? 0.6 + hashOf(x, z, 34) * 0.35 : 1.3 + hashOf(x, z, 34) * 0.9
      placements.push({
        piece: pick(tall ? TALL_TUFTS : TUFTS, x, z, 35),
        x,
        y: heightAt(map, x, z) - 0.05,
        z,
        yaw: hashOf(x, z, 36) * Math.PI * 2,
        up: groundNormal(map, x, z),
        scale: [size, size * (0.8 + hashOf(x, z, 37) * 0.4), size]
      })
    }
  }
  return placements
}

/**
 * What a battle leaves on the ground, how often each turns up, and how much larger than life it's drawn: a helmet is a
 * third of a metre across, a speck from the game's camera, so the small kit is drawn half as large again, as Synty's
 * style draws it.
 */
const LITTER: readonly (readonly [piece: string, weight: number, size: number])[] = [
  ["Chr_Attach_French_Helmet_01", 10, 1.5],
  ["Chr_Attach_German_Helmet_2", 10, 1.5],
  ["Wep_German_Rifle_01", 10, 1.3],
  ["Gen_Prop_Plank_01", 7, 1],
  ["Gen_Prop_Plank_02", 7, 1],
  ["Prop_Iron_Sheet_03", 5, 1],
  ["Prop_Shell_01", 6, 1.3],
  ["Prop_Shell_02", 4, 1.2],
  ["Env_Sandbag_01", 7, 1.1],
  ["Env_Sandbag_03", 6, 1.1],
  ["Char_Attach_German_Pack_01", 4, 1.5],
  ["Char_Attach_German_Canteen_01", 4, 1.5],
  ["Prop_Stretcher_01", 1, 1]
]
const LITTER_WEIGHT = LITTER.reduce((total, [, weight]) => total + weight, 0)
/** Litter is considered every this many metres, jittered within the square. */
const LITTER_SPACING = 5
/** Clear of the trenches' walls and spoil, in metres from a trench's centre line. */
const LITTER_CLEARANCE = 4

/**
 * What a battle leaves lying in no man's land: helmets of both sides, rifles, planks and sheets of iron, burst
 * sandbags, packs and canteens, duds, now and then a stretcher. It lies on the churned ground between the lines,
 * thickest within a few dozen metres of the trenches, where the attacks went in and were stopped, and never in a
 * trench or a pool.
 */
export function layOutLitter(map: BattlefieldMap): Placement[] {
  const legs = legsOf(map)
  const nearestTrench = (x: number, z: number) => distanceToLegs(legs, x, z)
  const pools = map.scenery.filter((item) => item.kind === "pool")
  const placements: Placement[] = []
  for (let gz = LITTER_SPACING / 2; gz < map.rows * map.cellSize; gz += LITTER_SPACING) {
    for (let gx = LITTER_SPACING / 2; gx < map.columns * map.cellSize; gx += LITTER_SPACING) {
      const x = gx + (hashOf(gx, gz, 50) - 0.5) * LITTER_SPACING
      const z = gz + (hashOf(gx, gz, 51) - 0.5) * LITTER_SPACING
      const column = Math.round(Math.min(map.columns, Math.max(0, x / map.cellSize)))
      const row = Math.round(Math.min(map.rows, Math.max(0, z / map.cellSize)))
      if (map.surfaces[sampleIndex(map, column, row)] !== Surface.Churned || hashOf(x, z, 52) > 0.3) {
        continue
      }
      const fromTrench = nearestTrench(x, z)
      // Thickest where the attacks broke on the wire, a few dozen metres out from the trenches.
      const chance = Math.min(0.3, 0.08 + 0.4 * Math.exp(-Math.max(0, fromTrench - LITTER_CLEARANCE) / 30))
      if (fromTrench < LITTER_CLEARANCE || hashOf(x, z, 53) > chance / 0.3) {
        continue
      }
      if (pools.some((pool) => Math.hypot(pool.x - x, pool.z - z) < pool.scale + 0.5)) {
        continue
      }
      let roll = hashOf(x, z, 54) * LITTER_WEIGHT
      const [piece, , size] = LITTER.find(([, weight]) => (roll -= weight) < 0) ?? LITTER[0] ?? ["", 0, 1]
      placements.push({
        piece,
        x,
        y: heightAt(map, x, z) - 0.03,
        z,
        yaw: hashOf(x, z, 55) * Math.PI * 2,
        up: groundNormal(map, x, z),
        scale: [size, size, size]
      })
    }
  }
  return placements
}

/**
 * What lies under a shelled wood, how often each turns up, and how much larger than life it's drawn: limbs brought
 * down, splinters and twigs, the twigs drawn larger so they read from the game's camera.
 */
const DEADWOOD: readonly (readonly [piece: string, weight: number, size: number])[] = [
  ["Env_Tree_Branch_01", 3, 1],
  ["Env_Tree_Branch_02", 3, 1],
  ["Env_Tree_Branch_03", 3, 1],
  ["Env_Tree_Branch_04", 3, 1],
  ["Tree_Branch_01", 4, 1],
  ["Gen_Env_Twig_02", 3, 1.8],
  ["Gen_Env_Twig_03", 3, 1.8],
  ["Gen_Env_Twig_04", 3, 1.8],
  ["Env_Tree_Shards_01", 2, 1],
  ["Env_Tree_Shards_02", 2, 1],
  ["Env_Tree_Shards_03", 2, 1]
]
const DEADWOOD_WEIGHT = DEADWOOD.reduce((total, [, weight]) => total + weight, 0)
/** Deadwood lies this far from the tree, stump or log it came off, in metres. */
const DEADWOOD_REACH = { min: 1.5, max: 4.5 } as const

/**
 * Deadwood round the trees, stumps and logs of the woods: limbs and splinters the shelling brought down, and twigs,
 * thickest where the shelling was heaviest. Never in a trench or a pool.
 */
export function layOutDeadwood(map: BattlefieldMap): Placement[] {
  const legs = legsOf(map)
  const battering = batteringFrom(legsOf(map, ["fire"]))
  const pools = map.scenery.filter((item) => item.kind === "pool")
  const placements: Placement[] = []
  for (const item of map.scenery) {
    if (item.kind !== "tree" && item.kind !== "fruit-tree" && item.kind !== "stump" && item.kind !== "log") {
      continue
    }
    const battered = battering(item.x, item.z)
    const count =
      (hashOf(item.x, item.z, 70) < 0.3 + 0.4 * battered ? 1 : 0) +
      (hashOf(item.x, item.z, 71) < 0.3 * battered ? 1 : 0)
    for (let index = 0; index < count; index++) {
      const angle = hashOf(item.x, item.z, 72 + index) * Math.PI * 2
      const reach = DEADWOOD_REACH.min + hashOf(item.x, item.z, 74 + index) * (DEADWOOD_REACH.max - DEADWOOD_REACH.min)
      const x = item.x + Math.sin(angle) * reach
      const z = item.z + Math.cos(angle) * reach
      if (
        distanceToLegs(legs, x, z) < LITTER_CLEARANCE ||
        pools.some((pool) => Math.hypot(pool.x - x, pool.z - z) < pool.scale + 0.5)
      ) {
        continue
      }
      let roll = hashOf(x, z, 76) * DEADWOOD_WEIGHT
      const [piece, , size] = DEADWOOD.find(([, weight]) => (roll -= weight) < 0) ?? DEADWOOD[0] ?? ["", 0, 1]
      placements.push({
        piece,
        x,
        y: heightAt(map, x, z) - 0.05,
        z,
        yaw: hashOf(x, z, 77) * Math.PI * 2,
        up: groundNormal(map, x, z),
        scale: [size, size, size]
      })
    }
  }
  return placements
}

/**
 * Places the art for every scenery item and wire belt on the map, the grass on the ground the shells spared, the
 * litter of battle in no man's land and the deadwood in the woods.
 */
export function layOutScenery(map: BattlefieldMap): Placement[] {
  const battering = batteringFrom(legsOf(map, ["fire"]))
  return [
    ...map.scenery.flatMap((item) => sceneryPlacements(map, item, battering(item.x, item.z))),
    ...map.wire.flatMap((belt) => wirePlacements(map, belt)),
    ...layOutGroundCover(map),
    ...layOutLitter(map),
    ...layOutDeadwood(map)
  ]
}
