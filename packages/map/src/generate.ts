import { type BattlefieldMap, createFlatMap, sampleIndex } from "./format.ts"

export interface RollingTerrainOptions {
  readonly name: string
  readonly widthMeters: number
  readonly depthMeters: number
  readonly cellSize: number
  readonly seed: number
  /** Peak-to-trough scale of the largest hills, in metres. */
  readonly amplitude: number
}

/** Deterministic pseudo-random value in [0, 1) for an integer lattice point. */
function latticeValue(seed: number, x: number, z: number): number {
  let hash = Math.imul(x, 374_761_393) ^ Math.imul(z, 668_265_263) ^ Math.imul(seed, 1_274_126_177)
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177)
  hash ^= hash >>> 16
  return (hash >>> 0) / 4_294_967_296
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Smooth value noise in [0, 1) with features roughly `scale` metres apart. */
function valueNoise(seed: number, x: number, z: number, scale: number): number {
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

const OCTAVES = [
  { scale: 160, weight: 1 },
  { scale: 48, weight: 0.3 },
  { scale: 12, weight: 0.08 }
] as const

const TOTAL_WEIGHT = OCTAVES.reduce((sum, octave) => sum + octave.weight, 0)

/** Gently rolling farmland: a stand-in for real elevation data until it is imported. */
export function generateRollingTerrain(options: RollingTerrainOptions): BattlefieldMap {
  const { name, widthMeters, depthMeters, cellSize, seed, amplitude } = options
  const map = createFlatMap({
    name,
    cellSize,
    columns: Math.round(widthMeters / cellSize),
    rows: Math.round(depthMeters / cellSize)
  })

  for (let row = 0; row <= map.rows; row++) {
    for (let column = 0; column <= map.columns; column++) {
      const x = column * cellSize
      const z = row * cellSize
      let height = 0
      for (const [octaveIndex, octave] of OCTAVES.entries()) {
        height += valueNoise(seed + octaveIndex, x, z, octave.scale) * octave.weight
      }
      map.heights[sampleIndex(map, column, row)] = (height / TOTAL_WEIGHT) * amplitude
    }
  }
  return map
}
