/** Deterministic pseudo-random value in [0, 1) for an integer lattice point. Identical on every JavaScript engine. */
export function latticeValue(seed: number, x: number, z: number): number {
  let hash = Math.imul(x, 374_761_393) ^ Math.imul(z, 668_265_263) ^ Math.imul(seed, 1_274_126_177)
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177)
  hash ^= hash >>> 16
  return (hash >>> 0) / 4_294_967_296
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Smooth value noise in [0, 1) with features roughly `scale` metres apart. */
export function valueNoise(seed: number, x: number, z: number, scale: number): number {
  const gridX = x / scale
  const gridZ = z / scale
  const x0 = Math.floor(gridX)
  const z0 = Math.floor(gridZ)
  const tx = smoothstep(gridX - x0)
  const tz = smoothstep(gridZ - z0)
  const near = latticeValue(seed, x0, z0) * (1 - tx) + latticeValue(seed, x0 + 1, z0) * tx
  const far = latticeValue(seed, x0, z0 + 1) * (1 - tx) + latticeValue(seed, x0 + 1, z0 + 1) * tx
  return near * (1 - tz) + far * tz
}
