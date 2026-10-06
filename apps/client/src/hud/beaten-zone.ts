import type { BeatenZone } from "@verdun/sim"

/**
 * The ground a fire mission's shells fall on, nine in ten of them, as the simulation works it out (`beatenZone`): a
 * point's fire in a circle, a line's in a box. Everything the HUD draws of fire comes from it, so the marks agree with
 * where the shells land.
 */

/** A zone grown by `by` metres all round: the margin a burst still kills in. */
export function grownZone(zone: BeatenZone, by: number): BeatenZone {
  return zone.kind === "circle"
    ? { ...zone, radius: zone.radius + by }
    : { ...zone, fromX: zone.fromX - by, toX: zone.toX + by, nearZ: zone.nearZ - by, farZ: zone.farZ + by }
}

/** A zone moved `x` metres east and `z` north: gas carried downwind. */
export function shiftedZone(zone: BeatenZone, x: number, z: number): BeatenZone {
  return zone.kind === "circle"
    ? { ...zone, x: zone.x + x, z: zone.z + z }
    : { ...zone, fromX: zone.fromX + x, toX: zone.toX + x, nearZ: zone.nearZ + z, farZ: zone.farZ + z }
}

/** Whether a point on the ground lies in a zone. */
export function inZone(zone: BeatenZone, x: number, z: number): boolean {
  return zone.kind === "circle"
    ? (x - zone.x) ** 2 + (z - zone.z) ** 2 <= zone.radius ** 2
    : x >= zone.fromX && x <= zone.toX && z >= zone.nearZ && z <= zone.farZ
}

/** A zone's extent east to west and north to south, and its middle. */
export function zoneSpan(zone: BeatenZone): {
  fromX: number
  toX: number
  nearZ: number
  farZ: number
  x: number
  z: number
} {
  if (zone.kind === "circle") {
    return {
      fromX: zone.x - zone.radius,
      toX: zone.x + zone.radius,
      nearZ: zone.z - zone.radius,
      farZ: zone.z + zone.radius,
      x: zone.x,
      z: zone.z
    }
  }
  return { ...zone, x: (zone.fromX + zone.toX) / 2, z: (zone.nearZ + zone.farZ) / 2 }
}

/** Points round a zone's edge on the ground, the first repeated at the end, no more than `step` metres apart. */
export function zoneEdge(zone: BeatenZone, step: number): (readonly [number, number])[] {
  if (zone.kind === "circle") {
    const count = Math.max(12, Math.ceil((2 * Math.PI * zone.radius) / step))
    return Array.from({ length: count + 1 }, (_, index) => {
      const bearing = (2 * Math.PI * index) / count
      return [zone.x + zone.radius * Math.cos(bearing), zone.z + zone.radius * Math.sin(bearing)] as const
    })
  }
  const corners: (readonly [number, number])[] = [
    [zone.fromX, zone.nearZ],
    [zone.toX, zone.nearZ],
    [zone.toX, zone.farZ],
    [zone.fromX, zone.farZ],
    [zone.fromX, zone.nearZ]
  ]
  const points: (readonly [number, number])[] = []
  for (let index = 0; index < corners.length - 1; index++) {
    const [ax, az] = corners[index] ?? [0, 0]
    const [bx, bz] = corners[index + 1] ?? [0, 0]
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step))
    for (let at = 0; at < steps; at++) {
      points.push([ax + ((bx - ax) * at) / steps, az + ((bz - az) * at) / steps])
    }
  }
  points.push(corners[0] ?? [0, 0])
  return points
}
