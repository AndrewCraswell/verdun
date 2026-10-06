import type { Crater } from "./craters.ts"
import { type Objective, SCENERY_KINDS, type SceneryKind } from "./scenery.ts"
import {
  type Frame,
  HEADING_DECIMALS,
  isFiniteNumber,
  isPositiveNumber,
  isRecord,
  isSceneryKind,
  METRE_DECIMALS,
  objectPosition,
  PIXEL_DECIMALS,
  polylinePoints,
  propertiesOf,
  readLayer,
  readObjective,
  round,
  TILED_PIXELS_PER_METRE,
  type TiledImageLayer,
  type TiledMap,
  type TiledObject,
  type TiledObjectLayer,
  type TiledProperty,
  toDegrees,
  toGround,
  toRadians
} from "./tiled.ts"
import type { GroundPoint } from "./trenches.ts"

/**
 * A sector's features, as a designer lays them out in Tiled: the lie of the ground and what stands on it, which the
 * generator then fills in (trenches, shell holes, scenery). Kept in packages/map/sectors/<name>.json, a Tiled JSON map
 * in the frame tiled.ts describes, one object layer per kind of feature (see docs/level-design.md, "Sector files").
 */
export interface SectorFeatures {
  readonly name: string
  /** Metres west to east and south to north: the map's size in Tiled's one-metre tiles. */
  readonly width: number
  readonly depth: number
  /** Whose recorded weather the battle has (see packages/sim, weather records). */
  readonly weatherRegion: string
  /** Generated ground's height south to north, where no survey is given: [z, height] pairs. */
  readonly rise: readonly GroundPoint[]
  readonly villages: readonly Village[]
  /** Valleys cut into the ground: flat-bedded, steep-sided, deepest along the middle of their course. */
  readonly ravines: readonly CutLine[]
  /** Lanes worn below the fields. */
  readonly sunkenRoads: readonly CutLine[]
  /** Chalk roads, shelled to nothing between the rear limits. */
  readonly roads: readonly (readonly GroundPoint[])[]
  /** Roads keep their surface south of `french` and north of `german`. */
  readonly rearRoads: { readonly french: number; readonly german: number }
  /** Village streets, houses lining them; the main street first. */
  readonly streets: readonly (readonly GroundPoint[])[]
  readonly crossroads: GroundPoint
  /** Field railways along their tracks, and the dumps they serve. */
  readonly railways: readonly (readonly GroundPoint[])[]
  readonly dumps: readonly GroundPoint[]
  readonly churches: readonly Church[]
  readonly orchards: readonly Orchard[]
  readonly woods: readonly Wood[]
  /** Craters older than the battle, such as mines blown under the lines. */
  readonly craters: readonly Crater[]
  /** Each side's trench system: the French first, then the Germans. */
  readonly sides: readonly TrenchSide[]
  /** Batteries of field guns, each gun dug in at its point if the ground there is clear. */
  readonly batteries: readonly Battery[]
  /** Things placed by hand, such as wrecks and concrete posts: each at the nearest clear spot to where it's drawn. */
  readonly placed: readonly Placed[]
  /** The ground both sides fight over. */
  readonly objectives: readonly Objective[]
  /** The surveyed ground drawn as shaded relief (scripts/sector-backdrop.mjs), shown under the features in Tiled. */
  readonly backdrop?: string
  /** The battlefield as last generated from it (pnpm map:check), shown over the features in Tiled when switched on. */
  readonly preview?: string
}

/**
 * One side's trench system as drawn: the course of its front, support and reserve lines, each from west to east, which
 * the generator traces into bays and traverses; where communication trenches and saps leave them; and its belts of wire.
 */
export interface TrenchSide {
  readonly side: "french" | "german"
  readonly front: readonly GroundPoint[]
  readonly support: readonly GroundPoint[]
  readonly reserve: readonly GroundPoint[]
  /** Where communication trenches run up from the support line to the front line, by x. */
  readonly forward: readonly number[]
  /** Where they run up from the reserve line to the support line. */
  readonly rear: readonly number[]
  /** Where saps push out from the front line toward the enemy. */
  readonly saps: readonly number[]
  /** How far in front of the front line each belt of wire is staked, in metres. */
  readonly wire: readonly number[]
}

export interface Battery {
  readonly guns: readonly GroundPoint[]
  /** Radians clockwise from north: where the guns point. */
  readonly heading: number
}

export interface Placed {
  readonly kind: SceneryKind
  readonly x: number
  readonly z: number
  readonly heading: number
  /** The clear ground it needs round it, in metres. */
  readonly radius: number
}

export interface Village {
  readonly name: string
  readonly x: number
  readonly z: number
  readonly radius: number
  /** The plateau it stands on, in metres, where the ground is generated. */
  readonly height: number
}

export interface CutLine {
  readonly name: string
  readonly points: readonly GroundPoint[]
  /** Metres either side of the line the cut reaches. */
  readonly halfWidth: number
  readonly depth: number
}

export interface Church {
  readonly x: number
  readonly z: number
  /** The landmark's kit variant. */
  readonly variant: number
  /** Radians clockwise from north: where its tower end points. */
  readonly heading: number
}

/** `rows` rows of `trees` fruit trees, `spacing` metres apart each way from the south-west tree at (x, z). */
export interface Orchard {
  readonly x: number
  readonly z: number
  readonly rows: number
  readonly trees: number
  readonly spacing: number
  readonly jitter: number
}

export interface Wood {
  readonly name: string
  readonly x: number
  readonly z: number
  readonly radiusX: number
  readonly radiusZ: number
  /** How thickly it's planted, 0 to 1. */
  readonly density: number
}

/** Layer names, as Tiled shows them. */
const LAYERS = {
  survey: "survey",
  generated: "generated",
  trenches: "trenches",
  positions: "positions",
  objectives: "objectives",
  ground: "ground",
  roads: "roads",
  railways: "railways",
  woods: "woods",
  landmarks: "landmarks"
} as const

/** A property a class of object carries in Tiled: its type, default and, for a choice, the enum it picks from. */
interface Member {
  readonly type: "float" | "int" | "string"
  readonly value: number | string
  readonly choices?: keyof typeof ENUMS
}

/** The choices a property can take, as drop-downs in Tiled. */
const ENUMS = {
  Side: ["french", "german"],
  Line: ["front", "support", "reserve"],
  From: ["support", "reserve"]
} as const

const float = (value: number): Member => ({ type: "float", value })
const int = (value: number): Member => ({ type: "int", value })
const choice = (choices: keyof typeof ENUMS, value: string): Member => ({ type: "string", value, choices })

/**
 * Every class of object a sector file holds, with its properties and their defaults. The Tiled project
 * (sectors/verdun.tiled-project, see toTiledProject) is made from this table, so picking an object's class in Tiled
 * gives a form to fill in; Tiled leaves out a property left at its default, so the reader takes it from here too.
 */
const CLASSES: Readonly<Record<string, Readonly<Record<string, Member>>>> = {
  ravine: { halfWidth: float(16), depth: float(9) },
  "sunken-road": { halfWidth: float(4.5), depth: float(2.3) },
  village: { height: float(7.5) },
  crater: { depth: float(4) },
  wood: { density: float(1) },
  road: {},
  street: {},
  crossroads: {},
  railway: {},
  dump: {},
  church: { heading: float(0), variant: int(1) },
  orchard: { rows: int(3), trees: int(9), spacing: float(6.5), jitter: float(1.2) },
  line: { side: choice("Side", "french"), line: choice("Line", "front"), wire: { type: "string", value: "" } },
  communication: { side: choice("Side", "french"), from: choice("From", "support") },
  sap: { side: choice("Side", "french") },
  battery: { heading: float(0) },
  objective: { radius: float(16) },
  // Anything of the scenery's own kinds can be placed by hand, at the nearest clear spot to where it's drawn.
  ...Object.fromEntries(SCENERY_KINDS.map((kind) => [kind, { heading: float(0), radius: float(3) }]))
}

/** The shape an object of a class is drawn as in a sector file. */
export type SectorShape = "point" | "polyline" | "ellipse"

/**
 * What an editor needs to know of the sector file's form: each object layer, in the order Tiled draws them, with the
 * classes it holds and the shape each is drawn as; every class's properties, their types and defaults; and the choices
 * the choice properties pick from. An objective is a point of no class in the objectives layer.
 */
export const SECTOR_FORM: {
  readonly layers: Readonly<Record<string, readonly { readonly className: string; readonly shape: SectorShape }[]>>
  readonly classes: Readonly<Record<string, Readonly<Record<string, SectorClassMember>>>>
  readonly enums: Readonly<Record<string, readonly string[]>>
} = {
  layers: {
    [LAYERS.ground]: [
      { className: "ravine", shape: "polyline" },
      { className: "sunken-road", shape: "polyline" },
      { className: "village", shape: "ellipse" },
      { className: "crater", shape: "ellipse" }
    ],
    [LAYERS.woods]: [{ className: "wood", shape: "ellipse" }],
    [LAYERS.roads]: [
      { className: "road", shape: "polyline" },
      { className: "street", shape: "polyline" },
      { className: "crossroads", shape: "point" }
    ],
    [LAYERS.railways]: [
      { className: "railway", shape: "polyline" },
      { className: "dump", shape: "point" }
    ],
    [LAYERS.trenches]: [
      { className: "line", shape: "polyline" },
      { className: "communication", shape: "point" },
      { className: "sap", shape: "point" }
    ],
    [LAYERS.positions]: [
      { className: "battery", shape: "polyline" },
      ...SCENERY_KINDS.map((kind) => ({ className: kind, shape: "point" as const }))
    ],
    [LAYERS.objectives]: [{ className: "", shape: "point" }],
    [LAYERS.landmarks]: [
      { className: "church", shape: "point" },
      { className: "orchard", shape: "point" }
    ]
  },
  classes: CLASSES,
  enums: ENUMS
}

/** A property of a class of sector object: its type, default and, for a choice, which of SECTOR_FORM's enums. */
export type SectorClassMember = Member

/** An object's properties: those it has, and its class's defaults for those Tiled left out. */
function propertiesWithDefaults(object: Record<string, unknown>, label: string): Map<string, unknown> {
  const own = propertiesOf(object, label)
  const kind = kindOf(object)
  const members = typeof kind === "string" ? CLASSES[kind] : undefined
  for (const [name, member] of Object.entries(members ?? {})) {
    if (!own.has(name)) {
      own.set(name, member.value)
    }
  }
  return own
}

/** A Tiled project for editing sector files: every class in CLASSES, with its form, and the choices' enums. */
export function toTiledProject(): unknown {
  let id = 1
  const enums = Object.entries(ENUMS).map(([name, values]) => ({
    id: id++,
    name,
    storageType: "string",
    type: "enum",
    values,
    valuesAsFlags: false
  }))
  const classes = Object.entries(CLASSES).map(([name, members]) => ({
    color: "#ff9e9e9e",
    drawFill: true,
    id: id++,
    members: Object.entries(members).map(([member, { type, value, choices }]) => ({
      name: member,
      ...(choices ? { propertyType: choices } : {}),
      type,
      value
    })),
    name,
    type: "class",
    useAs: ["object"]
  }))
  return {
    automappingRulesFile: "",
    commands: [],
    compatibilityVersion: 1100,
    extensionsPath: "extensions",
    folders: ["."],
    properties: [],
    propertyTypes: [...enums, ...classes]
  }
}

/** Writes a sector's features as a Tiled map, one object layer for each kind. */
/** A sector's Tiled map: its object layers, and the survey drawn under them. */
type TiledSectorMap = Omit<TiledMap, "layers"> & { readonly layers: readonly (TiledObjectLayer | TiledImageLayer)[] }

export function toTiledSector(features: SectorFeatures): TiledSectorMap {
  const ppm = TILED_PIXELS_PER_METRE
  const bottom = features.depth * ppm
  const pixelX = (x: number) => round(x * ppm, PIXEL_DECIMALS)
  const pixelY = (z: number) => round(bottom - z * ppm, PIXEL_DECIMALS)
  const metres = (value: number) => round(value, METRE_DECIMALS)
  const float = (name: string, value: number): TiledProperty => ({ name, type: "float", value })
  const int = (name: string, value: number): TiledProperty => ({ name, type: "int", value })

  let nextId = 1
  const base = { height: 0, rotation: 0, visible: true, width: 0 }
  const polyline = (type: string, name: string, points: readonly GroundPoint[], properties?: TiledProperty[]) => {
    const [firstX, firstZ] = points[0] ?? [0, 0]
    const x = pixelX(firstX)
    const y = pixelY(firstZ)
    return {
      ...base,
      id: nextId++,
      name,
      polyline: points.map(([px, pz]) => ({
        x: round(pixelX(px) - x, PIXEL_DECIMALS),
        y: round(pixelY(pz) - y, PIXEL_DECIMALS)
      })),
      ...(properties ? { properties } : {}),
      type,
      x,
      y
    } satisfies TiledObject
  }
  const point = (type: string, name: string, [x, z]: GroundPoint, properties?: TiledProperty[]) =>
    ({
      ...base,
      id: nextId++,
      name,
      point: true,
      ...(properties ? { properties } : {}),
      type,
      x: pixelX(x),
      y: pixelY(z)
    }) satisfies TiledObject
  // Tiled places an ellipse by the top left of its bounds.
  const ellipse = (
    type: string,
    name: string,
    x: number,
    z: number,
    radiusX: number,
    radiusZ: number,
    properties?: TiledProperty[]
  ) =>
    ({
      ...base,
      ellipse: true,
      height: round(radiusZ * 2 * ppm, PIXEL_DECIMALS),
      id: nextId++,
      name,
      ...(properties ? { properties } : {}),
      type,
      width: round(radiusX * 2 * ppm, PIXEL_DECIMALS),
      x: pixelX(x - radiusX),
      y: pixelY(z + radiusZ)
    }) satisfies TiledObject
  const cut = (type: string) => (line: CutLine) =>
    polyline(type, line.name, line.points, [
      float("depth", metres(line.depth)),
      float("halfWidth", metres(line.halfWidth))
    ])

  const ground = [
    ...features.ravines.map(cut("ravine")),
    ...features.sunkenRoads.map(cut("sunken-road")),
    ...features.villages.map((village) =>
      ellipse("village", village.name, village.x, village.z, village.radius, village.radius, [
        float("height", metres(village.height))
      ])
    ),
    ...features.craters.map((crater) =>
      ellipse("crater", "", crater.x, crater.z, crater.radius, crater.radius, [float("depth", metres(crater.depth))])
    )
  ]
  const roads = [
    ...features.roads.map((road) => polyline("road", "", road)),
    ...features.streets.map((street, index) => polyline("street", index === 0 ? "main street" : "", street)),
    point("crossroads", "", features.crossroads)
  ]
  const railways = [
    ...features.railways.map((railway) => polyline("railway", "", railway)),
    ...features.dumps.map((dump) => point("dump", "", dump))
  ]
  const woods = features.woods.map((wood) =>
    ellipse("wood", wood.name, wood.x, wood.z, wood.radiusX, wood.radiusZ, [float("density", wood.density)])
  )
  const landmarks = [
    ...features.churches.map((church) =>
      point(
        "church",
        "",
        [church.x, church.z],
        [float("heading", round(toDegrees(church.heading), HEADING_DECIMALS)), int("variant", church.variant)]
      )
    ),
    ...features.orchards.map((orchard) =>
      point(
        "orchard",
        "",
        [orchard.x, orchard.z],
        [
          float("jitter", orchard.jitter),
          int("rows", orchard.rows),
          float("spacing", orchard.spacing),
          int("trees", orchard.trees)
        ]
      )
    )
  ]

  // Each line, then a marker where each communication trench and sap leaves it, on the line it leaves, for the eye.
  const label = (name: string, value: string): TiledProperty => ({ name, type: "string", value })
  const trenches = features.sides.flatMap((side) => [
    ...LINES.map((line) =>
      polyline("line", `${side.side} ${line}`, side[line], [
        label("line", line),
        label("side", side.side),
        ...(line === "front" ? [label("wire", side.wire.join(" "))] : [])
      ])
    ),
    ...side.forward.map((x) =>
      point("communication", "", [x, lineZ(side.support, x)], [label("from", "support"), label("side", side.side)])
    ),
    ...side.rear.map((x) =>
      point("communication", "", [x, lineZ(side.reserve, x)], [label("from", "reserve"), label("side", side.side)])
    ),
    ...side.saps.map((x) => point("sap", "", [x, lineZ(side.front, x)], [label("side", side.side)]))
  ])

  const degrees = (heading: number) => float("heading", round(toDegrees(heading), HEADING_DECIMALS))
  const positions = [
    ...features.batteries.map((battery) => polyline("battery", "", battery.guns, [degrees(battery.heading)])),
    ...features.placed.map((item) =>
      point(item.kind, "", [item.x, item.z], [degrees(item.heading), float("radius", metres(item.radius))])
    )
  ]
  const objectives = features.objectives.map((objective) =>
    point("", objective.name, [objective.x, objective.z], [float("radius", metres(objective.radius))])
  )

  const layer = (
    id: number,
    name: string,
    objects: readonly TiledObject[],
    properties?: TiledProperty[]
  ): TiledObjectLayer => ({
    draworder: "index",
    id,
    name,
    objects,
    opacity: 1,
    ...(properties ? { properties } : {}),
    type: "objectgroup",
    visible: true,
    x: 0,
    y: 0
  })

  const image = (id: number, name: string, file: string, visible: boolean, opacity: number): TiledImageLayer => ({
    id,
    image: file,
    locked: true,
    name,
    opacity,
    repeatx: false,
    repeaty: false,
    type: "imagelayer",
    visible,
    x: 0,
    y: 0
  })
  const survey = features.backdrop ? [image(6, LAYERS.survey, features.backdrop, true, 0.85)] : []
  // Over the survey, under the features: hidden until wanted.
  const generated = features.preview ? [image(10, LAYERS.generated, features.preview, false, 1)] : []
  return {
    compressionlevel: -1,
    height: features.depth,
    infinite: false,
    // Tiled draws the first layer lowest: the survey under everything.
    layers: [
      ...survey,
      ...generated,
      layer(1, LAYERS.ground, ground),
      layer(7, LAYERS.trenches, trenches),
      layer(8, LAYERS.positions, positions),
      layer(9, LAYERS.objectives, objectives),
      layer(2, LAYERS.woods, woods),
      layer(3, LAYERS.roads, roads, [
        float("frenchRear", metres(features.rearRoads.french)),
        float("germanRear", metres(features.rearRoads.german))
      ]),
      layer(4, LAYERS.railways, railways),
      layer(5, LAYERS.landmarks, landmarks)
    ],
    nextlayerid: 11,
    nextobjectid: nextId,
    orientation: "orthogonal",
    properties: [
      { name: "name", type: "string", value: features.name },
      float("pixelsPerMetre", ppm),
      { name: "rise", type: "string", value: features.rise.map(([z, height]) => `${z}:${height}`).join(" ") },
      { name: "weatherRegion", type: "string", value: features.weatherRegion }
    ],
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: ppm,
    tilesets: [],
    tilewidth: ppm,
    type: "map",
    version: "1.10",
    width: features.width
  }
}

function positive(properties: Map<string, unknown>, name: string, label: string): number {
  const value = properties.get(name)
  if (!isPositiveNumber(value)) {
    throw new TypeError(`${label} needs a positive ${name}, got ${JSON.stringify(value)}`)
  }
  return value
}

function count(properties: Map<string, unknown>, name: string, label: string): number {
  const value = properties.get(name)
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} needs a whole number ${name}, got ${JSON.stringify(value)}`)
  }
  return value
}

function kindOf(object: Record<string, unknown>): unknown {
  return object.type ?? object.class
}

/** An ellipse's centre and radii, in map coordinates. */
function ellipseOf(frame: Frame, object: Record<string, unknown>, label: string) {
  const { width, height } = object
  if (object.ellipse !== true || !isPositiveNumber(width) || !isPositiveNumber(height)) {
    throw new TypeError(`${label} must be an ellipse`)
  }
  const { x, y } = objectPosition(object, label)
  const [centreX, centreZ] = toGround(frame, x + width / 2, y + height / 2)
  return {
    x: centreX,
    z: centreZ,
    radiusX: round(width / 2 / frame.ppm, METRE_DECIMALS),
    radiusZ: round(height / 2 / frame.ppm, METRE_DECIMALS)
  }
}

function pointOf(frame: Frame, object: Record<string, unknown>, label: string): GroundPoint {
  if (object.point !== true) {
    throw new TypeError(`${label} must be a point object`)
  }
  const { x, y } = objectPosition(object, label)
  return toGround(frame, x, y)
}

function nameOf(object: Record<string, unknown>): string {
  return typeof object.name === "string" ? object.name : ""
}

/** A Tiled layer's own properties. */
function layerProperties(layers: readonly unknown[], name: string): Map<string, unknown> {
  const layer = layers.find((candidate) => isRecord(candidate) && candidate.name === name)
  return isRecord(layer) ? propertiesOf(layer, `Tiled layer "${name}"`) : new Map()
}

/**
 * Reads a sector's features from a parsed Tiled map written by `toTiledSector` and edited in Tiled. Throws a TypeError
 * naming the object when something can't be read.
 */
export function fromTiledSector(json: unknown): SectorFeatures {
  if (!isRecord(json) || json.type !== "map" || json.orientation !== "orthogonal") {
    throw new TypeError("A sector file must be an orthogonal Tiled map")
  }
  const { width, height, tileheight, tilewidth, layers } = json
  if (!isPositiveNumber(width) || !isPositiveNumber(height) || !isPositiveNumber(tileheight)) {
    throw new TypeError("A sector file needs a positive width, height and tile size")
  }
  if (!Array.isArray(layers)) {
    throw new TypeError("A sector file needs a list of layers")
  }
  const properties = propertiesOf(json, "Sector file")
  const ppm = properties.get("pixelsPerMetre") ?? TILED_PIXELS_PER_METRE
  if (!isPositiveNumber(ppm) || tileheight !== ppm || tilewidth !== ppm) {
    throw new TypeError("A sector file's tiles must be a metre: as many pixels as its pixelsPerMetre")
  }
  const { name, weatherRegion, rise } = Object.fromEntries(properties)
  if (typeof name !== "string" || typeof weatherRegion !== "string" || typeof rise !== "string") {
    throw new TypeError("A sector file needs name, weatherRegion and rise properties")
  }
  const frame: Frame = { ppm, bottom: height * ppm }

  const villages: Village[] = []
  const ravines: CutLine[] = []
  const sunkenRoads: CutLine[] = []
  const craters: Crater[] = []
  readLayer(layers, LAYERS.ground, (object, label) => {
    const kind = kindOf(object)
    const own = propertiesWithDefaults(object, label)
    if (kind === "ravine" || kind === "sunken-road") {
      const line = {
        name: nameOf(object),
        points: polylinePoints(frame, object, label),
        halfWidth: positive(own, "halfWidth", label),
        depth: positive(own, "depth", label)
      }
      ;(kind === "ravine" ? ravines : sunkenRoads).push(line)
    } else if (kind === "village") {
      const { x, z, radiusX } = ellipseOf(frame, object, label)
      villages.push({ name: nameOf(object), x, z, radius: radiusX, height: positive(own, "height", label) })
    } else if (kind === "crater") {
      const { x, z, radiusX } = ellipseOf(frame, object, label)
      craters.push({ x, z, radius: radiusX, depth: positive(own, "depth", label) })
    } else {
      throw new TypeError(`${label} has class ${JSON.stringify(kind)}; expected ravine, sunken-road, village or crater`)
    }
  })

  const roads: GroundPoint[][] = []
  const streets: GroundPoint[][] = []
  const crossroads: GroundPoint[] = []
  readLayer(layers, LAYERS.roads, (object, label) => {
    const kind = kindOf(object)
    if (kind === "road") {
      roads.push(polylinePoints(frame, object, label))
    } else if (kind === "street") {
      // The main street first: the village's landmark is sited along it.
      const street = polylinePoints(frame, object, label)
      if (nameOf(object) === "main street") {
        streets.unshift(street)
      } else {
        streets.push(street)
      }
    } else if (kind === "crossroads") {
      crossroads.push(pointOf(frame, object, label))
    } else {
      throw new TypeError(`${label} has class ${JSON.stringify(kind)}; expected road, street or crossroads`)
    }
  })
  const rear = layerProperties(layers, LAYERS.roads)
  const french = rear.get("frenchRear")
  const german = rear.get("germanRear")
  if (!isFiniteNumber(french) || !isFiniteNumber(german)) {
    throw new TypeError(
      'Tiled layer "roads" needs frenchRear and germanRear properties: where roads keep their surface'
    )
  }

  const railways: GroundPoint[][] = []
  const dumps: GroundPoint[] = []
  readLayer(layers, LAYERS.railways, (object, label) => {
    const kind = kindOf(object)
    if (kind === "railway") {
      railways.push(polylinePoints(frame, object, label))
    } else if (kind === "dump") {
      dumps.push(pointOf(frame, object, label))
    } else {
      throw new TypeError(`${label} has class ${JSON.stringify(kind)}; expected railway or dump`)
    }
  })

  const woods = readLayer(layers, LAYERS.woods, (object, label) => {
    const { x, z, radiusX, radiusZ } = ellipseOf(frame, object, label)
    return {
      name: nameOf(object),
      x,
      z,
      radiusX,
      radiusZ,
      density: positive(propertiesWithDefaults(object, label), "density", label)
    }
  }).items

  const churches: Church[] = []
  const orchards: Orchard[] = []
  readLayer(layers, LAYERS.landmarks, (object, label) => {
    const kind = kindOf(object)
    const own = propertiesWithDefaults(object, label)
    const [x, z] = pointOf(frame, object, label)
    if (kind === "church") {
      const heading = own.get("heading") ?? 0
      if (!isFiniteNumber(heading)) {
        throw new TypeError(`${label} needs a heading in degrees, got ${JSON.stringify(heading)}`)
      }
      churches.push({ x, z, variant: count(own, "variant", label), heading: toRadians(heading) })
    } else if (kind === "orchard") {
      orchards.push({
        x,
        z,
        rows: count(own, "rows", label),
        trees: count(own, "trees", label),
        spacing: positive(own, "spacing", label),
        jitter: positive(own, "jitter", label)
      })
    } else {
      throw new TypeError(`${label} has class ${JSON.stringify(kind)}; expected church or orchard`)
    }
  })

  const sides = readTrenchSides(frame, layers)
  const batteries: Battery[] = []
  const placed: Placed[] = []
  readLayer(layers, LAYERS.positions, (object, label) => {
    const kind = kindOf(object)
    const own = propertiesWithDefaults(object, label)
    const heading = own.get("heading") ?? 0
    if (!isFiniteNumber(heading)) {
      throw new TypeError(`${label} needs a heading in degrees, got ${JSON.stringify(heading)}`)
    }
    if (kind === "battery") {
      batteries.push({ guns: polylinePoints(frame, object, label), heading: toRadians(heading) })
    } else if (isSceneryKind(kind)) {
      const [x, z] = pointOf(frame, object, label)
      placed.push({ kind, x, z, heading: toRadians(heading), radius: positive(own, "radius", label) })
    } else {
      throw new TypeError(`${label} has class ${JSON.stringify(kind)}; expected battery or a kind of scenery`)
    }
  })
  const objectives = readLayer(layers, LAYERS.objectives, (object, label) => readObjective(frame, object, label)).items
  const survey = layers.find((layer) => isRecord(layer) && layer.name === LAYERS.survey)
  const backdrop = isRecord(survey) && typeof survey.image === "string" ? survey.image : undefined
  const generatedLayer = layers.find((layer) => isRecord(layer) && layer.name === LAYERS.generated)
  const preview =
    isRecord(generatedLayer) && typeof generatedLayer.image === "string" ? generatedLayer.image : undefined
  const [cross] = crossroads
  if (!cross) {
    throw new TypeError('Tiled layer "roads" needs a crossroads point')
  }
  return {
    name,
    width,
    depth: height,
    weatherRegion,
    rise: rise
      .trim()
      .split(/\s+/)
      .map((pair): GroundPoint => {
        const [z, value] = pair.split(":").map(Number)
        if (!isFiniteNumber(z) || !isFiniteNumber(value)) {
          throw new TypeError(`Sector file's rise must be "z:height" pairs, got ${JSON.stringify(pair)}`)
        }
        return [z, value]
      }),
    villages,
    ravines,
    sunkenRoads,
    roads,
    rearRoads: { french, german },
    streets,
    crossroads: cross,
    railways,
    dumps,
    churches,
    orchards,
    woods,
    craters,
    sides,
    batteries,
    placed,
    objectives,
    ...(backdrop ? { backdrop } : {}),
    ...(preview ? { preview } : {})
  }
}

/** A line's z where it crosses x: along the drawn course, held level past its ends. Lines run west to east. */
export function lineZ(course: readonly GroundPoint[], x: number): number {
  const first = course[0]
  const last = course.at(-1)
  if (!first || !last) {
    return 0
  }
  if (x <= first[0]) {
    return first[1]
  }
  if (x >= last[0]) {
    return last[1]
  }
  let low = 0
  let high = course.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if ((course[middle]?.[0] ?? 0) <= x) {
      low = middle
    } else {
      high = middle
    }
  }
  const [x0, z0] = course[low] ?? first
  const [x1, z1] = course[high] ?? last
  return x1 === x0 ? z0 : z0 + ((z1 - z0) * (x - x0)) / (x1 - x0)
}

const SIDES = ["french", "german"] as const
const LINES = ["front", "support", "reserve"] as const

function oneOf<T extends string>(choices: readonly T[], value: unknown, what: string, label: string): T {
  const found = choices.find((choice) => choice === value)
  if (!found) {
    throw new TypeError(`${label} needs a ${what} of ${choices.join(" or ")}, got ${JSON.stringify(value)}`)
  }
  return found
}

/** What's drawn of one side, as the trenches layer is read. */
interface DrawnSide {
  readonly lines: Map<(typeof LINES)[number], GroundPoint[]>
  readonly forward: number[]
  readonly rear: number[]
  readonly saps: number[]
  readonly wire: number[]
}

/** The trenches layer: each side's three lines, and where its communication trenches and saps leave them. */
function readTrenchSides(frame: Frame, layers: readonly unknown[]): TrenchSide[] {
  const empty = (): DrawnSide => ({ lines: new Map(), forward: [], rear: [], saps: [], wire: [] })
  const drawn: Record<(typeof SIDES)[number], DrawnSide> = { french: empty(), german: empty() }
  readLayer(layers, LAYERS.trenches, (object, label) => {
    const kind = kindOf(object)
    const own = propertiesWithDefaults(object, label)
    const side = drawn[oneOf(SIDES, own.get("side"), "side", label)]
    if (kind === "line") {
      const line = oneOf(LINES, own.get("line"), "line", label)
      const points = polylinePoints(frame, object, label)
      if (points.some(([x], index) => index > 0 && x <= (points[index - 1]?.[0] ?? x))) {
        throw new TypeError(`${label} must run west to east, each point east of the last`)
      }
      if (side.lines.has(line)) {
        throw new TypeError(`${label} is a second ${line} line for its side`)
      }
      side.lines.set(line, points)
      if (line === "front") {
        const wire = own.get("wire") ?? ""
        const distances = typeof wire === "string" ? wire.split(/\s+/).filter(Boolean).map(Number) : [Number.NaN]
        if (!distances.every(isPositiveNumber)) {
          throw new TypeError(
            `${label} needs its wire as distances in metres, such as "22 33", got ${JSON.stringify(wire)}`
          )
        }
        side.wire.push(...distances)
      }
    } else if (kind === "communication") {
      const [x] = pointOf(frame, object, label)
      const from = oneOf(["support", "reserve"], own.get("from"), "from", label)
      ;(from === "support" ? side.forward : side.rear).push(x)
    } else if (kind === "sap") {
      side.saps.push(pointOf(frame, object, label)[0])
    } else {
      throw new TypeError(`${label} has class ${JSON.stringify(kind)}; expected line, communication or sap`)
    }
  })
  return SIDES.map((name) => {
    const side = drawn[name]
    const line = (which: (typeof LINES)[number]) => {
      const points = side.lines.get(which)
      if (!points) {
        throw new TypeError(`Tiled layer "trenches" needs a ${name} ${which} line`)
      }
      return points
    }
    return {
      side: name,
      front: line("front"),
      support: line("support"),
      reserve: line("reserve"),
      forward: side.forward,
      rear: side.rear,
      saps: side.saps,
      wire: side.wire
    }
  })
}
