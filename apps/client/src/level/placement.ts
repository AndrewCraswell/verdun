import { positionHash } from "@verdun/map"

/** One kit piece placed on the battlefield. */
export interface Placement {
  /** The kit piece's name. */
  readonly piece: string
  readonly x: number
  readonly y: number
  readonly z: number
  /** Turn about the vertical, in radians clockwise from +z seen from above: the piece's +z points this way. */
  readonly yaw: number
  /** Tilts the piece so its up axis points along this unit vector, after the turn. Upright when absent. */
  readonly up?: readonly [number, number, number]
  /** Scale along the piece's own axes, before turning. */
  readonly scale?: readonly [number, number, number]
}

/** Yaw that turns a piece's +z axis to point along a ground direction. */
export function yawAlong(dx: number, dz: number): number {
  return Math.atan2(dx, dz)
}

/** Up vector for a piece running along a ground direction (unit dx, dz) that rises `slope` metres per metre. */
export function upForSlope(dx: number, dz: number, slope: number): [number, number, number] {
  const length = Math.hypot(slope * dx, 1, slope * dz)
  return [(-slope * dx) / length, 1 / length, (-slope * dz) / length]
}

/**
 * A small, stable hash of a position, for picking variants without a random sequence: same input, same piece. The
 * map's, so the art and the simulation agree where it decides something both see (a belt's tangles, say).
 */
export const hashOf = positionHash
