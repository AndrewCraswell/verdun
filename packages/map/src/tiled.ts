import type { BattlefieldMap } from "./format.ts"
import {
  type Objective,
  type Railway,
  SCENERY_KINDS,
  type Scenery,
  type SceneryKind,
  type WireBelt
} from "./scenery.ts"
import { TRENCH_GRID } from "./trench-trace.ts"
import type { GroundPoint, Trench } from "./trenches.ts"

/**
 * Battlefield layouts as Tiled (https://www.mapeditor.org) maps, so trench lines, wire and scenery can be edited by hand.
 *
 * Conventions: an orthogonal map with no tilesets and one-metre tiles, at 10 pixels per metre. Tiled's x is ours times
 * ten. Tiled's y grows downward and our z grows north, so y is flipped about the map's bottom edge: y = (depth - z) * 10,
 * where depth is the map's height in metres (tiles). North is up on screen. Headings are stored in degrees clockwise
 * from north, which is clockwise on screen.
 */
export const TILED_PIXELS_PER_METRE = 10

/** Edge length of a Tiled tile, in metres: the editor's grid and snapping step. */
const TILE_METRES = 1

/** Layer names, as Tiled shows them. */
const TILED_LAYERS = {
  trenches: "trenches",
  wire: "wire",
  scenery: "scenery",
  objectives: "objectives",
  railways: "railways"
} as const

/** Positions are written to the nearest millimetre, headings to a hundredth of a degree and scales to 1/10000. */
export const PIXEL_DECIMALS = 2
export const HEADING_DECIMALS = 2
const SCALE_DECIMALS = 4
export const METRE_DECIMALS = 3

/** What a Tiled map holds: everything a designer lays out by hand. */
export interface TiledLayout {
  readonly trenches: readonly Trench[]
  readonly wire: readonly WireBelt[]
  readonly scenery: readonly Scenery[]
  /** The ground both sides fight over; absent from maps saved before there was a layer for it. */
  readonly objectives?: readonly Objective[]
  /** Field railways, each a line along its track; absent from maps saved before there was a layer for them. */
  readonly railways?: readonly Railway[]
}

/** A layout read back from Tiled, with any places the trench kit can't line as drawn. */
export interface TiledImport extends TiledLayout {
  readonly warnings: readonly string[]
}

export interface TiledProperty {
  readonly name: string
  readonly type: "string" | "float" | "int"
  readonly value: string | number
}

interface TiledPoint {
  readonly x: number
  readonly y: number
}

export interface TiledObject {
  readonly ellipse?: true
  readonly height: number
  readonly id: number
  readonly name: string
  readonly point?: true
  readonly polyline?: readonly TiledPoint[]
  readonly properties?: readonly TiledProperty[]
  readonly rotation: number
  readonly type: string
  readonly visible: boolean
  readonly width: number
  readonly x: number
  readonly y: number
}

export interface TiledObjectLayer {
  readonly draworder: "index"
  readonly id: number
  readonly name: string
  readonly objects: readonly TiledObject[]
  readonly opacity: number
  readonly type: "objectgroup"
  readonly visible: boolean
  readonly x: number
  readonly y: number
}

/** A Tiled JSON map (.tmj). Keys are in the alphabetical order Tiled writes them in, so re-saving in Tiled diffs small. */
export interface TiledMap {
  readonly compressionlevel: number
  readonly height: number
  readonly infinite: false
  readonly layers: readonly TiledObjectLayer[]
  readonly nextlayerid: number
  readonly nextobjectid: number
  readonly orientation: "orthogonal"
  readonly properties: readonly TiledProperty[]
  readonly renderorder: "right-down"
  readonly tiledversion: string
  readonly tileheight: number
  readonly tilesets: readonly never[]
  readonly tilewidth: number
  readonly type: "map"
  readonly version: string
  readonly width: number
}

type TiledSource = Pick<
  BattlefieldMap,
  "name" | "cellSize" | "columns" | "rows" | "trenches" | "wire" | "scenery" | "objectives" | "railways"
>

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  // Adding zero turns -0 into 0, which JSON would write as 0 anyway but tests compare exactly.
  return Math.round(value * factor) / factor + 0
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Writes a battlefield's trenches, wire, scenery and objectives as a Tiled map, one object layer each. */
export function toTiledMap(map: TiledSource): TiledMap {
  const ppm = TILED_PIXELS_PER_METRE
  const tile = TILE_METRES * ppm
  const width = Math.ceil((map.columns * map.cellSize) / TILE_METRES - 1e-9)
  const height = Math.ceil((map.rows * map.cellSize) / TILE_METRES - 1e-9)
  const bottom = height * tile
  const pixelX = (x: number) => round(x * ppm, PIXEL_DECIMALS)
  const pixelY = (z: number) => round(bottom - z * ppm, PIXEL_DECIMALS)

  let nextId = 1
  const polylineObject = (points: readonly GroundPoint[], properties?: readonly TiledProperty[]): TiledObject => {
    const [firstX, firstZ] = points[0] ?? [0, 0]
    const x = pixelX(firstX)
    const y = pixelY(firstZ)
    return {
      height: 0,
      id: nextId++,
      name: "",
      polyline: points.map(([px, pz]) => ({
        x: round(pixelX(px) - x, PIXEL_DECIMALS),
        y: round(pixelY(pz) - y, PIXEL_DECIMALS)
      })),
      ...(properties ? { properties } : {}),
      rotation: 0,
      type: "",
      visible: true,
      width: 0,
      x,
      y
    }
  }

  const trenches = map.trenches.map((trench) =>
    polylineObject(trench.points, [
      { name: "facing", type: "string", value: trench.facing ?? "none" },
      { name: "kind", type: "string", value: trench.kind }
    ])
  )
  const wire = map.wire.map((belt) => polylineObject(belt.points))
  const railways = map.railways.map((railway) => polylineObject(railway.points))
  const scenery = map.scenery.map((item): TiledObject => ({
    height: 0,
    id: nextId++,
    name: "",
    point: true,
    properties: [
      { name: "heading", type: "float", value: round(toDegrees(item.heading), HEADING_DECIMALS) },
      { name: "scale", type: "float", value: round(item.scale, SCALE_DECIMALS) },
      { name: "variant", type: "int", value: item.variant }
    ],
    rotation: 0,
    type: item.kind,
    visible: true,
    width: 0,
    x: pixelX(item.x),
    y: pixelY(item.z)
  }))
  // An objective is a named point; the ground held round it, its radius.
  const objectives = map.objectives.map((objective): TiledObject => ({
    height: 0,
    id: nextId++,
    name: objective.name,
    point: true,
    properties: [{ name: "radius", type: "float", value: round(objective.radius, METRE_DECIMALS) }],
    rotation: 0,
    type: "",
    visible: true,
    width: 0,
    x: pixelX(objective.x),
    y: pixelY(objective.z)
  }))

  const layer = (id: number, name: string, objects: readonly TiledObject[]): TiledObjectLayer => ({
    draworder: "index",
    id,
    name,
    objects,
    opacity: 1,
    type: "objectgroup",
    visible: true,
    x: 0,
    y: 0
  })

  return {
    compressionlevel: -1,
    height,
    infinite: false,
    // Tiled draws the first layer lowest: trenches under wire and railways, then scenery and objectives on top, where
    // their pins are easy to pick.
    layers: [
      layer(1, TILED_LAYERS.trenches, trenches),
      layer(2, TILED_LAYERS.wire, wire),
      layer(5, TILED_LAYERS.railways, railways),
      layer(3, TILED_LAYERS.scenery, scenery),
      layer(4, TILED_LAYERS.objectives, objectives)
    ],
    nextlayerid: 6,
    nextobjectid: nextId,
    orientation: "orthogonal",
    properties: [
      { name: "name", type: "string", value: map.name },
      { name: "pixelsPerMetre", type: "float", value: ppm }
    ],
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: tile,
    tilesets: [],
    tilewidth: tile,
    type: "map",
    version: "1.10",
    width
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function isSceneryKind(value: unknown): value is SceneryKind {
  return SCENERY_KINDS.some((kind) => kind === value)
}

/** Custom properties of a map or object, by name. */
export function propertiesOf(owner: Record<string, unknown>, label: string): Map<string, unknown> {
  const { properties } = owner
  const found = new Map<string, unknown>()
  if (properties === undefined) {
    return found
  }
  if (!Array.isArray(properties)) {
    throw new TypeError(`${label} has properties that aren't a list`)
  }
  for (const property of properties) {
    if (!isRecord(property) || typeof property.name !== "string") {
      throw new TypeError(`${label} has a property without a name`)
    }
    found.set(property.name, property.value)
  }
  return found
}

export interface Frame {
  readonly ppm: number
  readonly bottom: number
}

export function toGround(frame: Frame, x: number, y: number): GroundPoint {
  return [round(x / frame.ppm, METRE_DECIMALS), round((frame.bottom - y) / frame.ppm, METRE_DECIMALS)]
}

function objectLabel(layer: string, object: unknown, index: number): string {
  const id = isRecord(object) && isFiniteNumber(object.id) ? `object ${object.id}` : `object #${index + 1}`
  return `Tiled ${id} in layer "${layer}"`
}

export function objectPosition(object: Record<string, unknown>, label: string): { x: number; y: number } {
  const { x, y } = object
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    throw new TypeError(`${label} needs a numeric x and y`)
  }
  return { x, y }
}

/** A polyline's points in map coordinates, turned by the object's rotation (degrees clockwise about its origin). */
export function polylinePoints(frame: Frame, object: Record<string, unknown>, label: string): GroundPoint[] {
  const { polyline, rotation = 0 } = object
  if (!Array.isArray(polyline)) {
    throw new TypeError(`${label} must be a polyline`)
  }
  if (polyline.length < 2) {
    throw new TypeError(`${label} needs at least two points`)
  }
  if (!isFiniteNumber(rotation)) {
    throw new TypeError(`${label} has a rotation that isn't a number`)
  }
  const origin = objectPosition(object, label)
  const cos = Math.cos(toRadians(rotation))
  const sin = Math.sin(toRadians(rotation))
  return polyline.map((point: unknown): GroundPoint => {
    if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
      throw new TypeError(`${label} has a polyline point without a numeric x and y`)
    }
    return toGround(frame, origin.x + point.x * cos - point.y * sin, origin.y + point.x * sin + point.y * cos)
  })
}

function readTrench(frame: Frame, object: Record<string, unknown>, label: string): Trench {
  const properties = propertiesOf(object, label)
  const kind = properties.get("kind")
  const facing = properties.get("facing")
  if (kind !== "fire" && kind !== "communication") {
    throw new TypeError(`${label} needs a kind property of "fire" or "communication", got ${JSON.stringify(kind)}`)
  }
  const points = polylinePoints(frame, object, label)
  if (kind === "communication") {
    if (facing !== undefined && facing !== "" && facing !== "none") {
      throw new TypeError(`${label} is a communication trench, which faces "none", got ${JSON.stringify(facing)}`)
    }
    return { kind, points, facing: null }
  }
  if (facing !== "north" && facing !== "south") {
    throw new TypeError(
      `${label} is a fire trench and needs a facing of "north" or "south", got ${JSON.stringify(facing)}`
    )
  }
  return { kind, points, facing }
}

function readScenery(frame: Frame, object: Record<string, unknown>, label: string): Scenery {
  const kind = object.type ?? object.class
  if (!isSceneryKind(kind)) {
    throw new TypeError(`${label} has class ${JSON.stringify(kind)}; expected one of ${SCENERY_KINDS.join(", ")}`)
  }
  if (object.point !== true) {
    throw new TypeError(`${label} must be a point object`)
  }
  const { x, y } = objectPosition(object, label)
  const properties = propertiesOf(object, label)
  const heading = properties.get("heading") ?? 0
  const variant = properties.get("variant") ?? 0
  const scale = properties.get("scale") ?? 1
  if (!isFiniteNumber(heading)) {
    throw new TypeError(`${label} needs a heading in degrees, got ${JSON.stringify(heading)}`)
  }
  if (typeof variant !== "number" || !Number.isInteger(variant) || variant < 0) {
    throw new TypeError(`${label} needs a variant that is a whole number from 0, got ${JSON.stringify(variant)}`)
  }
  if (!isPositiveNumber(scale)) {
    throw new TypeError(`${label} needs a positive scale, got ${JSON.stringify(scale)}`)
  }
  const [mapX, mapZ] = toGround(frame, x, y)
  return { kind, x: mapX, z: mapZ, heading: toRadians(heading), variant, scale }
}

function readObjective(frame: Frame, object: Record<string, unknown>, label: string): Objective {
  if (object.point !== true) {
    throw new TypeError(`${label} must be a point object`)
  }
  const { name } = object
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError(`${label} needs a name`)
  }
  const radius = propertiesOf(object, label).get("radius")
  if (!isPositiveNumber(radius)) {
    throw new TypeError(`${label} needs a positive radius in metres, got ${JSON.stringify(radius)}`)
  }
  const { x, y } = objectPosition(object, label)
  const [mapX, mapZ] = toGround(frame, x, y)
  return { name, x: mapX, z: mapZ, radius }
}

/** The objects of the named top-level object layer. */
function layerObjects(layers: readonly unknown[], name: string): { objects: unknown[] } {
  const matches = layers.filter((layer) => isRecord(layer) && layer.name === name)
  const [layer] = matches
  if (!isRecord(layer)) {
    throw new TypeError(`Tiled map has no "${name}" layer`)
  }
  if (matches.length > 1) {
    throw new TypeError(`Tiled map has ${matches.length} layers named "${name}"; merge them into one`)
  }
  if (layer.type !== "objectgroup" || !Array.isArray(layer.objects)) {
    throw new TypeError(`Tiled layer "${name}" must be an object layer`)
  }
  return { objects: layer.objects }
}

export function readLayer<T>(
  layers: readonly unknown[],
  name: string,
  read: (object: Record<string, unknown>, label: string) => T
): { items: T[]; ids: string[] } {
  const items: T[] = []
  const ids: string[] = []
  for (const [index, object] of layerObjects(layers, name).objects.entries()) {
    const label = objectLabel(name, object, index)
    if (!isRecord(object)) {
      throw new TypeError(`${label} must be an object`)
    }
    items.push(read(object, label))
    ids.push(label)
  }
  return { items, ids }
}

/**
 * Reads the layout from a parsed Tiled map written by `toTiledMap` and edited in Tiled. Throws a TypeError naming the
 * object when something can't be read. Places the trench kit can't line as drawn come back as warnings.
 */
export function fromTiledMap(json: unknown): TiledImport {
  if (!isRecord(json) || json.type !== "map") {
    throw new TypeError("Tiled map must be a JSON object of type map")
  }
  if (json.orientation !== "orthogonal") {
    throw new TypeError(`Tiled map must be orthogonal, got ${JSON.stringify(json.orientation)}`)
  }
  const { height, tileheight, layers } = json
  if (!isPositiveNumber(height) || !isPositiveNumber(tileheight)) {
    throw new TypeError("Tiled map needs a positive height and tile height")
  }
  if (!Array.isArray(layers)) {
    throw new TypeError("Tiled map needs a list of layers")
  }
  const ppm = propertiesOf(json, "Tiled map").get("pixelsPerMetre") ?? TILED_PIXELS_PER_METRE
  if (!isPositiveNumber(ppm)) {
    throw new TypeError(`Tiled map property pixelsPerMetre must be a positive number, got ${JSON.stringify(ppm)}`)
  }
  const frame: Frame = { ppm, bottom: height * tileheight }

  const trenches = readLayer(layers, TILED_LAYERS.trenches, (object, label) => readTrench(frame, object, label))
  const wire = readLayer(layers, TILED_LAYERS.wire, (object, label) => ({
    points: polylinePoints(frame, object, label)
  }))
  const scenery = readLayer(layers, TILED_LAYERS.scenery, (object, label) => readScenery(frame, object, label))
  // Maps saved before objectives had a layer keep the generated ones.
  const hasObjectives = layers.some((layer) => isRecord(layer) && layer.name === TILED_LAYERS.objectives)
  const objectives = hasObjectives
    ? readLayer(layers, TILED_LAYERS.objectives, (object, label) => readObjective(frame, object, label)).items
    : undefined
  // And before railways had one, the generated railways.
  const hasRailways = layers.some((layer) => isRecord(layer) && layer.name === TILED_LAYERS.railways)
  const railways = hasRailways
    ? readLayer(layers, TILED_LAYERS.railways, (object, label) => ({ points: polylinePoints(frame, object, label) }))
        .items
    : undefined

  const warnings = checkTrenchKit(trenches.items).map(({ trench, message }) => `${trenches.ids[trench]!}: ${message}`)
  return {
    trenches: trenches.items,
    wire: wire.items,
    scenery: scenery.items,
    ...(objectives ? { objectives } : {}),
    ...(railways ? { railways } : {}),
    warnings
  }
}

/** A place where the trench kit can't line a trench as drawn. */
export interface TrenchKitWarning {
  /** Index of the trench in the list checked. */
  readonly trench: number
  readonly at: GroundPoint
  readonly message: string
}

/** How far a joint may miss a trench centre line, or a turn a right angle, and still count. */
const JOINT_TOLERANCE = 0.05
const ANGLE_TOLERANCE = Math.sin(toRadians(0.5))
const LENGTH_TOLERANCE = 0.01

/** Free ends need no straight trench beside them; turns and junctions need the kit's clearance either side. */
type StationKind = "end" | "turn" | "junction"
const STATION_RANK: Record<StationKind, number> = { end: 0, turn: 1, junction: 2 }

interface Station {
  /** Distance along the trench. */
  readonly along: number
  readonly at: GroundPoint
  readonly what: StationKind
}

function describe([x, z]: GroundPoint): string {
  return `(${x.toFixed(1)}, ${z.toFixed(1)})`
}

/** Unit direction of a trench's segment from point `segment` to the next. Zero for a repeated point. */
function direction(points: readonly GroundPoint[], segment: number): GroundPoint {
  const [ax, az] = points[segment]!
  const [bx, bz] = points[segment + 1]!
  const length = Math.hypot(bx - ax, bz - az)
  return length === 0 ? [0, 0] : [(bx - ax) / length, (bz - az) / length]
}

/** Where a point lies on a trench, if within the joint tolerance of its centre line: distance along and segments. */
function locateOn(points: readonly GroundPoint[], point: GroundPoint): { along: number; segments: number[] } | null {
  let start = 0
  let along: number | null = null
  const segments: number[] = []
  for (let segment = 0; segment + 1 < points.length; segment++) {
    const [ax, az] = points[segment]!
    const [bx, bz] = points[segment + 1]!
    const length = Math.hypot(bx - ax, bz - az)
    const projected = length === 0 ? 0 : ((point[0] - ax) * (bx - ax) + (point[1] - az) * (bz - az)) / length ** 2
    const t = Math.max(0, Math.min(1, projected))
    if (Math.hypot(ax + (bx - ax) * t - point[0], az + (bz - az) * t - point[1]) < JOINT_TOLERANCE) {
      along ??= start + t * length
      segments.push(segment)
    }
    start += length
  }
  return along === null ? null : { along, segments }
}

/** Interior points where a trench changes direction, warning about repeated points and turns that aren't square. */
function turnsOf(points: readonly GroundPoint[], warn: (at: GroundPoint, message: string) => void): Station[] {
  const turns: Station[] = []
  let along = 0
  for (let k = 1; k < points.length; k++) {
    const point = points[k]!
    const [ax, az] = direction(points, k - 1)
    const length = Math.hypot(point[0] - points[k - 1]![0], point[1] - points[k - 1]![1])
    along += length
    if (length < LENGTH_TOLERANCE) {
      warn(point, `point ${k} at ${describe(point)} repeats the point before it`)
      continue
    }
    if (k + 1 === points.length) {
      break
    }
    const [bx, bz] = direction(points, k)
    const cos = ax * bx + az * bz
    const sin = ax * bz - az * bx
    // A repeated next point gives no direction; it is reported on the next pass.
    if ((Math.abs(sin) < ANGLE_TOLERANCE && cos > 0) || (bx === 0 && bz === 0)) {
      continue
    }
    if (Math.abs(cos) >= ANGLE_TOLERANCE) {
      const degrees = Math.round(toDegrees(Math.acos(Math.max(-1, Math.min(1, cos)))))
      warn(point, `turns ${degrees}° at ${describe(point)}; the kit only turns at right angles`)
    }
    turns.push({ along, at: point, what: "turn" })
  }
  return turns
}

function lengthOf(points: readonly GroundPoint[]): number {
  let length = 0
  for (let k = 1; k < points.length; k++) {
    length += Math.hypot(points[k]![0] - points[k - 1]![0], points[k]![1] - points[k - 1]![1])
  }
  return length
}

/**
 * Checks trench lines against the trench kit's rules (`TRENCH_GRID`): turns are right angles, and every turn or
 * junction has at least `clearance` of straight trench either side, so two of them are at least twice that apart. A
 * trench ending on another makes a junction, which must meet it square.
 */
export function checkTrenchKit(trenches: readonly Trench[]): TrenchKitWarning[] {
  const warnings: TrenchKitWarning[] = []
  const stations = trenches.map((trench, index) =>
    turnsOf(trench.points, (at, message) => warnings.push({ trench: index, at, message }))
  )

  // Each end is free unless it lies on another trench, where both trenches get a junction.
  for (const [index, { points }] of trenches.entries()) {
    const ends = [
      { at: points[0]!, along: 0, toward: direction(points, 0) },
      { at: points.at(-1)!, along: lengthOf(points), toward: direction(points, points.length - 2) }
    ]
    for (const end of ends) {
      let joined = false
      for (const [hostIndex, host] of trenches.entries()) {
        const onHost = hostIndex === index ? null : locateOn(host.points, end.at)
        if (!onHost) {
          continue
        }
        joined = true
        stations[hostIndex]!.push({ along: onHost.along, at: end.at, what: "junction" })
        const square = onHost.segments.some((segment) => {
          const [hx, hz] = direction(host.points, segment)
          const cos = Math.abs(end.toward[0] * hx + end.toward[1] * hz)
          return cos < ANGLE_TOLERANCE || 1 - cos < ANGLE_TOLERANCE
        })
        if (!square) {
          warnings.push({
            trench: index,
            at: end.at,
            message: `meets trench ${hostIndex} at an angle at ${describe(end.at)}; the kit's junctions are square`
          })
        }
      }
      stations[index]!.push({ along: end.along, at: end.at, what: joined ? "junction" : "end" })
    }
  }

  for (const [index, list] of stations.entries()) {
    // Stations at the same place merge into the one needing the most room.
    const merged: Station[] = []
    for (const station of [...list].sort((a, b) => a.along - b.along)) {
      const last = merged.at(-1)
      if (last && station.along - last.along < LENGTH_TOLERANCE) {
        if (STATION_RANK[station.what] > STATION_RANK[last.what]) {
          merged[merged.length - 1] = station
        }
        continue
      }
      merged.push(station)
    }
    for (let k = 1; k < merged.length; k++) {
      const a = merged[k - 1]!
      const b = merged[k]!
      const needed = (a.what === "end" ? 0 : TRENCH_GRID.clearance) + (b.what === "end" ? 0 : TRENCH_GRID.clearance)
      const straight = b.along - a.along
      if (straight < needed - LENGTH_TOLERANCE) {
        warnings.push({
          trench: index,
          at: b.at,
          message:
            `only ${straight.toFixed(2)} m of straight trench between the ${a.what} at ${describe(a.at)} and the ` +
            `${b.what} at ${describe(b.at)}; the kit needs ${needed.toFixed(1)} m`
        })
      }
    }
  }
  return warnings
}
