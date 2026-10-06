import type { Camera } from "@babylonjs/core/Cameras/camera"
import { BoundingBox } from "@babylonjs/core/Culling/boundingBox"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Frustum } from "@babylonjs/core/Maths/math.frustum"
import type { Plane } from "@babylonjs/core/Maths/math.plane"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import { type GroundBox, NO_BOX, SectorHolePlugin } from "./sector-hole.ts"
import type { TileBox } from "./tile-mesh.ts"
import { createTileThread } from "./tile-thread.ts"

/**
 * The theatre: the ground round Verdun the editor's theatre view draws, in Lambert-93 (EPSG:2154) metres: the whole
 * front the French Second Army held in 1916, from the Argonne by Vauquois across both banks of the Meuse, and down the
 * Côtes de Meuse past Les Éparges to Mouilly. Its local frame puts the south-west corner at x 0, z 0, with z north and
 * heights above `base`, as the sectors' frames do.
 */
export const THEATRE = { west: 846_000, south: 6_880_000, width: 50_000, depth: 38_000, base: 170 } as const

/** The ground is drawn in tiles this many metres square. */
const TILE = 1000

/** A map the ground can be drawn with: an IGN layer, and the image format it comes in. */
export interface BaseMap {
  readonly name: string
  readonly layer: string
  readonly format: "image/png" | "image/jpeg"
  /** A colour the map is multiplied by: the plain terrain is the hillshade, tinted the colour of the ground. */
  readonly tint?: readonly [number, number, number]
}

/**
 * The ground's hillshade: LiDAR HD's, over RGE ALTI's where LiDAR HD hasn't been flown, so no hole shows. IGN draws the
 * layers named one over the other.
 */
const HILLSHADE = "ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW,IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW"

/** The ground as the land lies, without a map on it: the LiDAR hillshade in the colours of the earth. */
export const TERRAIN: BaseMap = {
  name: "Terrain",
  layer: HILLSHADE,
  format: "image/png",
  tint: [0.66, 0.6, 0.47]
}

/**
 * The maps the theatre can be drawn with, all from IGN's Géoplateforme (Licence Ouverte 2.0, credit IGN): the country
 * before the war, after it, and now, and the bare ground itself.
 */
export const BASE_MAPS: readonly BaseMap[] = [
  { name: "Carte d'état-major, 1820–1866", layer: "GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40", format: "image/jpeg" },
  { name: "Cassini, 18th century", layer: "BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI", format: "image/jpeg" },
  { name: "SCAN 50, 1950", layer: "GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950", format: "image/jpeg" },
  // IGN serves these with a transparency band, as PNG only.
  { name: "Aerial photographs, 1950–1965", layer: "ORTHOIMAGERY.ORTHOPHOTOS.1950-1965", format: "image/png" },
  { name: "Aerial photographs, today", layer: "HR.ORTHOIMAGERY.ORTHOPHOTOS", format: "image/jpeg" },
  { name: "Plan IGN, today", layer: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", format: "image/png" },
  { name: "LiDAR hillshade", layer: HILLSHADE, format: "image/png" }
]

/** The bare-earth terrain models: LiDAR HD where it has been flown, RGE ALTI everywhere, to fill its gaps. */
const LIDAR = "IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93"
const RGE_ALTI = "ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES"

/** The coarse ground over the whole theatre, every `step` metres, under one map. */
const COARSE = { step: 50, texture: 4096 } as const
/**
 * The finer ground, a 1 km block at a time, in place of the coarse ground there: the LiDAR at about 4 m in one tile
 * with a map at a metre a pixel, or at 1 m in sixteen tiles of 250 m with maps at half a metre a pixel. A block is drawn
 * at the finest it has within `range` metres of the camera (its height above the ground counted in), loaded only while
 * it's in view, `together` tiles at a time, at most `maxLoads` blocks at once and `cap` blocks held.
 */
const LEVELS = {
  fine: { size: 250, samples: 251, texture: 512, range: 1100, cap: 6, together: 4, maxLoads: 2 },
  detail: { size: 1000, samples: 257, texture: 1024, range: 8000, cap: 48, together: 1, maxLoads: 3 }
} as const
type Level = keyof typeof LEVELS
/** Finest first: a block shows the finest of its levels that has come. */
const BY_FINENESS: readonly Level[] = ["fine", "detail"]
/** A block that failed to load is asked for again after this many milliseconds. */
const RETRY_AFTER = 8000
/** A block is kept until it lies this much further off than the range it's loaded within, so blocks near the edge
 * don't come and go as the view moves a little. */
const KEEP = 1.3
/** The blocks wanted are worked out at most this often, in milliseconds. */
const PLAN_EVERY = 150
/** A block counts as in view when it's within this many metres of the edge of the picture, so it's there on turning. */
const VIEW_MARGIN = 150
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
    // One style, the default, for each layer named.
    STYLES: layer
      .split(",")
      .map(() => "")
      .join(","),
    CRS: "EPSG:2154",
    BBOX: bbox,
    WIDTH: String(w),
    HEIGHT: String(h),
    FORMAT: format
  })
  return `/geo/wms?${query.toString()}`
}

/** A map's image of a box given in Lambert-93 metres, `width` by `height` pixels, north at the top. */
export function mapImageUrl(
  base: BaseMap,
  box: { readonly west: number; readonly south: number; readonly east: number; readonly north: number },
  width: number,
  height: number
): string {
  return wmsUrl(
    base.layer,
    base.format,
    box.west - THEATRE.west,
    box.south - THEATRE.south,
    box.east - THEATRE.west,
    box.north - THEATRE.south,
    width,
    height
  )
}

/**
 * Heights on a grid of `samples` by `samples` corners over a box, south row first, metres above the theatre's base.
 * Samples sit on the box's corners, so the request reaches half a step beyond each edge.
 */
async function heightGrid(x0: number, z0: number, x1: number, z1: number, columns: number, rows: number) {
  const fetchGrid = async (layer: string) => {
    const response = await fetch(elevationUrl(layer, { x0, z0, x1, z1 }, columns, rows))
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

/** A request for `columns` by `rows` heights on a box's corners: it reaches half a step beyond each edge. */
function elevationUrl(layer: string, box: TileBox, columns: number, rows: number) {
  const halfX = (box.x1 - box.x0) / (columns - 1) / 2
  const halfZ = (box.z1 - box.z0) / (rows - 1) / 2
  const { x0, z0, x1, z1 } = box
  return wmsUrl(layer, "image/x-bil;bits=32", x0 - halfX, z0 - halfZ, x1 + halfX, z1 + halfZ, columns, rows)
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

/** A material drawing a map's image, and when the image has come: until then a mesh with it would draw white. */
function mapMaterial(
  scene: Scene,
  name: string,
  url: string,
  base: BaseMap,
  holes: (() => readonly [GroundBox, GroundBox]) | null,
  shade: string | null
): { material: StandardMaterial; loaded: Promise<void> } {
  const material = new StandardMaterial(name, scene)
  // The hillshade multiplied into the map, so slopes and valleys read on any map, as on a shaded relief map.
  if (shade) {
    const relief = new Texture(shade, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE)
    relief.wrapU = Texture.CLAMP_ADDRESSMODE
    relief.wrapV = Texture.CLAMP_ADDRESSMODE
    material.lightmapTexture = relief
    material.useLightmapAsShadowmap = true
  }
  if (holes) {
    // The plugin registers itself with the material; kept with it for the console's sake.
    material.metadata = { holes: new SectorHolePlugin(material, holes) }
  }
  if (base.tint) {
    material.diffuseColor = new Color3(...base.tint)
  }
  const loaded = new Promise<void>((resolve, reject) => {
    const texture = new Texture(
      url,
      scene,
      false,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => resolve(),
      () => reject(new Error(`Couldn't load ${url}`))
    )
    texture.wrapU = Texture.CLAMP_ADDRESSMODE
    texture.wrapV = Texture.CLAMP_ADDRESSMODE
    texture.anisotropicFilteringLevel = 8
    material.diffuseTexture = texture
  })
  material.specularColor = Color3.Black()
  return { material, loaded }
}

export interface TheatreGround {
  /** The ground's height at a point, metres above the theatre's base, from the coarse grid. */
  heightAt(x: number, z: number): number
  /** Draws the ground with another map. */
  setBaseMap(map: BaseMap): void
  /** Leaves the hole for the sector, or fills it with the theatre's own ground when the sector is hidden. */
  setHole(cut: boolean): void
  /** Multiplies the hillshade into the map, or stops. */
  setShading(shaded: boolean): void
  /** Called each frame: loads finer ground in view near the camera, and drops what's far off or long out of view. */
  update(camera: Camera): void
  /**
   * Lays an image of the whole theatre over its ground, unlit, `lift` metres above it, such as the rivers: transparent
   * where the image is. Returns the mesh, to show and hide.
   */
  drape(name: string, image: BaseTexture, lift: number): Mesh
  /** How many blocks are drawn at 4 m and at 1 m, and how many are loading, for inspecting from the console. */
  readonly detail: { readonly detail: number; readonly fine: number; readonly loading: number }
}

/** A block's ground at one level: its tiles' meshes and maps, shown once all have come. */
interface Layer {
  readonly look: string
  readonly meshes: Mesh[]
  readonly materials: StandardMaterial[]
  cancelled: boolean
}

/** A 1 km block of the theatre, and the finer ground it has. */
interface Block {
  readonly key: number
  readonly box: TileBox
  /** Its lowest and highest ground, metres above the theatre's base, to tell whether it's in view. */
  readonly low: number
  readonly high: number
  readonly shown: Map<Level, Layer>
  readonly loading: Map<Level, Layer>
  /** When it last failed to load, by performance.now(), or 0. */
  failedAt: number
  /** How far it lies from the camera, and whether it's in view, as of the last plan. */
  distance: number
  seen: boolean
}

/**
 * The theatre's ground: the whole of it from a 50 m grid under one map texture, and 1 km tiles at about 8 m with a map
 * texture of their own near the camera, replacing the coarse ground beneath them. Heights and maps come from IGN
 * through the dev server's cache.
 */
export interface TheatreGroundOptions {
  /** What the ground is drawn under, placing the theatre's frame in the scene's. */
  readonly parent?: TransformNode
  /** Where the sector being edited is drawn, in the scene's metres: the theatre leaves a hole for it. */
  readonly hole?: GroundBox
}

export async function createTheatreGround(
  scene: Scene,
  initial: BaseMap,
  { parent, hole = undefined }: TheatreGroundOptions = {}
): Promise<TheatreGround> {
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

  // The detail and 1 m tiles are fetched and built in a worker, so the page keeps drawing while they come.
  const tileThread = createTileThread()
  const tileMesh = (name: string, box: TileBox, samples: number) =>
    tileThread.build(scene, name, {
      box,
      samples,
      lidarUrl: elevationUrl(LIDAR, box, samples, samples),
      fallbackUrl: elevationUrl(RGE_ALTI, box, samples, samples),
      base: THEATRE.base,
      skirt: SKIRT
    })

  let cutting = true
  const holes = (): readonly [GroundBox, GroundBox] => [cutting && hole ? hole : NO_BOX, NO_BOX]

  let map = initial
  let shaded = false
  const look = () => `${map.name}${shaded ? " shaded" : ""}`
  /** The hillshade over a box of the theatre, when shading, to multiply into the map. */
  const shadeUrl = (x0: number, z0: number, x1: number, z1: number, w: number, h: number) =>
    shaded && map !== TERRAIN && map.layer !== HILLSHADE ? wmsUrl(HILLSHADE, "image/png", x0, z0, x1, z1, w, h) : null
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
  const coarseShade = () =>
    shadeUrl(
      0,
      0,
      THEATRE.width,
      THEATRE.depth,
      COARSE.texture,
      Math.round((COARSE.texture * THEATRE.depth) / THEATRE.width)
    )
  let coarseMaterial = mapMaterial(scene, "theatre-coarse", coarseTexture(map), map, holes, coarseShade()).material
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
      mesh.parent = parent ?? null
      mesh.isPickable = true
      coarseTiles.push(mesh)
    }
  }

  const redrawCoarse = () => {
    coarseMaterial.dispose(true, true)
    coarseMaterial = mapMaterial(scene, "theatre-coarse", coarseTexture(map), map, holes, coarseShade()).material
    for (const mesh of coarseTiles) {
      mesh.material = coarseMaterial
    }
  }

  const blocks: Block[] = []
  for (let tz = 0; tz < tilesZ; tz++) {
    for (let tx = 0; tx < tilesX; tx++) {
      let low = Infinity
      let high = -Infinity
      for (let row = tz * perTile; row <= (tz + 1) * perTile; row++) {
        for (let column = tx * perTile; column <= (tx + 1) * perTile; column++) {
          low = Math.min(low, coarseAt(column, row))
          high = Math.max(high, coarseAt(column, row))
        }
      }
      blocks.push({
        key: tz * tilesX + tx,
        box: { x0: tx * TILE, z0: tz * TILE, x1: (tx + 1) * TILE, z1: (tz + 1) * TILE },
        low,
        high,
        shown: new Map(),
        loading: new Map(),
        failedAt: 0,
        distance: Infinity,
        seen: false
      })
    }
  }
  const loadingCount: Record<Level, number> = { fine: 0, detail: 0 }

  const disposeLayer = (layer: Layer) => {
    for (const mesh of layer.meshes) {
      mesh.dispose()
    }
    for (const material of layer.materials) {
      material.dispose(true, true)
    }
  }
  /** Draws a block at the finest level it has, and the coarse ground there only when it has none. */
  const show = (block: Block) => {
    const finest = BY_FINENESS.map((level) => block.shown.get(level)).find((layer) => layer !== undefined)
    for (const layer of block.shown.values()) {
      for (const mesh of layer.meshes) {
        mesh.setEnabled(layer === finest)
      }
    }
    coarseTiles[block.key]?.setEnabled(finest === undefined)
  }
  const drop = (block: Block, level: Level) => {
    const layer = block.shown.get(level)
    if (layer) {
      disposeLayer(layer)
      block.shown.delete(level)
      show(block)
    }
    const loading = block.loading.get(level)
    if (loading) {
      loading.cancelled = true
    }
  }
  /** Loads a block's tiles at a level, and shows them once all have come, in place of what was drawn there. */
  const load = (block: Block, level: Level) => {
    const { size, samples, texture, together } = LEVELS[level]
    const drawn = map
    const layer: Layer = { look: look(), meshes: [], materials: [], cancelled: false }
    block.loading.set(level, layer)
    loadingCount[level] += 1
    const boxes: TileBox[] = []
    for (let z0 = block.box.z0; z0 < block.box.z1; z0 += size) {
      for (let x0 = block.box.x0; x0 < block.box.x1; x0 += size) {
        boxes.push({ x0, z0, x1: x0 + size, z1: z0 + size })
      }
    }
    const loadTile = async (box: TileBox) => {
      const name = `theatre-${level}-${box.x0}-${box.z0}`
      const mesh = await tileMesh(name, box, samples)
      mesh.setEnabled(false)
      mesh.parent = parent ?? null
      const { material, loaded } = mapMaterial(
        scene,
        name,
        wmsUrl(drawn.layer, drawn.format, box.x0, box.z0, box.x1, box.z1, texture, texture),
        drawn,
        holes,
        shadeUrl(box.x0, box.z0, box.x1, box.z1, texture, texture)
      )
      mesh.material = material
      layer.meshes.push(mesh)
      layer.materials.push(material)
      await loaded
    }
    const next = async (): Promise<void> => {
      const box = boxes.shift()
      if (!box || layer.cancelled) {
        return
      }
      await loadTile(box)
      return next()
    }
    Promise.all(Array.from({ length: together }, next))
      .then(() => {
        if (layer.cancelled) {
          disposeLayer(layer)
          return
        }
        // Every tile has come: the block is drawn from them, in place of what was there.
        const old = block.shown.get(level)
        if (old) {
          disposeLayer(old)
        }
        block.shown.set(level, layer)
        block.failedAt = 0
        show(block)
      })
      .catch((error: unknown) => {
        block.failedAt = performance.now()
        disposeLayer(layer)
        console.warn(`Theatre ground ${block.key} at ${level}, trying again shortly:`, error)
      })
      .finally(() => {
        block.loading.delete(level)
        loadingCount[level] -= 1
      })
  }

  // Where the camera is, and which blocks it sees, in the theatre's frame.
  let nextPlan = 0
  const toLocal = new Matrix()
  const planes: Plane[] = Frustum.GetPlanes(Matrix.Identity())
  const corners = Array.from({ length: 8 }, () => new Vector3())
  const inView = (block: Block, toWorld: Matrix) => {
    const { x0, z0, x1, z1 } = block.box
    for (let index = 0; index < 8; index++) {
      const corner = corners[index]
      if (corner) {
        Vector3.TransformCoordinatesFromFloatsToRef(
          index & 1 ? x1 + VIEW_MARGIN : x0 - VIEW_MARGIN,
          index & 2 ? block.high + VIEW_MARGIN : block.low - SKIRT,
          index & 4 ? z1 + VIEW_MARGIN : z0 - VIEW_MARGIN,
          toWorld,
          corner
        )
      }
    }
    return BoundingBox.IsInFrustum(corners, planes)
  }
  const plan = (camera: Camera) => {
    const toWorld = parent?.getWorldMatrix() ?? Matrix.Identity()
    toWorld.invertToRef(toLocal)
    const eye = Vector3.TransformCoordinates(camera.globalPosition, toLocal)
    const above = Math.max(0, eye.y - heightAt(eye.x, eye.z))
    Frustum.GetPlanesToRef(camera.getTransformationMatrix(), planes)
    for (const block of blocks) {
      const dx = Math.max(block.box.x0 - eye.x, 0, eye.x - block.box.x1)
      const dz = Math.max(block.box.z0 - eye.z, 0, eye.z - block.box.z1)
      block.distance = Math.hypot(dx, dz, above)
      block.seen = block.distance < LEVELS.detail.range * KEEP && inView(block, toWorld)
    }
    const now = performance.now()
    for (const level of BY_FINENESS) {
      const { range, cap, maxLoads } = LEVELS[level]
      const held = (block: Block) => block.shown.has(level) || block.loading.has(level)
      // The blocks this level may hold: those held still within reach, and those in view within range, in view and
      // nearest first, up to its cap.
      const allowed = blocks
        .filter((block) => (held(block) && block.distance < range * KEEP) || (block.seen && block.distance < range))
        .sort((a, b) => Number(b.seen) - Number(a.seen) || a.distance - b.distance)
        .slice(0, cap)
      const allowedKeys = new Set(allowed.map((block) => block.key))
      for (const block of blocks) {
        if (held(block) && !allowedKeys.has(block.key)) {
          drop(block, level)
        }
      }
      for (const block of allowed) {
        if (loadingCount[level] >= maxLoads) {
          break
        }
        const stale = block.shown.get(level)?.look !== look()
        const resting = block.failedAt > 0 && now - block.failedAt < RETRY_AFTER
        if (block.seen && stale && !block.loading.has(level) && !resting) {
          load(block, level)
        }
      }
    }
  }

  return {
    heightAt,
    drape(name, image, lift) {
      const mesh = gridMesh(scene, name, (column, row) => coarseAt(column, row) + lift, whole, columns, rows, whole)
      mesh.parent = parent ?? null
      mesh.isPickable = false
      const material = new StandardMaterial(name, scene)
      material.diffuseTexture = image
      material.emissiveColor = Color3.White()
      material.disableLighting = true
      material.useAlphaFromDiffuseTexture = true
      material.zOffset = -4
      mesh.material = material
      return mesh
    },
    setBaseMap(next) {
      map = next
      redrawCoarse()
    },
    setShading(next) {
      shaded = next
      redrawCoarse()
    },
    setHole(cut) {
      cutting = cut
    },
    update(camera) {
      if (performance.now() >= nextPlan) {
        nextPlan = performance.now() + PLAN_EVERY
        plan(camera)
      }
    },
    get detail() {
      return {
        detail: blocks.filter((block) => block.shown.has("detail")).length,
        fine: blocks.filter((block) => block.shown.has("fine")).length,
        loading: loadingCount.detail + loadingCount.fine
      }
    }
  }
}
