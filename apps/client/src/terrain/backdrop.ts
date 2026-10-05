import type { Material } from "@babylonjs/core/Materials/material"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, type Elevation, elevationAt, heightAt, mapDepth, mapWidth, valueNoise } from "@verdun/map"
import { SPLAT_ATTRIBUTE, WETNESS_ATTRIBUTE } from "./terrain-chunks.ts"

/** The surveyed ground round the sector, and where the sector sits in it. */
export interface Surroundings {
  /** Heights round the sector, in metres above `elevation.base`. */
  readonly elevation: Elevation
  /** Height above sea level the sector's own heights are measured from. */
  readonly sectorBase: number
  /** Where the sector's south-west corner lies in the surroundings, in metres from theirs. */
  readonly sectorOrigin: { readonly x: number; readonly z: number }
}

/** The backdrop draws a vertex every this many metres. */
const STEP = 10
/** Over this many metres outside the sector the backdrop eases from the sector's edge into the surveyed ground. */
const BLEND = 60
/** The backdrop runs this far under the sector's edge, so it never shows a gap beside it. */
const UNDERLAP = 0.25
/**
 * The front runs on east and west beyond the sector: shelled ground in a band either side of no man's land, its
 * middle at `middle` metres north of the sector's south edge, fading to the grass of the rear areas between `from` and
 * `to` metres from it.
 */
const FRONT = { middle: 200, from: 90, to: 260 } as const
const PATCH_SEED = 811
/** Woods behind the lines: patches where the noise runs above this, at least `clear` metres back from the front. */
const WOODS = { threshold: 0.58, clear: 240, spacing: 14 } as const

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Where trees stand on the backdrop: in woods behind the lines and dotted along the front, never in the sector. */
export function backdropTrees(map: BattlefieldMap, surroundings: Surroundings): { x: number; y: number; z: number }[] {
  const { elevation, sectorBase, sectorOrigin } = surroundings
  const width = elevation.columns * elevation.cellSize
  const depth = elevation.rows * elevation.cellSize
  const trees: { x: number; y: number; z: number }[] = []
  for (let gz = 0; gz < depth; gz += WOODS.spacing) {
    for (let gx = 0; gx < width; gx += WOODS.spacing) {
      const jitter = (salt: number) => (valueNoise(PATCH_SEED + salt, gx, gz, 1.3) - 0.5) * WOODS.spacing
      const x = gx + jitter(5) - sectorOrigin.x
      const z = gz + jitter(6) - sectorOrigin.z
      const inSector = x > -4 && z > -4 && x < mapWidth(map) + 4 && z < mapDepth(map) + 4
      const fromFront = Math.abs(z - FRONT.middle)
      const wood = valueNoise(PATCH_SEED + 2, x, z, 160) * smoothstep(WOODS.clear * 0.6, WOODS.clear * 1.6, fromFront)
      const scattered = valueNoise(PATCH_SEED + 3, x, z, 7) > 0.93
      if (inSector || (wood < WOODS.threshold && !scattered)) {
        continue
      }
      const y = elevation.base + elevationAt(elevation, x + sectorOrigin.x, z + sectorOrigin.z) - sectorBase
      trees.push({ x, y, z })
    }
  }
  return trees
}

/**
 * The backdrop's height at one of its vertices, at world (x, z). Next to the sector it eases from the sector's edge
 * into the survey; well inside the sector it sinks out of sight; on and near the edge it runs just under the sector's
 * own ground.
 */
function vertexHeight(map: BattlefieldMap, surroundings: Surroundings, x: number, z: number): number {
  const { elevation, sectorBase, sectorOrigin } = surroundings
  const edgeX = Math.min(mapWidth(map), Math.max(0, x))
  const edgeZ = Math.min(mapDepth(map), Math.max(0, z))
  const outside = Math.hypot(x - edgeX, z - edgeZ)
  const inset = Math.min(x, z, mapWidth(map) - x, mapDepth(map) - z)
  const edge = heightAt(map, edgeX, edgeZ) - UNDERLAP
  if (inset > STEP) {
    return edge - 6
  }
  const surveyed = elevation.base + elevationAt(elevation, x + sectorOrigin.x, z + sectorOrigin.z) - sectorBase
  return edge + (surveyed - edge) * smoothstep(0, BLEND, outside)
}

/**
 * The height of the backdrop's ground as drawn, at any world (x, z) it covers: between its vertices, across the
 * triangles it's drawn with, so what stands on it meets the ground the camera sees.
 */
export function backdropGround(map: BattlefieldMap, surroundings: Surroundings): (x: number, z: number) => number {
  const { elevation, sectorOrigin } = surroundings
  const columns = Math.floor((elevation.columns * elevation.cellSize) / STEP)
  const rows = Math.floor((elevation.rows * elevation.cellSize) / STEP)
  const corner = (column: number, row: number) =>
    vertexHeight(map, surroundings, column * STEP - sectorOrigin.x, row * STEP - sectorOrigin.z)
  return (x, z) => {
    const across = Math.min(columns, Math.max(0, (x + sectorOrigin.x) / STEP))
    const along = Math.min(rows, Math.max(0, (z + sectorOrigin.z) / STEP))
    const column = Math.min(columns - 1, Math.floor(across))
    const row = Math.min(rows - 1, Math.floor(along))
    const u = across - column
    const v = along - row
    const nearRight = corner(column + 1, row)
    const farLeft = corner(column, row + 1)
    // Each square is split from its near right corner to its far left one (see createBackdrop).
    if (u + v <= 1) {
      const nearLeft = corner(column, row)
      return nearLeft + u * (nearRight - nearLeft) + v * (farLeft - nearLeft)
    }
    const farRight = corner(column + 1, row + 1)
    return farRight + (1 - u) * (farLeft - farRight) + (1 - v) * (nearRight - farRight)
  }
}

/**
 * The ground round the sector, out to the horizon: the real hills and ravines round Fleury, from IGN's survey at a 5 m
 * grid, drawn every 10 m with the sector's own ground material. Next to the sector it eases from the sector's edge
 * heights into the survey, so the two meet without a step, and under the sector it sinks out of sight. Shelled earth
 * spreads a few hundred metres out, as it did round Verdun, and gives way to grass behind the lines. Fog does the rest.
 */
export function createBackdrop(
  scene: Scene,
  map: BattlefieldMap,
  surroundings: Surroundings,
  material: Material
): Mesh {
  const { elevation, sectorOrigin } = surroundings
  const width = elevation.columns * elevation.cellSize
  const depth = elevation.rows * elevation.cellSize
  const columns = Math.floor(width / STEP)
  const rows = Math.floor(depth / STEP)
  const count = (columns + 1) * (rows + 1)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 4)
  const uvs = new Float32Array(count * 2)
  const splat = new Float32Array(count * 4)
  const wetness = new Float32Array(count)

  let vertex = 0
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      // World position: the sector's south-west corner is the world's origin.
      const x = column * STEP - sectorOrigin.x
      const z = row * STEP - sectorOrigin.z
      positions.set([x, vertexHeight(map, surroundings, x, z), z], vertex * 3)
      uvs.set([x / 8, z / 8], vertex * 2)
      // Shelled along the front's line, grass returning behind it, in broken patches.
      const patch = valueNoise(PATCH_SEED, x, z, 90)
      const shelled = 1 - smoothstep(FRONT.from, FRONT.to, Math.abs(z - FRONT.middle) + (patch - 0.5) * 160)
      const grass = (1 - shelled) * (0.75 + 0.25 * patch)
      const mud = shelled * (0.35 + 0.3 * patch)
      const shade = 0.82 + 0.18 * valueNoise(PATCH_SEED + 1, x, z, 40)
      splat.set([grass, mud, 0, shade], vertex * 4)
      wetness[vertex] = 0
      colors.set([0.33 * shade, 0.29 * shade, 0.22 * shade, 1], vertex * 4)
      vertex += 1
    }
  }

  const indices = new Uint32Array(columns * rows * 6)
  let corner = 0
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const nearLeft = row * (columns + 1) + column
      const nearRight = nearLeft + 1
      const farLeft = nearLeft + columns + 1
      const farRight = farLeft + 1
      indices.set([nearRight, farRight, farLeft, nearLeft, nearRight, farLeft], corner)
      corner += 6
    }
  }
  const normals = new Float32Array(count * 3)
  VertexData.ComputeNormals(positions, indices, normals)

  const backdrop = new Mesh("backdrop", scene)
  const data = new VertexData()
  data.positions = positions
  data.indices = indices
  data.normals = normals
  data.uvs = uvs
  data.colors = colors
  data.applyToMesh(backdrop)
  backdrop.setVerticesData(SPLAT_ATTRIBUTE, splat, false, 4)
  backdrop.setVerticesData(WETNESS_ATTRIBUTE, wetness, false, 1)
  backdrop.material = material
  backdrop.isPickable = false
  backdrop.freezeWorldMatrix()
  return backdrop
}
