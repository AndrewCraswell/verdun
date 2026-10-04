import { type BattlefieldMap, sampleIndex } from "./format.ts"

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function sampleAt(map: BattlefieldMap, column: number, row: number): number {
  return map.heights[sampleIndex(map, column, row)] ?? 0
}

/** Terrain height at a world position, bilinearly interpolated. Positions outside the map clamp to its edge. */
export function heightAt(map: BattlefieldMap, x: number, z: number): number {
  const gridX = clamp(x / map.cellSize, 0, map.columns)
  const gridZ = clamp(z / map.cellSize, 0, map.rows)
  const column = Math.min(Math.floor(gridX), map.columns - 1)
  const row = Math.min(Math.floor(gridZ), map.rows - 1)
  const fractionX = gridX - column
  const fractionZ = gridZ - row

  const near = sampleAt(map, column, row) * (1 - fractionX) + sampleAt(map, column + 1, row) * fractionX
  const far = sampleAt(map, column, row + 1) * (1 - fractionX) + sampleAt(map, column + 1, row + 1) * fractionX
  return near * (1 - fractionZ) + far * fractionZ
}
