import {
  type BattlefieldMap,
  heightAt,
  sampleIndex,
  type Scenery,
  type SceneryKind,
  Surface,
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

/** The art for each kind of scenery: one or more parts, picked between by the item's variant. */
const ART: Readonly<Record<Exclude<SceneryKind, "pool">, readonly (readonly Part[])[]>> = {
  ruin: RUINS.map((piece) => [
    { pieces: [piece], lift: -0.3 },
    { pieces: HEAPS, right: 2.5, forward: 3.2, turn: 0.4, tilt: true, lift: -0.1 },
    { pieces: HEAPS, right: -3, forward: -2.6, turn: 2.6, tilt: true, lift: -0.1 }
  ]),
  // The great barn of the farm on Fleury's main street, its chimney stack still standing.
  landmark: [
    [
      { pieces: ["Bld_Barn_Broken_01"], lift: -0.4 },
      { pieces: ["Prop_Chimney_01"], right: -8.5, forward: -4, lift: -0.2 },
      { pieces: ["Env_Rubble_Pile_Big"], right: 4, forward: 8, turn: 0.3, tilt: true, lift: -0.1 },
      { pieces: ["Env_Rubble_Pile_Corner"], right: -7.5, forward: 5, turn: -0.8, tilt: true, lift: -0.1 },
      { pieces: ["Env_StoneWall_Rubble_02"], right: 9, forward: 6, turn: 1.57, lift: -0.1 }
    ]
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
  wall: [
    [
      {
        pieces: [
          "Env_StoneWall_Rubble_01",
          "Env_StoneWall_Rubble_02",
          "Env_StoneWall_Rubble_03",
          "Env_StoneWall_Rubble_04"
        ],
        lift: -0.1
      }
    ]
  ],
  tree: [
    [
      {
        pieces: ["Env_Tree_Dead_04", "Gen_Env_Tree_Dead_01", "Gen_Env_Tree_Dead_02", "Gen_Env_Tree_Dead_03"],
        scaled: true,
        lift: -0.2
      }
    ]
  ],
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
    [
      {
        pieces: ["Gen_Env_Log_01", "Gen_Env_Log_02", "Env_Tree_Branch_01", "Env_Tree_Branch_02"],
        tilt: true,
        scaled: true,
        lift: -0.1
      }
    ]
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

function sceneryPlacements(map: BattlefieldMap, item: Scenery): Placement[] {
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
  const parts = variants[item.variant % variants.length] ?? []
  const forwardX = Math.sin(item.heading)
  const forwardZ = Math.cos(item.heading)
  return parts.map((part, index) => {
    const x = item.x + forwardZ * (part.right ?? 0) + forwardX * (part.forward ?? 0)
    const z = item.z - forwardX * (part.right ?? 0) + forwardZ * (part.forward ?? 0)
    const size = part.scaled ? item.scale : 1
    // A bridge spans a trench: it sits at the level of the ground either side, not the trench floor beneath it.
    const ground = item.kind === "bridge" ? heightAt(map, x, z) + 1.9 : heightAt(map, x, z)
    return {
      piece: pick(part.pieces, item.x, item.z, index),
      x,
      y: ground + (part.lift ?? 0) * size,
      z,
      yaw: item.heading + (part.turn ?? 0),
      up: part.tilt ? groundNormal(map, x, z) : undefined,
      scale: [size, size, size]
    }
  })
}

const FENCES = ["Prop_Wire_Fence_01", "Prop_Wire_Fence_02"]
const FENCE_LENGTH = 10.06
const TANGLES = ["Prop_Wire_Fence_Tangled_01", "Prop_Wire_Fence_Tangled_02", "Prop_Wire_Fence_Tangled_03"]

/**
 * A belt of wire: a staked fence along the line, with tangled coils thrown in front of and behind it. Fence pieces
 * run along their x axis and lean with the ground between their ends.
 */
function wirePlacements(map: BattlefieldMap, belt: WireBelt): Placement[] {
  const placements: Placement[] = []
  for (let index = 1; index < belt.points.length; index++) {
    const [ax, az] = belt.points[index - 1]
    const [bx, bz] = belt.points[index]
    const length = Math.hypot(bx - ax, bz - az)
    const dx = (bx - ax) / length
    const dz = (bz - az) / length
    const count = Math.max(1, Math.round(length / FENCE_LENGTH))
    for (let piece = 0; piece < count; piece++) {
      const from = (piece * length) / count
      const to = ((piece + 1) * length) / count
      const x = ax + dx * ((from + to) / 2)
      const z = az + dz * ((from + to) / 2)
      const start = heightAt(map, ax + dx * from, az + dz * from)
      const end = heightAt(map, ax + dx * to, az + dz * to)
      placements.push({
        piece: pick(FENCES, x, z, 0),
        x,
        y: (start + end) / 2 - 0.05,
        z,
        yaw: yawAlong(dx, dz) - Math.PI / 2,
        up: upForSlope(dx, dz, (end - start) / (to - from)),
        scale: [(to - from) / FENCE_LENGTH, 1, 1]
      })
      if (hashOf(x, z, 3) < 0.7) {
        const side = hashOf(x, z, 4) < 0.5 ? -1 : 1
        const tx = x - dz * side * 1.6
        const tz = z + dx * side * 1.6
        placements.push({
          piece: pick(TANGLES, tx, tz, 5),
          x: tx,
          y: heightAt(map, tx, tz) - 0.1,
          z: tz,
          yaw: yawAlong(dx, dz) - Math.PI / 2 + (hashOf(tx, tz, 6) - 0.5) * 0.8,
          up: groundNormal(map, tx, tz)
        })
      }
    }
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

/** Places the art for every scenery item and wire belt on the map, and the grass on the ground the shells spared. */
export function layOutScenery(map: BattlefieldMap): Placement[] {
  return [
    ...map.scenery.flatMap((item) => sceneryPlacements(map, item)),
    ...map.wire.flatMap((belt) => wirePlacements(map, belt)),
    ...layOutGroundCover(map)
  ]
}
