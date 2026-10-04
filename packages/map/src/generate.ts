import { type BattlefieldMap, createFlatMap, mapDepth, sampleIndex, Surface } from "./format.ts"
import { valueNoise } from "./noise.ts"

export interface RollingTerrainOptions {
  readonly name: string
  readonly widthMeters: number
  readonly depthMeters: number
  readonly cellSize: number
  readonly seed: number
  /** Peak-to-trough scale of the largest hills, in metres. */
  readonly amplitude: number
  /**
   * The band of no man's land between the lines, as fractions of the map depth. Ground there is churned by shellfire.
   * Defaults to the middle 40% of the map.
   */
  readonly noMansLand?: { readonly from: number; readonly to: number }
}

const OCTAVES = [
  { scale: 160, weight: 1 },
  { scale: 48, weight: 0.3 },
  { scale: 12, weight: 0.08 }
] as const

const TOTAL_WEIGHT = OCTAVES.reduce((sum, octave) => sum + octave.weight, 0)

/** Seed offsets keep the surface noise independent of the height noise. */
const SURFACE_SEED = 7_919
const EDGE_SEED = 104_729

function heightNoise(seed: number, x: number, z: number): number {
  let height = 0
  for (const [octaveIndex, octave] of OCTAVES.entries()) {
    height += valueNoise(seed + octaveIndex, x, z, octave.scale) * octave.weight
  }
  return height / TOTAL_WEIGHT
}

/**
 * Picks a surface from where a sample sits: churned ground in no man's land (with a ragged edge), chalk showing on
 * rises, mud in hollows, grass elsewhere behind the lines.
 */
function chooseSurface(
  seed: number,
  x: number,
  z: number,
  relativeHeight: number,
  noMansLand: { from: number; to: number }
): Surface {
  // Up to 6 m either way, so the edge of the shelled ground isn't a straight line.
  const ragged = (valueNoise(seed + EDGE_SEED, x, z, 18) - 0.5) * 12
  if (z > noMansLand.from + ragged && z < noMansLand.to - ragged) {
    return valueNoise(seed + SURFACE_SEED, x, z, 9) > 0.72 ? Surface.Mud : Surface.Churned
  }
  const patch = valueNoise(seed + SURFACE_SEED, x, z, 24)
  if (relativeHeight > 0.62 && patch > 0.45) {
    return Surface.Chalk
  }
  if (relativeHeight < 0.38 || patch < 0.22) {
    return Surface.Mud
  }
  return Surface.Grass
}

/** Gently rolling farmland torn up between the lines: a stand-in for real elevation data until it is imported. */
export function generateRollingTerrain(options: RollingTerrainOptions): BattlefieldMap {
  const { name, widthMeters, depthMeters, cellSize, seed, amplitude, noMansLand = { from: 0.3, to: 0.7 } } = options
  const map = createFlatMap({
    name,
    cellSize,
    columns: Math.round(widthMeters / cellSize),
    rows: Math.round(depthMeters / cellSize)
  })
  const depth = mapDepth(map)
  const band = { from: noMansLand.from * depth, to: noMansLand.to * depth }

  for (let row = 0; row <= map.rows; row++) {
    for (let column = 0; column <= map.columns; column++) {
      const x = column * cellSize
      const z = row * cellSize
      const relativeHeight = heightNoise(seed, x, z)
      const index = sampleIndex(map, column, row)
      map.heights[index] = relativeHeight * amplitude
      map.surfaces[index] = chooseSurface(seed, x, z, relativeHeight, band)
    }
  }
  return map
}
