import type { Material } from "@babylonjs/core/Materials/material"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { Scene } from "@babylonjs/core/scene"
import {
  type BattlefieldMap,
  type GroundPoint,
  heightAt,
  mapDepth,
  mapWidth,
  railwayCourse,
  sampleIndex,
  Surface
} from "@verdun/map"
import { hashOf, type Placement, yawAlong } from "./placement.ts"

/** The field railway's pieces, made here since the kit has none. */
export const RAILWAY_PIECES = {
  track: "Railway_Track",
  worn: "Railway_Track_Worn",
  wagon: "Railway_Wagon",
  stop: "Railway_Stop"
} as const

/**
 * What the wagons carry: the kit's shells, crates and sacks, under names of their own so they're drawn as far off as the
 * wagons are, not dropped from sight with the litter (see DRAW_DISTANCE in dress-battlefield.ts).
 */
export const RAILWAY_LOADS = {
  Railway_Load_Shells: "Prop_Shell_02",
  Railway_Load_Crate: "Gen_Prop_Crate_02",
  Railway_Load_Sacks: "Gen_Prop_Sack_Stack_01"
} as const
type Load = keyof typeof RAILWAY_LOADS

/**
 * Decauville's 60 cm track, laid in panels: two rails fixed to sleepers, carried up in lengths and bolted end to end.
 * In metres: each panel's length, its sleepers, half sunk in the bed, and its rails, their centres `apart`.
 */
const TRACK = {
  panel: 2.5,
  sleeper: { length: 1.05, width: 0.14, depth: 0.08 },
  rail: { apart: 0.65, width: 0.05, height: 0.065 }
} as const
/** The rails' tops stand this high over the bed: the half of the sleeper out of it, and the rail on that. */
const RAIL_TOP = TRACK.sleeper.depth / 2 + TRACK.rail.height
/**
 * Each panel's four sleepers, each skewed off square by a hand laying it, in radians, and its timber's shade. The worn
 * panels have lost one and had others knocked askew.
 */
const SLEEPERS: Readonly<Record<"track" | "worn", readonly (readonly [skew: number, shade: string] | null)[]>> = {
  track: [
    [0.02, "#5e4f40"],
    [-0.035, "#514436"],
    [0.01, "#615241"],
    [0.04, "#574938"]
  ],
  worn: [[0.06, "#514436"], [-0.14, "#5e4f40"], null, [0.03, "#4b3f32"]]
}
/** One panel in this many is worn. */
const WORN_EVERY = 6

/**
 * The wagon: a four-wheeled flat wagon with low plank sides, in metres from the rails' top under its middle. Its wheels'
 * radius, width and how far their axles stand from the middle; its deck's top, length and width; its sides' height.
 */
const WAGON = {
  wheel: { radius: 0.17, width: 0.05, axle: 0.6 },
  deck: 0.42,
  length: 2.62,
  width: 1.22,
  sides: 0.16
} as const
/** Wagons coupled in a rake stand this far apart, middle to middle. */
const COUPLED = 3
/** Wagons stand at every dump within `reach` metres of a line, two or three to a rake. */
const RAKE = { reach: 10, least: 2, most: 3 } as const
/** What a wagon carries, a load on each half of its deck; some stand empty, unloaded or waiting to be. */
const LOADINGS: readonly (readonly Load[])[] = [
  ["Railway_Load_Shells", "Railway_Load_Shells"],
  ["Railway_Load_Crate", "Railway_Load_Sacks"],
  ["Railway_Load_Shells", "Railway_Load_Crate"],
  ["Railway_Load_Sacks", "Railway_Load_Sacks"],
  []
]
/** Each load's middle stands this far along the deck from the wagon's middle, forward or back. */
const LOAD_AT = 0.6
/** A line longer than this, in metres, has a wagon lying derailed beside it somewhere along its middle. */
const DERAILED_ON = 120
/** Where a line ends short of the sector's edge, a buffer stop takes this much of it. */
const STOP_ROOM = 1.6
/** Where a line runs off the sector, its track runs on this many metres over the ground beyond, past where it's drawn. */
const RUN_ON = 300
/** A line's end this close to the sector's edge runs off it. */
const EDGE = 0.5

const COLOURS = {
  rail: "#4a3a2e",
  /** The rails' heads, worn bright by the wheels. */
  railHead: "#7e786f",
  iron: "#2d2824",
  wheel: "#332b25",
  deck: "#6b5643",
  side: "#5f4b3a",
  timber: "#55432f"
} as const

type Point = readonly [number, number, number]

const ORIGIN: Point = [0, 0, 0]
const minus = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const meanOf = (points: readonly Point[]): Point => {
  const sum = points.reduce<Point>(
    (total, point) => [total[0] + point[0], total[1] + point[1], total[2] + point[2]],
    ORIGIN
  )
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length]
}

/** The corners of each face of a solid from its eight corners, numbered by side along each axis: x, then y, then z. */
const FACES = {
  left: [0, 2, 6, 4],
  right: [1, 3, 7, 5],
  bottom: [0, 1, 5, 4],
  top: [2, 3, 7, 6],
  back: [0, 1, 3, 2],
  front: [4, 5, 7, 6]
} as const
type Face = keyof typeof FACES

interface SolidOptions {
  /** The top face's colour, when it differs. */
  readonly top?: string
  /** Faces never seen, left out. */
  readonly without?: readonly Face[]
}

/** Flat-shaded solids in vertex colours, made into one mesh. */
function solids() {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  /** A flat, convex polygon, its corners in order round it, facing `outward`. */
  function face(corners: readonly Point[], outward: Point, shade: string): void {
    const [a = ORIGIN, b = ORIGIN, c = ORIGIN] = corners
    // Babylon draws a triangle's front where (a - b) x (c - b) points.
    const ordered = dot(cross(minus(a, b), minus(c, b)), outward) >= 0 ? corners : corners.toReversed()
    const colour = Color3.FromHexString(shade)
    const start = positions.length / 3
    for (const corner of ordered) {
      positions.push(...corner)
      colors.push(colour.r, colour.g, colour.b, 1)
    }
    for (let corner = 1; corner < ordered.length - 1; corner++) {
      indices.push(start, start + corner, start + corner + 1)
    }
  }

  /** A solid from its eight corners (see FACES). */
  function solid(corners: readonly Point[], shade: string, { top = shade, without = [] }: SolidOptions = {}): void {
    const middle = meanOf(corners)
    for (const [name, around] of Object.entries(FACES)) {
      if (without.some((left) => left === name)) {
        continue
      }
      const points = around.map((corner) => corners[corner] ?? ORIGIN)
      face(points, minus(meanOf(points), middle), name === "top" ? top : shade)
    }
  }

  return {
    /** A box `size` across, its middle at `at`, turned `yaw` about the vertical. */
    box(at: Point, size: Point, shade: string, options: SolidOptions & { readonly yaw?: number } = {}): void {
      const sin = Math.sin(options.yaw ?? 0)
      const cos = Math.cos(options.yaw ?? 0)
      const corners = Array.from({ length: 8 }, (_, corner): Point => {
        const x = ((corner & 1 ? 1 : -1) * size[0]) / 2
        const y = ((corner & 2 ? 1 : -1) * size[1]) / 2
        const z = ((corner & 4 ? 1 : -1) * size[2]) / 2
        return [at[0] + x * cos + z * sin, at[1] + y, at[2] - x * sin + z * cos]
      })
      solid(corners, shade, options)
    },
    /** A timber `width` by `height` from one point to another, its top face up. */
    beam(from: Point, to: Point, width: number, height: number, shade: string): void {
      const along = minus(to, from)
      // Its side lies level, square to its length; its top is square to both.
      const level = Math.hypot(along[0], along[2])
      const side: Point = level < 1e-6 ? [1, 0, 0] : [along[2] / level, 0, -along[0] / level]
      const square = cross(along, side)
      const size = Math.hypot(...square)
      const up: Point = [square[0] / size, square[1] / size, square[2] / size]
      const upward = up[1] < 0 ? -1 : 1
      const corners = Array.from({ length: 8 }, (_, corner): Point => {
        const end = corner & 4 ? to : from
        const out = ((corner & 1 ? 1 : -1) * width) / 2
        const high = ((corner & 2 ? 1 : -1) * height * upward) / 2
        return [
          end[0] + side[0] * out + up[0] * high,
          end[1] + side[1] * out + up[1] * high,
          end[2] + side[2] * out + up[2] * high
        ]
      })
      solid(corners, shade)
    },
    /** A wheel `radius` round to its corners and `width` thick, its axle along x, an octagon resting on a flat. */
    wheel(at: Point, radius: number, width: number, shade: string): void {
      const sides = 8
      const ring = (x: number) =>
        Array.from({ length: sides }, (_, corner): Point => {
          const angle = ((corner + 0.5) / sides) * Math.PI * 2
          return [x, at[1] + radius * Math.cos(angle), at[2] + radius * Math.sin(angle)]
        })
      const near = ring(at[0] - width / 2)
      const far = ring(at[0] + width / 2)
      for (let corner = 0; corner < sides; corner++) {
        const next = (corner + 1) % sides
        const angle = ((corner + 1) / sides) * Math.PI * 2
        const quad = [near[corner], near[next], far[next], far[corner]].filter((point) => point !== undefined)
        face(quad, [0, Math.cos(angle), Math.sin(angle)], shade)
      }
      face(near, [-1, 0, 0], shade)
      face(far, [1, 0, 0], shade)
    },
    /** The solids as one mesh, flat shaded, disabled like the kit's pieces: the dressing places it. */
    mesh(name: string, scene: Scene, material: Material): Mesh {
      const mesh = new Mesh(name, scene)
      const data = new VertexData()
      data.positions = positions
      data.colors = colors
      data.indices = indices
      const normals: number[] = []
      VertexData.ComputeNormals(positions, indices, normals)
      data.normals = normals
      data.applyToMesh(mesh)
      mesh.material = material
      mesh.setEnabled(false)
      return mesh
    }
  }
}

/** A panel of track along its z axis, its origin on the bed under its middle. */
function trackPanel(name: string, sleepers: (typeof SLEEPERS)["track"], scene: Scene, material: Material): Mesh {
  const panel = solids()
  for (const [index, sleeper] of sleepers.entries()) {
    if (sleeper) {
      const [skew, shade] = sleeper
      const z = ((index + 0.5) / sleepers.length - 0.5) * TRACK.panel
      const { length, width, depth } = TRACK.sleeper
      panel.box([0, 0, z], [length, depth, width], shade, { yaw: skew, without: ["bottom"] })
    }
  }
  for (const side of [-1, 1]) {
    const { apart, width, height } = TRACK.rail
    panel.box(
      [(side * apart) / 2, TRACK.sleeper.depth / 2 + height / 2, 0],
      [width, height, TRACK.panel],
      COLOURS.rail,
      {
        top: COLOURS.railHead,
        // Panels meet end to end: their rails' ends are never seen.
        without: ["bottom", "back", "front"]
      }
    )
  }
  return panel.mesh(name, scene, material)
}

/** The flat wagon along its z axis (see WAGON), its origin on the rails' top under its middle. */
function flatWagon(scene: Scene, material: Material): Mesh {
  const parts = solids()
  const { radius, width, axle } = WAGON.wheel
  // The octagon rests on a flat, which lies this far below its middle.
  const hub = radius * Math.cos(Math.PI / 8)
  for (const end of [-1, 1]) {
    const z = end * axle
    for (const side of [-1, 1]) {
      parts.wheel([(side * TRACK.rail.apart) / 2, hub, z], radius, width, COLOURS.wheel)
      parts.box([side * 0.42, hub + 0.02, z], [0.08, 0.13, 0.15], COLOURS.iron)
    }
    parts.box([0, hub, z], [TRACK.rail.apart + width, 0.045, 0.045], COLOURS.iron)
    // Headstock and coupling at each end.
    parts.box([0, 0.3, end * 1.25], [0.98, 0.13, 0.07], COLOURS.timber)
    parts.box([0, 0.3, end * (WAGON.length / 2 + 0.02)], [0.12, 0.08, 0.09], COLOURS.iron)
  }
  for (const side of [-1, 1]) {
    parts.box([side * 0.42, 0.3, 0], [0.07, 0.12, 2.5], COLOURS.iron)
  }
  const deck = 0.06
  parts.box([0, WAGON.deck - deck / 2, 0], [WAGON.width, deck, WAGON.length], COLOURS.deck)
  const sides = WAGON.deck + WAGON.sides / 2
  for (const side of [-1, 1]) {
    parts.box([side * (WAGON.width / 2 - 0.02), sides, 0], [0.04, WAGON.sides, WAGON.length], COLOURS.side)
    parts.box([0, sides, side * (WAGON.length / 2 - 0.02)], [WAGON.width - 0.08, WAGON.sides, 0.04], COLOURS.side)
  }
  return parts.mesh(RAILWAY_PIECES.wagon, scene, material)
}

/** A timber buffer stop at the end of a line, its beam toward +z where the wagons come from, its origin on the bed. */
function bufferStop(scene: Scene, material: Material): Mesh {
  const parts = solids()
  for (const side of [-1, 1]) {
    const x = side * 0.42
    parts.box([x, 0.37, -0.15], [0.16, 0.94, 0.16], COLOURS.timber)
    // Braced back into the ground behind it.
    parts.beam([x, 0.78, -0.22], [x, -0.04, -1.05], 0.12, 0.12, COLOURS.timber)
  }
  parts.box([0, 0.45, 0], [1.3, 0.24, 0.16], COLOURS.side)
  parts.box([0, 0.02, -1], [1.1, 0.1, 0.16], COLOURS.deck)
  return parts.mesh(RAILWAY_PIECES.stop, scene, material)
}

/** The railway's pieces (see RAILWAY_PIECES): its track, plain and worn, its wagon and its buffer stop. */
export function createRailwayPieces(scene: Scene): Mesh[] {
  const material = new StandardMaterial("railway", scene)
  material.specularColor = Color3.Black()
  return [
    trackPanel(RAILWAY_PIECES.track, SLEEPERS.track, scene, material),
    trackPanel(RAILWAY_PIECES.worn, SLEEPERS.worn, scene, material),
    flatWagon(scene, material),
    bufferStop(scene, material)
  ]
}

/** A line measured along its length: how long it is, the point so far along it, and how far along it a point lies. */
function measure(line: readonly GroundPoint[]) {
  const starts = [0]
  for (let index = 1; index < line.length; index++) {
    const [ax, az] = line[index - 1] ?? [0, 0]
    const [bx, bz] = line[index] ?? [0, 0]
    starts.push((starts.at(-1) ?? 0) + Math.hypot(bx - ax, bz - az))
  }
  const length = starts.at(-1) ?? 0
  return {
    length,
    /** The point `along` metres from its start, held to its ends. */
    at(along: number): GroundPoint {
      const held = Math.min(length, Math.max(0, along))
      let index = 1
      while (index < line.length - 1 && (starts[index] ?? 0) < held) {
        index++
      }
      const [ax, az] = line[index - 1] ?? [0, 0]
      const [bx, bz] = line[index] ?? [0, 0]
      const from = starts[index - 1] ?? 0
      const span = (starts[index] ?? 0) - from
      const t = span > 0 ? (held - from) / span : 0
      return [ax + (bx - ax) * t, az + (bz - az) * t]
    },
    /** How far from the line (x, z) lies, and how far along it its nearest point is. */
    nearest(x: number, z: number): { distance: number; along: number } {
      let best = { distance: Infinity, along: 0 }
      for (let index = 1; index < line.length; index++) {
        const [ax, az] = line[index - 1] ?? [0, 0]
        const [bx, bz] = line[index] ?? [0, 0]
        const span = (starts[index] ?? 0) - (starts[index - 1] ?? 0)
        const t = span > 0 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (span * span))) : 0
        const distance = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t))
        if (distance < best.distance) {
          best = { distance, along: (starts[index - 1] ?? 0) + span * t }
        }
      }
      return best
    }
  }
}

/** The surface of the ground at (x, z): its nearest sample's. */
function surfaceAt(map: BattlefieldMap, x: number, z: number): number | undefined {
  const column = Math.round(Math.min(map.columns, Math.max(0, x / map.cellSize)))
  const row = Math.round(Math.min(map.rows, Math.max(0, z / map.cellSize)))
  return map.surfaces[sampleIndex(map, column, row)]
}

function isOnEdge(map: BattlefieldMap, [x, z]: GroundPoint): boolean {
  return x <= EDGE || z <= EDGE || x >= mapWidth(map) - EDGE || z >= mapDepth(map) - EDGE
}

/** The course on, from its end `from` metres along it, `distance` metres further in the way it was going. */
function onward(course: readonly GroundPoint[], end: "first" | "last", distance: number): GroundPoint {
  const [x, z] = (end === "first" ? course[0] : course.at(-1)) ?? [0, 0]
  const [bx, bz] = (end === "first" ? course[1] : course.at(-2)) ?? [x - 1, z]
  const length = Math.hypot(x - bx, z - bz)
  return [x + ((x - bx) / length) * distance, z + ((z - bz) / length) * distance]
}

/**
 * Each railway's track: its course (see railwayCourse), and where it runs off the sector, given the ground beyond to
 * lay it on, on past the edge as far as RUN_ON.
 */
export function railwayTracks(map: BattlefieldMap, runOn: boolean): GroundPoint[][] {
  return map.railways.map((railway) => {
    const course = railwayCourse(railway)
    const [first, last] = [course[0], course.at(-1)]
    if (!runOn || !first || !last || course.length < 2) {
      return course
    }
    return [
      ...(isOnEdge(map, first) ? [onward(course, "first", RUN_ON)] : []),
      ...course,
      ...(isOnEdge(map, last) ? [onward(course, "last", RUN_ON)] : [])
    ]
  })
}

/** How far (x, z) lies from the nearest track's middle, in metres; Infinity when there's no track. */
export function distanceToTracks(tracks: readonly (readonly GroundPoint[])[], x: number, z: number): number {
  return Math.min(Infinity, ...tracks.map((track) => measure(track).nearest(x, z).distance))
}

/** Turns a vector by the shortest turn taking the vertical to `up`, as placementMatrix tilts a piece. */
function tiltedTo([ux, uy, uz]: Point, [vx, vy, vz]: Point): Point {
  const sine = Math.hypot(ux, uz)
  if (sine < 1e-9) {
    return [vx, vy, vz]
  }
  // About the level axis square to the tilt, by Rodrigues' formula.
  const kx = uz / sine
  const kz = -ux / sine
  const along = (kx * vx + kz * vz) * (1 - uy)
  return [
    vx * uy - kz * vy * sine + kx * along,
    vy * uy + (kz * vx - kx * vz) * sine,
    vz * uy + kx * vy * sine + kz * along
  ]
}

/** Where a point fixed to a placed piece, in the piece's own frame, lies in the world: turned, tilted and moved with it. */
function onPiece(piece: Placement, [x, y, z]: Point): Point {
  const sin = Math.sin(piece.yaw)
  const cos = Math.cos(piece.yaw)
  const [tx, ty, tz] = tiltedTo(piece.up ?? [0, 1, 0], [x * cos + z * sin, y, -x * sin + z * cos])
  return [piece.x + tx, piece.y + ty, piece.z + tz]
}

/** The ground's up across a piece `length` long, running along (dx, dz), its middle at (x, z). */
function upAcross(
  ground: (x: number, z: number) => number,
  x: number,
  z: number,
  [dx, dz]: GroundPoint,
  length: number
): Point {
  const along =
    (ground(x + (dx * length) / 2, z + (dz * length) / 2) - ground(x - (dx * length) / 2, z - (dz * length) / 2)) /
    length
  // Rising this much a metre to the right of the way it runs.
  const across = (ground(x + dz * 0.5, z - dx * 0.5) - ground(x - dz * 0.5, z + dx * 0.5)) / 1
  const up: Point = [-along * dx - across * dz, 1, across * dx - along * dz]
  const size = Math.hypot(...up)
  return [up[0] / size, up[1] / size, up[2] / size]
}

/** Panels of track laid end to end along a line, each from one point on it to the next, plain or worn. */
function panelsAlong(track: readonly GroundPoint[], ground: (x: number, z: number) => number): Placement[] {
  const line = measure(track)
  const count = Math.max(1, Math.round(line.length / TRACK.panel))
  const placements: Placement[] = []
  for (let panel = 0; panel < count; panel++) {
    const [ax, az] = line.at((panel * line.length) / count)
    const [bx, bz] = line.at(((panel + 1) * line.length) / count)
    const chord = Math.hypot(bx - ax, bz - az)
    const dx = (bx - ax) / chord
    const dz = (bz - az) / chord
    const x = (ax + bx) / 2
    const z = (az + bz) / 2
    const [ya, yb] = [ground(ax, az), ground(bx, bz)]
    const rise = (yb - ya) / chord
    const worn = hashOf(x, z, 90) < 1 / WORN_EVERY
    placements.push({
      piece: worn ? RAILWAY_PIECES.worn : RAILWAY_PIECES.track,
      x,
      y: (ya + yb) / 2,
      z,
      // Turned end for end now and then: its sleepers aren't all skewed the same way.
      yaw: yawAlong(dx, dz) + (hashOf(x, z, 91) < 0.5 ? Math.PI : 0),
      up: upAcross(ground, x, z, [dx, dz], chord),
      // From one point to the next, up its slope.
      scale: [1, 1, (chord * Math.hypot(1, rise)) / TRACK.panel]
    })
  }
  return placements
}

/** A wagon standing on the rails `along` metres down a line, and what it's loaded with. */
function wagonOn(
  line: ReturnType<typeof measure>,
  along: number,
  ground: (x: number, z: number) => number,
  loading: readonly Load[]
): Placement[] {
  const [ax, az] = line.at(along - WAGON.wheel.axle)
  const [bx, bz] = line.at(along + WAGON.wheel.axle)
  const span = Math.hypot(bx - ax, bz - az)
  const direction: GroundPoint = [(bx - ax) / span, (bz - az) / span]
  const [x, z] = line.at(along)
  const wagon: Placement = {
    piece: RAILWAY_PIECES.wagon,
    x,
    y: (ground(ax, az) + ground(bx, bz)) / 2 + RAIL_TOP,
    z,
    yaw: yawAlong(...direction),
    up: upAcross(ground, x, z, direction, span)
  }
  return [wagon, ...loading.map((load, index) => loaded(wagon, load, index === 0 ? -LOAD_AT : LOAD_AT))]
}

/** A load on a wagon's deck, `along` metres forward of its middle, set down a little askew. */
function loaded(wagon: Placement, load: Load, along: number): Placement {
  const [x, y, z] = onPiece(wagon, [0, WAGON.deck, along])
  return {
    piece: load,
    x,
    y,
    z,
    yaw: wagon.yaw + (hashOf(x, z, 92) - 0.5) * 0.12,
    up: wagon.up
  }
}

/** The ground's up at (x, z), from the heights half a metre either side. */
function groundUp(ground: (x: number, z: number) => number, x: number, z: number): Point {
  const slopeX = ground(x + 0.5, z) - ground(x - 0.5, z)
  const slopeZ = ground(x, z + 0.5) - ground(x, z - 0.5)
  const size = Math.hypot(slopeX, 1, slopeZ)
  return [-slopeX / size, 1 / size, -slopeZ / size]
}

/**
 * A wagon off the rails, over on its side beside the line `along` metres down it, `side` of the way it runs (1 its
 * right, -1 its left), its load spilled on the ground beyond it.
 */
function derailedAt(
  line: ReturnType<typeof measure>,
  along: number,
  side: 1 | -1,
  ground: (x: number, z: number) => number
): Placement[] {
  const [ax, az] = line.at(along - 1)
  const [bx, bz] = line.at(along + 1)
  const span = Math.hypot(bx - ax, bz - az)
  const [dx, dz] = [(bx - ax) / span, (bz - az) / span]
  const [cx, cz] = line.at(along)
  // Askew to the line, its wheels toward it, its deck facing away.
  const yaw = yawAlong(dx, dz) + side * 0.3
  const lean = 0.2
  const up: Point = [side * Math.cos(yaw) * Math.cos(lean), Math.sin(lean), -side * Math.sin(yaw) * Math.cos(lean)]
  const x = cx + dz * side * 1.4
  const z = cz - dx * side * 1.4
  const over: Placement = { piece: RAILWAY_PIECES.wagon, x, y: 0, z, yaw, up }
  // Down on the ground: its lowest corner just in it.
  const half = WAGON.width / 2
  const ends = WAGON.length / 2
  const corners = [-half, half].flatMap((cornerX) =>
    [0, WAGON.deck + WAGON.sides].flatMap((cornerY) =>
      [-ends, ends].map((cornerZ) => onPiece(over, [cornerX, cornerY, cornerZ]))
    )
  )
  const sink = Math.max(...corners.map(([px, py, pz]) => ground(px, pz) - py)) - 0.04
  const spilled = (load: Load, outward: number, forward: number): Placement => {
    const sx = cx + dz * side * outward + dx * forward
    const sz = cz - dx * side * outward + dz * forward
    return {
      piece: load,
      x: sx,
      y: ground(sx, sz) - 0.03,
      z: sz,
      yaw: hashOf(sx, sz, 93) * Math.PI * 2,
      up: groundUp(ground, sx, sz)
    }
  }
  return [{ ...over, y: sink }, spilled("Railway_Load_Shells", 3.3, 0.6), spilled("Railway_Load_Crate", 3.1, -1)]
}

/**
 * Lays the map's field railways: track along each line's course, run on over the ground beyond the sector where the
 * line leaves it and `beyond` gives that ground's height; a rake of wagons, loaded or waiting to be, at every dump near
 * the line; a buffer stop at each end short of the sector's edge; and a wagon off the rails beside a long line.
 */
export function layOutRailways(map: BattlefieldMap, beyond?: (x: number, z: number) => number): Placement[] {
  const inSector = (x: number, z: number) => x >= 0 && z >= 0 && x <= mapWidth(map) && z <= mapDepth(map)
  const ground = (x: number, z: number) => (beyond && !inSector(x, z) ? beyond(x, z) : heightAt(map, x, z))
  const tracks = railwayTracks(map, beyond !== undefined)
  const dumps = map.scenery.filter((item) => item.kind === "stores")
  const placements: Placement[] = []
  for (const [index, railway] of map.railways.entries()) {
    const course = railwayCourse(railway)
    const line = measure(course)
    const [first, last] = [course[0], course.at(-1)]
    if (!first || !last || line.length < WAGON.length) {
      continue
    }
    placements.push(...panelsAlong(tracks[index] ?? course, ground))
    // Room kept at each end: the buffer stop where the line ends in the sector, a margin where it runs off it.
    const room = (end: GroundPoint) => (isOnEdge(map, end) ? 5 : STOP_ROOM) + WAGON.length / 2
    const [from, to] = [room(first), line.length - room(last)]
    const taken: [number, number][] = []
    for (const dump of dumps) {
      const { distance, along } = line.nearest(dump.x, dump.z)
      if (distance > RAKE.reach) {
        continue
      }
      const wagons = hashOf(dump.x, dump.z, 94) < 0.5 ? RAKE.least : RAKE.most
      const half = ((wagons - 1) * COUPLED) / 2
      const middle = Math.min(to - half, Math.max(from + half, along))
      const span: [number, number] = [middle - half - COUPLED / 2, middle + half + COUPLED / 2]
      if (middle - half < from || taken.some(([start, end]) => span[0] < end && span[1] > start)) {
        continue
      }
      taken.push(span)
      for (let wagon = 0; wagon < wagons; wagon++) {
        const at = middle - half + wagon * COUPLED
        const [wx, wz] = line.at(at)
        const loading = LOADINGS[Math.floor(hashOf(wx, wz, 95) * LOADINGS.length)] ?? []
        placements.push(...wagonOn(line, at, ground, loading))
      }
    }
    for (const [end, point] of [
      ["first", first],
      ["last", last]
    ] as const) {
      if (!isOnEdge(map, point)) {
        // Facing back up the line, its beam where the rails end.
        const [bx, bz] = onward(course, end, -1)
        placements.push({
          piece: RAILWAY_PIECES.stop,
          x: point[0],
          y: heightAt(map, point[0], point[1]),
          z: point[1],
          yaw: yawAlong(bx - point[0], bz - point[1])
        })
      }
    }
    if (line.length > DERAILED_ON) {
      // Somewhere along the middle of the line, clear of the rakes and of whatever stands beside it.
      const candidates = [0.5, 0.42, 0.58, 0.35, 0.65].flatMap((share) =>
        ([1, -1] as const).map((side) => ({ along: line.length * share, side }))
      )
      const spot = candidates.find(({ along, side }) => {
        const [cx, cz] = line.at(along)
        const [ax, az] = line.at(along - 1)
        const [bx, bz] = line.at(along + 1)
        const span = Math.hypot(bx - ax, bz - az)
        const [dx, dz] = [(bx - ax) / span, (bz - az) / span]
        const [ox, oz] = [cx + dz * side * 2.5, cz - dx * side * 2.5]
        // Where the wagon and its load would lie: off the chalk of the roads.
        const ground = [1.4, 2.5, 3.3].flatMap((out) =>
          [-1.5, 0, 1.5].map((forward): GroundPoint => [
            cx + dz * side * out + dx * forward,
            cz - dx * side * out + dz * forward
          ])
        )
        return (
          inSector(ox, oz) &&
          !taken.some(([start, finish]) => along > start - 10 && along < finish + 10) &&
          map.scenery.every((item) => Math.hypot(item.x - ox, item.z - oz) > 5 + item.scale) &&
          ground.every(([x, z]) => surfaceAt(map, x, z) !== Surface.Chalk)
        )
      })
      if (spot) {
        placements.push(...derailedAt(line, spot.along, spot.side, ground))
      }
    }
  }
  return placements
}
