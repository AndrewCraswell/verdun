import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { Scene } from "@babylonjs/core/scene"

/**
 * The theatre: the ground round Verdun the editor's theatre view draws, in Lambert-93 (EPSG:2154) metres. Its local
 * frame puts the south-west corner at x 0, z 0, with z north and heights above `base`, as the sectors' frames do.
 */
export const THEATRE = { west: 860_000, south: 6_892_000, width: 26_000, depth: 23_000, base: 170 } as const
/** The ground is drawn in tiles this many metres square. */
const TILE = 1000

/** A map the ground can be drawn with: an IGN layer, and the image format it comes in. */
export interface BaseMap {
  readonly name: string
  readonly layer: string
  readonly format: "image/png" | "image/jpeg"
}

/**
 * The maps the theatre can be drawn with, all from IGN's Géoplateforme (Licence Ouverte 2.0, credit IGN): the country
 * before the war, after it, and now, and the bare ground itself.
 */
export const BASE_MAPS: readonly BaseMap[] = [
  { name: "Carte d'état-major, 1820–1866", layer: "GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40", format: "image/jpeg" },
  { name: "Cassini, 18th century", layer: "BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI", format: "image/jpeg" },
  { name: "SCAN 50, 1950", layer: "GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950", format: "image/jpeg" },
  { name: "Aerial photographs, 1950–1965", layer: "ORTHOIMAGERY.ORTHOPHOTOS.1950-1965", format: "image/jpeg" },
  { name: "Aerial photographs, today", layer: "HR.ORTHOIMAGERY.ORTHOPHOTOS", format: "image/jpeg" },
  { name: "Plan IGN, today", layer: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", format: "image/png" },
  { name: "LiDAR hillshade", layer: "IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW", format: "image/png" }
]

/** The bare-earth terrain models: LiDAR HD where it has been flown, RGE ALTI everywhere, to fill its gaps. */
const LIDAR = "IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93"
const RGE_ALTI = "ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES"

/** The coarse ground over the whole theatre, every `step` metres, and finer tiles near the camera. */
const COARSE = { step: 50, texture: 4096 } as const
const DETAIL = { samples: 129, texture: 1024, radius: 2600, maxLoads: 3 } as const
/** A fine tile is kept until it lies this much further off than the radius it's loaded within, so tiles near the edge
 * don't come and go as the view moves a little. */
const KEEP = 1.4
/** Each tile's edges hang this far down, so no crack shows where a fine tile meets a coarse one. */
const SKIRT = 25

/** A request to IGN's map service through the dev server's cache, for a box of the theatre in local metres. */
function wmsUrl(layer: string, format: string, x0: number, z0: number, x1: number, z1: number, w: number, h: number) {
  const bbox = [THEATRE.west + x0, THEATRE.south + z0, THEATRE.west + x1, THEATRE.south + z1].join(",")
  const query = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layer,
    STYLES: "",
    CRS: "EPSG:2154",
    BBOX: bbox,
    WIDTH: String(w),
    HEIGHT: String(h),
    FORMAT: format
  })
  return `/geo/wms?${query.toString()}`
}

/**
 * Heights on a grid of `samples` by `samples` corners over a box, south row first, metres above the theatre's base.
 * Samples sit on the box's corners, so the request reaches half a step beyond each edge.
 */
async function heightGrid(x0: number, z0: number, x1: number, z1: number, columns: number, rows: number) {
  const halfX = (x1 - x0) / (columns - 1) / 2
  const halfZ = (z1 - z0) / (rows - 1) / 2
  const fetchGrid = async (layer: string) => {
    const url = wmsUrl(layer, "image/x-bil;bits=32", x0 - halfX, z0 - halfZ, x1 + halfX, z1 + halfZ, columns, rows)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Elevation ${response.status}`)
    }
    return new Float32Array(await response.arrayBuffer())
  }
  const missing = (height: number | undefined) => height === undefined || !Number.isFinite(height) || height < -100
  let raw = await fetchGrid(LIDAR)
  if (raw.length !== columns * rows || raw.some(missing)) {
    const fallback = await fetchGrid(RGE_ALTI)
    raw =
      raw.length === columns * rows
        ? raw.map((height, index) => (missing(height) ? (fallback[index] ?? 0) : height))
        : fallback
  }
  // The image's first row is the north edge.
  const heights = new Float32Array(columns * rows)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      heights[row * columns + column] = (raw[(rows - 1 - row) * columns + column] ?? THEATRE.base) - THEATRE.base
    }
  }
  return heights
}

/** A grid mesh over a box, with skirts, its UVs spanning `uvBox` (the box of its texture). */
function gridMesh(
  scene: Scene,
  name: string,
  heights: (column: number, row: number) => number,
  box: { x0: number; z0: number; x1: number; z1: number },
  columns: number,
  rows: number,
  uvBox: { x0: number; z0: number; x1: number; z1: number }
): Mesh {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const vertex = (column: number, row: number, drop: number) => {
    const x = box.x0 + ((box.x1 - box.x0) * column) / (columns - 1)
    const z = box.z0 + ((box.z1 - box.z0) * row) / (rows - 1)
    positions.push(x, heights(column, row) - drop, z)
    uvs.push((x - uvBox.x0) / (uvBox.x1 - uvBox.x0), (z - uvBox.z0) / (uvBox.z1 - uvBox.z0))
    return positions.length / 3 - 1
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      vertex(column, row, 0)
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column
      indices.push(a, a + 1, a + columns, a + 1, a + columns + 1, a + columns)
    }
  }
  // Skirts along the four edges, hanging below them.
  const edge = (points: [number, number][]) => {
    for (let index = 1; index < points.length; index++) {
      const [ac, ar] = points[index - 1] ?? [0, 0]
      const [bc, br] = points[index] ?? [0, 0]
      const top = [ar * columns + ac, br * columns + bc]
      const low = [vertex(ac, ar, SKIRT), vertex(bc, br, SKIRT)]
      indices.push(top[0] ?? 0, low[0] ?? 0, top[1] ?? 0, top[1] ?? 0, low[0] ?? 0, low[1] ?? 0)
      indices.push(top[0] ?? 0, top[1] ?? 0, low[0] ?? 0, top[1] ?? 0, low[1] ?? 0, low[0] ?? 0)
    }
  }
  edge(Array.from({ length: columns }, (_, column) => [column, 0]))
  edge(Array.from({ length: columns }, (_, column) => [column, rows - 1]))
  edge(Array.from({ length: rows }, (_, row) => [0, row]))
  edge(Array.from({ length: rows }, (_, row) => [columns - 1, row]))
  const mesh = new Mesh(name, scene)
  const data = new VertexData()
  data.positions = positions
  data.uvs = uvs
  data.indices = indices
  const normals: number[] = []
  VertexData.ComputeNormals(positions, indices, normals)
  data.normals = normals
  data.applyToMesh(mesh)
  return mesh
}

function mapMaterial(scene: Scene, name: string, url: string): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  const texture = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE)
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  texture.anisotropicFilteringLevel = 8
  material.diffuseTexture = texture
  material.specularColor = Color3.Black()
  return material
}

export interface TheatreGround {
  /** The ground's height at a point, metres above the theatre's base, from the coarse grid. */
  heightAt(x: number, z: number): number
  /** Draws the ground with another map. */
  setBaseMap(map: BaseMap): void
  /** Called each frame with the point the camera looks at: loads finer tiles round it, drops those far off. */
  update(x: number, z: number): void
  /** How many fine tiles are drawn and loading, for the status line. */
  readonly detail: { readonly shown: number; readonly loading: number }
}

interface DetailTile {
  mesh: Mesh | null
  material: StandardMaterial | null
  loading: boolean
  /** The map it was textured with. */
  map: BaseMap
}

/**
 * The theatre's ground: the whole of it from a 50 m grid under one map texture, and 1 km tiles at about 8 m with a map
 * texture of their own near the camera, replacing the coarse ground beneath them. Heights and maps come from IGN
 * through the dev server's cache.
 */
export async function createTheatreGround(scene: Scene, initial: BaseMap): Promise<TheatreGround> {
  const columns = THEATRE.width / COARSE.step + 1
  const rows = THEATRE.depth / COARSE.step + 1
  const coarse = await heightGrid(0, 0, THEATRE.width, THEATRE.depth, columns, rows)
  const coarseAt = (column: number, row: number) =>
    coarse[Math.min(rows - 1, Math.max(0, row)) * columns + Math.min(columns - 1, Math.max(0, column))] ?? 0
  const heightAt = (x: number, z: number) => {
    const gx = Math.min(columns - 1, Math.max(0, x / COARSE.step))
    const gz = Math.min(rows - 1, Math.max(0, z / COARSE.step))
    const c = Math.floor(gx)
    const r = Math.floor(gz)
    const fx = gx - c
    const fz = gz - r
    const near = coarseAt(c, r) * (1 - fx) + coarseAt(c + 1, r) * fx
    const far = coarseAt(c, r + 1) * (1 - fx) + coarseAt(c + 1, r + 1) * fx
    return near * (1 - fz) + far * fz
  }

  let map = initial
  const whole = { x0: 0, z0: 0, x1: THEATRE.width, z1: THEATRE.depth }
  const coarseTexture = (base: BaseMap) =>
    wmsUrl(
      base.layer,
      base.format,
      0,
      0,
      THEATRE.width,
      THEATRE.depth,
      COARSE.texture,
      Math.round((COARSE.texture * THEATRE.depth) / THEATRE.width)
    )
  let coarseMaterial = mapMaterial(scene, "theatre-coarse", coarseTexture(map))
  const perTile = TILE / COARSE.step
  const tilesX = THEATRE.width / TILE
  const tilesZ = THEATRE.depth / TILE
  const coarseTiles: Mesh[] = []
  for (let tz = 0; tz < tilesZ; tz++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const mesh = gridMesh(
        scene,
        `theatre-coarse-${tx}-${tz}`,
        (column, row) => coarseAt(tx * perTile + column, tz * perTile + row),
        { x0: tx * TILE, z0: tz * TILE, x1: (tx + 1) * TILE, z1: (tz + 1) * TILE },
        perTile + 1,
        perTile + 1,
        whole
      )
      mesh.material = coarseMaterial
      mesh.isPickable = true
      coarseTiles.push(mesh)
    }
  }

  const details = new Map<number, DetailTile>()
  let loading = 0
  const load = (tx: number, tz: number, tile: DetailTile) => {
    tile.loading = true
    loading += 1
    const box = { x0: tx * TILE, z0: tz * TILE, x1: (tx + 1) * TILE, z1: (tz + 1) * TILE }
    const samples = DETAIL.samples
    heightGrid(box.x0, box.z0, box.x1, box.z1, samples, samples)
      .then((heights) => {
        tile.mesh?.dispose()
        tile.material?.dispose(true, true)
        tile.map = map
        tile.mesh = gridMesh(
          scene,
          `theatre-detail-${tx}-${tz}`,
          (column, row) => heights[row * samples + column] ?? 0,
          box,
          samples,
          samples,
          box
        )
        tile.material = mapMaterial(
          scene,
          `theatre-detail-${tx}-${tz}`,
          wmsUrl(map.layer, map.format, box.x0, box.z0, box.x1, box.z1, DETAIL.texture, DETAIL.texture)
        )
        tile.mesh.material = tile.material
        coarseTiles[tz * tilesX + tx]?.setEnabled(false)
      })
      .catch((error: unknown) => console.warn(`Theatre tile ${tx},${tz}:`, error))
      .finally(() => {
        tile.loading = false
        loading -= 1
      })
  }
  const drop = (key: number, tile: DetailTile) => {
    tile.mesh?.dispose()
    tile.material?.dispose(true, true)
    details.delete(key)
    coarseTiles[key]?.setEnabled(true)
  }

  return {
    heightAt,
    setBaseMap(next) {
      map = next
      coarseMaterial.dispose(true, true)
      coarseMaterial = mapMaterial(scene, "theatre-coarse", coarseTexture(map))
      for (const mesh of coarseTiles) {
        mesh.material = coarseMaterial
      }
    },
    update(x, z) {
      // The tiles wanted: those within reach of the point looked at, nearest first.
      const wanted: { key: number; tx: number; tz: number; distance: number }[] = []
      for (let tz = 0; tz < tilesZ; tz++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const distance = Math.hypot((tx + 0.5) * TILE - x, (tz + 0.5) * TILE - z)
          if (distance < DETAIL.radius) {
            wanted.push({ key: tz * tilesX + tx, tx, tz, distance })
          }
        }
      }
      wanted.sort((a, b) => a.distance - b.distance)
      for (const [key, tile] of details) {
        const tx = key % tilesX
        const tz = Math.floor(key / tilesX)
        const distance = Math.hypot((tx + 0.5) * TILE - x, (tz + 0.5) * TILE - z)
        if (distance > DETAIL.radius * KEEP && !tile.loading) {
          drop(key, tile)
        }
      }
      for (const { key, tx, tz } of wanted) {
        if (loading >= DETAIL.maxLoads) {
          break
        }
        const tile = details.get(key)
        if (!tile) {
          const fresh: DetailTile = { mesh: null, material: null, loading: false, map }
          details.set(key, fresh)
          load(tx, tz, fresh)
        } else if (!tile.loading && tile.map !== map) {
          load(tx, tz, tile)
        }
      }
    },
    get detail() {
      return { shown: [...details.values()].filter((tile) => tile.mesh).length, loading }
    }
  }
}
