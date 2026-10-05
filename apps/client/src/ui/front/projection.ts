import type { LonLat } from "./front.ts"

/**
 * The war map's projection: kilometres east and south of a point in the middle of the front, with longitude shortened
 * for the latitude. Over the 450 km from the Yser to Switzerland that's within a few per cent of a true map, and keeps
 * the arithmetic plain.
 */
const ORIGIN: LonLat = [4.8, 49.35]
const KM_PER_DEGREE_LATITUDE = 110.6
const KM_PER_DEGREE_LONGITUDE = 111.3 * Math.cos((ORIGIN[1] * Math.PI) / 180)

/** A point on the map, in kilometres: x east, y south. */
export interface MapPoint {
  readonly x: number
  readonly y: number
}

export function project([lon, lat]: LonLat): MapPoint {
  return { x: (lon - ORIGIN[0]) * KM_PER_DEGREE_LONGITUDE, y: (ORIGIN[1] - lat) * KM_PER_DEGREE_LATITUDE }
}

/** A stretch of the map: its west and north edges, width and height, in kilometres. */
export interface MapBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** The box covering a stretch of longitude and latitude: west, south, east, north. */
export function boxOf([west, south, east, north]: readonly [number, number, number, number]): MapBox {
  const corner = project([west, north])
  const opposite = project([east, south])
  return { x: corner.x, y: corner.y, width: opposite.x - corner.x, height: opposite.y - corner.y }
}

/** A flat list of longitudes and latitudes as points. */
export function pointsOf(flat: readonly number[]): LonLat[] {
  const points: LonLat[] = []
  for (let index = 0; index + 1 < flat.length; index += 2) {
    points.push([flat[index]!, flat[index + 1]!])
  }
  return points
}

/** An SVG path through the points, to one place. */
export function pathOf(points: readonly MapPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("")
}

/**
 * The line drawn alongside another, `distance` to its right as you walk along it (negative for its left): how a front
 * walked north to south shows the French line on its western side and the German on its eastern. Corners take the mean
 * of the two segments' sides, so the parallel line keeps its distance round gentle bends.
 */
export function offsetLine(points: readonly MapPoint[], distance: number): MapPoint[] {
  const normals: MapPoint[] = []
  for (let index = 0; index + 1 < points.length; index++) {
    const from = points[index]!
    const to = points[index + 1]!
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1
    // With y pointing south, the right of a walker heading (dx, dy) is (-dy, dx).
    normals.push({ x: -(to.y - from.y) / length, y: (to.x - from.x) / length })
  }
  return points.map((point, index) => {
    const before = normals[index - 1] ?? normals[index]
    const after = normals[index] ?? normals[index - 1]
    if (!before || !after) {
      return point
    }
    const x = before.x + after.x
    const y = before.y + after.y
    const length = Math.hypot(x, y)
    if (length < 1e-6) {
      return { x: point.x + after.x * distance, y: point.y + after.y * distance }
    }
    // Lengthen the corner's offset so each segment stays `distance` away, up to twice over at sharp corners.
    const scale = Math.min(2, 2 / length) * distance
    return { x: point.x + (x / length) * scale, y: point.y + (y / length) * scale }
  })
}
