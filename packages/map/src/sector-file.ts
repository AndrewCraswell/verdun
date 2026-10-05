import type { Crater } from "./craters.ts"
import {
  type Frame,
  HEADING_DECIMALS,
  isFiniteNumber,
  isPositiveNumber,
  isRecord,
  METRE_DECIMALS,
  objectPosition,
  PIXEL_DECIMALS,
  polylinePoints,
  propertiesOf,
  readLayer,
  round,
  TILED_PIXELS_PER_METRE,
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
  ground: "ground",
  roads: "roads",
  railways: "railways",
  woods: "woods",
  landmarks: "landmarks"
} as const

/** Writes a sector's features as a Tiled map, one object layer for each kind. */
export function toTiledSector(features: SectorFeatures): TiledMap {
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

  return {
    compressionlevel: -1,
    height: features.depth,
    infinite: false,
    layers: [
      layer(1, LAYERS.ground, ground),
      layer(2, LAYERS.woods, woods),
      layer(3, LAYERS.roads, roads, [
        float("frenchRear", metres(features.rearRoads.french)),
        float("germanRear", metres(features.rearRoads.german))
      ]),
      layer(4, LAYERS.railways, railways),
      layer(5, LAYERS.landmarks, landmarks)
    ],
    nextlayerid: 6,
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
    const own = propertiesOf(object, label)
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
      density: positive(propertiesOf(object, label), "density", label)
    }
  }).items

  const churches: Church[] = []
  const orchards: Orchard[] = []
  readLayer(layers, LAYERS.landmarks, (object, label) => {
    const kind = kindOf(object)
    const own = propertiesOf(object, label)
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
    craters
  }
}
