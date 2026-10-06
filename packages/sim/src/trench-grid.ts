import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"

/** Soldiers within this distance of a trench's centre line are in it: on the floor or the fire step. */
const IN_TRENCH_RADIUS = 1.3

const trenchGrids = new WeakMap<BattlefieldMap, Uint8Array>()

/** A 1 m grid over the map marking cells inside a trench, built once per map: trenches don't move. */
function trenchGrid(map: BattlefieldMap): Uint8Array {
  const cached = trenchGrids.get(map)
  if (cached) {
    return cached
  }
  const columns = Math.ceil(mapWidth(map)) + 1
  const rows = Math.ceil(mapDepth(map)) + 1
  const grid = new Uint8Array(columns * rows)
  for (const trench of map.trenches) {
    for (let index = 1; index < trench.points.length; index++) {
      const [ax, az] = trench.points[index - 1] ?? [0, 0]
      const [bx, bz] = trench.points[index] ?? [0, 0]
      const minX = Math.max(0, Math.floor(Math.min(ax, bx) - IN_TRENCH_RADIUS))
      const maxX = Math.min(columns - 1, Math.ceil(Math.max(ax, bx) + IN_TRENCH_RADIUS))
      const minZ = Math.max(0, Math.floor(Math.min(az, bz) - IN_TRENCH_RADIUS))
      const maxZ = Math.min(rows - 1, Math.ceil(Math.max(az, bz) + IN_TRENCH_RADIUS))
      const dx = bx - ax
      const dz = bz - az
      const lengthSquared = dx * dx + dz * dz || 1
      for (let row = minZ; row <= maxZ; row++) {
        for (let column = minX; column <= maxX; column++) {
          // Cell centres, so a cell counts when the middle of it is in the trench.
          const px = column + 0.5
          const pz = row + 0.5
          const along = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSquared))
          const ox = ax + along * dx - px
          const oz = az + along * dz - pz
          if (ox * ox + oz * oz <= IN_TRENCH_RADIUS * IN_TRENCH_RADIUS) {
            grid[row * columns + column] = 1
          }
        }
      }
    }
  }
  trenchGrids.set(map, grid)
  return grid
}

/**
 * Whether a ground point is inside a trench. Apart from stance.ts, which re-exports it, so the soldier's body (body.ts)
 * can ask without importing the systems stance.ts does.
 */
export function isInTrench(map: BattlefieldMap, x: number, z: number): boolean {
  const columns = Math.ceil(mapWidth(map)) + 1
  const column = Math.floor(x)
  const row = Math.floor(z)
  if (column < 0 || row < 0 || column >= columns || row > Math.ceil(mapDepth(map))) {
    return false
  }
  return trenchGrid(map)[row * columns + column] === 1
}
