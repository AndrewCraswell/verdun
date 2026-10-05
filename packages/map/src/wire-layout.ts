import type { WireBelt } from "./scenery.ts"

/** A small, stable hash of a position, for picking variants without a random sequence: same input, same result. */
export function positionHash(x: number, z: number, salt = 0): number {
  let hash = Math.imul(Math.round(x * 16) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(z * 16) + salt, 0xc2b2ae35)
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d)
  hash ^= hash >>> 12
  return (hash >>> 0) / 4_294_967_296
}

/** A staked fence runs along a belt's line in lengths of about this many metres. */
const FENCE_LENGTH = 10.06
/** About this share of the fence's lengths have a tangle of loose coils thrown down beside them. */
const TANGLED_SHARE = 0.7
/** A tangle lies this far in front of or behind the fence's line, in metres. */
const TANGLE_OFFSET = 1.6

/** One length of a belt's staked fence: its middle, the way it runs (a unit vector) and how long it is, in metres. */
export interface FenceLength {
  readonly x: number
  readonly z: number
  readonly dx: number
  readonly dz: number
  readonly length: number
}

/** A tangle of loose coils beside a belt's fence: where it lies, and the way the fence runs there (a unit vector). */
export interface WireTangle {
  readonly x: number
  readonly z: number
  readonly dx: number
  readonly dz: number
}

/**
 * How a belt of wire stands: a staked fence along its line in lengths of about 10 m, and beside most lengths a tangle of
 * loose coils, in front or behind. The level's art draws the same layout (apps/client's scenery dressing). Nobody climbs
 * it: barbed wire is waded, cut or gone round.
 */
export function beltLayout(belt: WireBelt): { readonly fences: FenceLength[]; readonly tangles: WireTangle[] } {
  const fences: FenceLength[] = []
  const tangles: WireTangle[] = []
  for (let index = 1; index < belt.points.length; index++) {
    const [ax, az] = belt.points[index - 1] ?? [0, 0]
    const [bx, bz] = belt.points[index] ?? [0, 0]
    const length = Math.hypot(bx - ax, bz - az)
    if (!(length > 0)) {
      continue
    }
    const dx = (bx - ax) / length
    const dz = (bz - az) / length
    const count = Math.max(1, Math.round(length / FENCE_LENGTH))
    for (let piece = 0; piece < count; piece++) {
      const from = (piece * length) / count
      const to = ((piece + 1) * length) / count
      const x = ax + dx * ((from + to) / 2)
      const z = az + dz * ((from + to) / 2)
      fences.push({ x, z, dx, dz, length: to - from })
      if (positionHash(x, z, 3) < TANGLED_SHARE) {
        const side = positionHash(x, z, 4) < 0.5 ? -1 : 1
        tangles.push({ x: x - dz * side * TANGLE_OFFSET, z: z + dx * side * TANGLE_OFFSET, dx, dz })
      }
    }
  }
  return { fences, tangles }
}
