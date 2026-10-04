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

/** A small, stable hash of a position, for picking variants without a random sequence: same input, same piece. */
export function hashOf(x: number, z: number, salt = 0): number {
  let hash = Math.imul(Math.round(x * 16) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(z * 16) + salt, 0xc2b2ae35)
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d)
  hash ^= hash >>> 12
  return (hash >>> 0) / 4_294_967_296
}
