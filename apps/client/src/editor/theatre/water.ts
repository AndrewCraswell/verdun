import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture"
import type { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { Scene } from "@babylonjs/core/scene"
import { THEATRE } from "./ground.ts"

/** BD TOPO's kinds of water that were there in 1916: rivers, canals, ponds and marsh, not the reservoirs and pits since. */
const WATER_THEN = new Set(["Ecoulement naturel", "Canal", "Mare", "Marais"])
/** The rivers are drawn this many pixels to the theatre's width. */
const PIXELS = 4096
const WATER_COLOUR = "rgba(70, 170, 255, 1)"

type Ring = readonly (readonly number[])[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** A request for one of BD TOPO's layers over the theatre, through the dev server's cache. */
function featuresUrl(typeName: string): string {
  const box = [THEATRE.west, THEATRE.south, THEATRE.west + THEATRE.width, THEATRE.south + THEATRE.depth]
  const query = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: typeName,
    SRSNAME: "EPSG:2154",
    BBOX: `${box.join(",")},EPSG:2154`,
    OUTPUTFORMAT: "application/json",
    COUNT: "10000"
  })
  return `/geo/wfs?${query.toString()}`
}

/** The features of a BD TOPO layer of the nature wanted, as their geometries' rings or lines, in Lambert-93. */
async function features(typeName: string): Promise<{ polygons: Ring[][]; lines: Ring[] }> {
  const response = await fetch(featuresUrl(typeName))
  if (!response.ok) {
    throw new Error(`BD TOPO ${typeName}: ${response.status}`)
  }
  const body: unknown = await response.json()
  const list = isRecord(body) && Array.isArray(body.features) ? body.features : []
  const polygons: Ring[][] = []
  const lines: Ring[] = []
  for (const feature of list) {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) {
      continue
    }
    const { nature } = feature.properties
    const { type, coordinates } = feature.geometry
    if (typeof nature !== "string" || !WATER_THEN.has(nature) || !Array.isArray(coordinates)) {
      continue
    }
    if (type === "Polygon") {
      polygons.push(coordinates)
    } else if (type === "MultiPolygon") {
      polygons.push(...coordinates)
    } else if (type === "LineString") {
      lines.push(coordinates)
    } else if (type === "MultiLineString") {
      lines.push(...coordinates)
    }
  }
  return { polygons, lines }
}

/**
 * The rivers, canals, ponds and marsh of the theatre from IGN's BD TOPO, drawn bright on a transparent image of the
 * whole theatre, to lay over its ground: the Meuse and its canal, and the streams in the ravines either side.
 */
export async function createWaterTexture(scene: Scene): Promise<Texture> {
  const [surfaces, streams] = await Promise.all([
    features("BDTOPO_V3:surface_hydrographique"),
    features("BDTOPO_V3:troncon_hydrographique")
  ])
  const width = PIXELS
  const height = Math.round((PIXELS * THEATRE.depth) / THEATRE.width)
  const texture = new DynamicTexture("theatre-water", { width, height }, scene, true)
  texture.hasAlpha = true
  const context = texture.getContext()
  context.clearRect(0, 0, width, height)
  const scale = width / THEATRE.width
  const at = (point: readonly number[]): [number, number] => [
    ((point[0] ?? 0) - THEATRE.west) * scale,
    height - ((point[1] ?? 0) - THEATRE.south) * scale
  ]
  const trace = (ring: Ring) => {
    ring.forEach((point, index) => {
      const [x, y] = at(point)
      if (index === 0) {
        context.moveTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    })
  }
  context.fillStyle = WATER_COLOUR
  context.strokeStyle = WATER_COLOUR
  for (const polygon of surfaces.polygons) {
    context.beginPath()
    for (const ring of polygon) {
      trace(ring)
      context.closePath()
    }
    context.fill()
  }
  context.lineWidth = 2.5
  context.lineJoin = "round"
  for (const line of streams.lines) {
    context.beginPath()
    trace(line)
    context.stroke()
  }
  texture.update(true)
  return texture
}
