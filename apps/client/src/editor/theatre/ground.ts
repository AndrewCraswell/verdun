import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import { type GroundBox, NO_BOX, SectorHolePlugin } from "./sector-hole.ts"

/**
 * The theatre: the ground round Verdun the editor's theatre view draws, in Lambert-93 (EPSG:2154) metres. Its local
 * frame puts the south-west corner at x 0, z 0, with z north and heights above `base`, as the sectors' frames do.
 */
export const THEATRE = { west: 852_000, south: 6_892_000, width: 38_000, depth: 25_000, base: 170 } as const

/**
 * Where the Battle of Verdun was fought, February to December 1916, roughly: from the Bois d'Avocourt on the left bank
 * to Fromezey in the Woëvre, and from the line of 21 February by Consenvoye and the Bois des Caures south to Eix and
 * Fort Souville, the furthest the Germans came. In Lambert-93 metres; to be drawn from the dated front lines once traced.
 */
export const BATTLE_BOUNDS = { west: 854_000, south: 6_899_500, east: 888_500, north: 6_913_000 } as const
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

/** The coarse ground over the whole theatre, every `step` metres, and finer tiles near the camera. */
const COARSE = { step: 50, texture: 4096 } as const
const DETAIL = { samples: 257, texture: 1024, radius: 2600, maxLoads: 3 } as const
/**
 * The finest ground, the LiDAR at 1 m, in a square of `span` by `span` tiles of `size` metres round the point looked
 * at, its map at half a metre a pixel: shown whole once every tile has come, in place of the ground under it.
 */
const FINE = { size: 250, samples: 251, texture: 512, span: 5, maxLoads: 4 } as const
/** A tile or square that failed to load is asked for again after this many milliseconds. */
const RETRY_AFTER = 8000
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
  /** Multiplies the hillshade into the map, or stops. */
  setShading(shaded: boolean): void
  /** Called each frame with the point the camera looks at: loads finer tiles round it, drops those far off. */
  update(x: number, z: number): void
  /**
   * Lays an image of the whole theatre over its ground, unlit, `lift` metres above it, such as the rivers: transparent
   * where the image is. Returns the mesh, to show and hide.
   */
  drape(name: string, image: BaseTexture, lift: number): Mesh
  /** How many detail tiles are drawn and loading, and whether the 1 m square is shown, for the status line. */
  readonly detail: { readonly shown: number; readonly loading: number; readonly fine: boolean }
}

interface DetailTile {
  mesh: Mesh | null
  material: StandardMaterial | null
  loading: boolean
  /** When it last failed to load, by performance.now(), or 0: it's tried again RETRY_AFTER milliseconds later. */
  failedAt: number
  /** How it was drawn: its map, and whether shaded. */
  look: string
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

  /** The 1 m square, in the scene's metres, while it's shown. */
  let fineBox: GroundBox = NO_BOX
  const offsetX = () => parent?.position.x ?? 0
  const offsetZ = () => parent?.position.z ?? 0
  const theatreHoles = (): readonly [GroundBox, GroundBox] => [hole ?? NO_BOX, fineBox]
  const fineHoles = (): readonly [GroundBox, GroundBox] => [hole ?? NO_BOX, NO_BOX]

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
  let coarseMaterial = mapMaterial(
    scene,
    "theatre-coarse",
    coarseTexture(map),
    map,
    theatreHoles,
    coarseShade()
  ).material
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

  const details = new Map<number, DetailTile>()
  let loading = 0
  const load = (tx: number, tz: number, tile: DetailTile) => {
    tile.loading = true
    loading += 1
    const box = { x0: tx * TILE, z0: tz * TILE, x1: (tx + 1) * TILE, z1: (tz + 1) * TILE }
    const samples = DETAIL.samples
    const drawn = map
    const drawnLook = look()
    const shade = shadeUrl(box.x0, box.z0, box.x1, box.z1, DETAIL.texture, DETAIL.texture)
    heightGrid(box.x0, box.z0, box.x1, box.z1, samples, samples)
      .then(async (heights) => {
        const mesh = gridMesh(
          scene,
          `theatre-detail-${tx}-${tz}`,
          (column, row) => heights[row * samples + column] ?? 0,
          box,
          samples,
          samples,
          box
        )
        mesh.setEnabled(false)
        mesh.parent = parent ?? null
        const { material, loaded } = mapMaterial(
          scene,
          `theatre-detail-${tx}-${tz}`,
          wmsUrl(drawn.layer, drawn.format, box.x0, box.z0, box.x1, box.z1, DETAIL.texture, DETAIL.texture),
          drawn,
          theatreHoles,
          shade
        )
        mesh.material = material
        try {
          await loaded
        } catch (error) {
          mesh.dispose()
          material.dispose(true, true)
          throw error
        }
        // The fine tile takes over from the coarse ground only once its map has come.
        tile.mesh?.dispose()
        tile.material?.dispose(true, true)
        tile.mesh = mesh
        tile.material = material
        tile.look = drawnLook
        tile.failedAt = 0
        mesh.setEnabled(true)
        coarseTiles[tz * tilesX + tx]?.setEnabled(false)
      })
      .catch((error: unknown) => {
        tile.failedAt = performance.now()
        console.warn(`Theatre tile ${tx},${tz}, trying again shortly:`, error)
      })
      .finally(() => {
        tile.loading = false
        loading -= 1
      })
  }
  const redrawCoarse = () => {
    coarseMaterial.dispose(true, true)
    coarseMaterial = mapMaterial(scene, "theatre-coarse", coarseTexture(map), map, theatreHoles, coarseShade()).material
    for (const mesh of coarseTiles) {
      mesh.material = coarseMaterial
    }
  }
  interface FineSquare {
    readonly key: string
    readonly box: GroundBox
    readonly meshes: Mesh[]
    readonly materials: StandardMaterial[]
    cancelled: boolean
  }
  let fineShown: FineSquare | null = null
  let fineLoading: FineSquare | null = null
  /** The square that last failed, and when, so it isn't asked for again straight away. */
  let fineFailed = { key: "", at: 0 }
  const disposeSquare = (square: FineSquare) => {
    for (const mesh of square.meshes) {
      mesh.dispose()
    }
    for (const material of square.materials) {
      material.dispose(true, true)
    }
  }
  /** Loads the square whose south-west corner is at (x0, z0), at most FINE.maxLoads tiles at a time, and shows it. */
  const loadSquare = (x0: number, z0: number, key: string) => {
    const square: FineSquare = {
      key,
      box: { x0, z0, x1: x0 + FINE.span * FINE.size, z1: z0 + FINE.span * FINE.size },
      meshes: [],
      materials: [],
      cancelled: false
    }
    fineLoading = square
    const drawn = map
    const tiles: { x0: number; z0: number }[] = []
    for (let row = 0; row < FINE.span; row++) {
      for (let column = 0; column < FINE.span; column++) {
        tiles.push({ x0: x0 + column * FINE.size, z0: z0 + row * FINE.size })
      }
    }
    const loadTile = async (tile: { x0: number; z0: number }) => {
      const box = { x0: tile.x0, z0: tile.z0, x1: tile.x0 + FINE.size, z1: tile.z0 + FINE.size }
      const heights = await heightGrid(box.x0, box.z0, box.x1, box.z1, FINE.samples, FINE.samples)
      const mesh = gridMesh(
        scene,
        `theatre-fine-${box.x0}-${box.z0}`,
        (column, row) => heights[row * FINE.samples + column] ?? 0,
        box,
        FINE.samples,
        FINE.samples,
        box
      )
      mesh.setEnabled(false)
      mesh.parent = parent ?? null
      const { material, loaded } = mapMaterial(
        scene,
        `theatre-fine-${box.x0}-${box.z0}`,
        wmsUrl(drawn.layer, drawn.format, box.x0, box.z0, box.x1, box.z1, FINE.texture, FINE.texture),
        drawn,
        fineHoles,
        shadeUrl(box.x0, box.z0, box.x1, box.z1, FINE.texture, FINE.texture)
      )
      mesh.material = material
      square.meshes.push(mesh)
      square.materials.push(material)
      await loaded
    }
    const next = async (): Promise<void> => {
      const tile = tiles.shift()
      if (!tile || square.cancelled) {
        return
      }
      await loadTile(tile)
      return next()
    }
    Promise.all(Array.from({ length: FINE.maxLoads }, next))
      .then(() => {
        if (square.cancelled) {
          disposeSquare(square)
          return
        }
        // The whole square has come: it takes over from the ground under it.
        if (fineShown) {
          disposeSquare(fineShown)
        }
        fineShown = square
        fineLoading = null
        for (const mesh of square.meshes) {
          mesh.setEnabled(true)
        }
        fineBox = {
          x0: square.box.x0 + offsetX(),
          z0: square.box.z0 + offsetZ(),
          x1: square.box.x1 + offsetX(),
          z1: square.box.z1 + offsetZ()
        }
      })
      .catch((error: unknown) => {
        console.warn("The 1 m ground, trying again shortly:", error)
        fineFailed = { key: square.key, at: performance.now() }
        disposeSquare(square)
        if (fineLoading === square) {
          fineLoading = null
        }
      })
  }
  /** Keeps the 1 m square round the point looked at, in step with the map drawn on it. */
  const followFine = (x: number, z: number) => {
    const half = (FINE.span * FINE.size) / 2
    const x0 = Math.min(THEATRE.width - 2 * half, Math.max(0, Math.round((x - half) / FINE.size) * FINE.size))
    const z0 = Math.min(THEATRE.depth - 2 * half, Math.max(0, Math.round((z - half) / FINE.size) * FINE.size))
    const key = `${x0},${z0},${look()}`
    if (fineShown?.key === key || fineLoading?.key === key) {
      return
    }
    if (fineFailed.key === key && performance.now() - fineFailed.at < RETRY_AFTER) {
      return
    }
    if (fineLoading) {
      fineLoading.cancelled = true
    }
    loadSquare(x0, z0, key)
  }
  const drop = (key: number, tile: DetailTile) => {
    tile.mesh?.dispose()
    tile.material?.dispose(true, true)
    details.delete(key)
    coarseTiles[key]?.setEnabled(true)
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
    update(x, z) {
      followFine(x, z)
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
          const fresh: DetailTile = { mesh: null, material: null, loading: false, look: look(), failedAt: 0 }
          details.set(key, fresh)
          load(tx, tz, fresh)
        } else if (
          !tile.loading &&
          (tile.look !== look() || (!tile.mesh && tile.failedAt > 0 && performance.now() - tile.failedAt > RETRY_AFTER))
        ) {
          load(tx, tz, tile)
        }
      }
    },
    get detail() {
      return { shown: [...details.values()].filter((tile) => tile.mesh).length, loading, fine: fineShown !== null }
    }
  }
}
