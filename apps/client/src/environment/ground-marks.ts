import { Constants } from "@babylonjs/core/Engines/constants"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { ToHalfFloat } from "@babylonjs/core/Misc/textureTools"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, sampleIndex } from "@verdun/map"

/** One texel of the ground marks is about this many metres across. */
const STEP = 1
/** Water gathers in hollows below the ground's mean height over about this radius, in metres: a shell crater's. */
const BASIN_RADIUS = 3
/** Ground fog pools below the ground's mean height over about this radius, in metres: ravines, valleys, the big craters. */
const POOL_RADIUS = 25
/** Standing water is never deeper than this over the ground beneath it, in metres: puddles, not ponds. */
const DEEPEST = 0.25
/** A boot print, by how trodden it leaves the snow: where the man stepped, and the texels beside it. */
const TREAD = { centre: 230, beside: 90 } as const
/** Fresh snow this deep, in millimetres of water, fills a trail about two thirds of the way. */
const SNOW_FILLS = 2

/** The ground's hollows: where water can stand, at what height, sampled every `step` metres. */
export interface Basins {
  readonly width: number
  readonly height: number
  readonly step: number
  /** The highest water can stand at each point, in metres: the ground's mean height round it, but never far above it. */
  readonly level: Float32Array
  /** The ground's mean height over a wide circle round each point, in metres: ground fog lies below it. */
  readonly pool: Float32Array
}

/**
 * Buffers to find the ground's basins in, a value a texel. Craters have the basins found again every couple of seconds
 * while shelling goes on, and fresh buffers each time came to megabytes.
 */
interface BasinBuffers {
  readonly ground: Float32Array
  /** What a blur holds between its passes. */
  readonly spare: Float32Array
  readonly level: Float32Array
  readonly pool: Float32Array
}

const basinBuffers = (texels: number): BasinBuffers => ({
  ground: new Float32Array(texels),
  spare: new Float32Array(texels),
  level: new Float32Array(texels),
  pool: new Float32Array(texels)
})

/** The ground marks' texels over a map: one every `stride` height samples, `width` by `height` of them. */
function marksGrid(map: BattlefieldMap, step = STEP) {
  const stride = Math.max(1, Math.round(step / map.cellSize))
  return { stride, width: Math.floor(map.columns / stride) + 1, height: Math.floor(map.rows / stride) + 1 }
}

/**
 * Two box blurs in a row, each `radius` texels each way, along rows then columns: near enough a Gaussian. Blurs
 * `values` into `blurred` by way of `spare`, leaving `values` as it was.
 */
function blur(
  values: Float32Array,
  blurred: Float32Array,
  spare: Float32Array,
  width: number,
  height: number,
  radius: number
): void {
  const pass = (from: Float32Array, to: Float32Array, length: number, lines: number, along: number, across: number) => {
    for (let line = 0; line < lines; line++) {
      let sum = 0
      let count = 0
      for (let index = 0; index < Math.min(radius, length); index++) {
        sum += from[line * across + index * along]!
        count++
      }
      for (let index = 0; index < length; index++) {
        if (index + radius < length) {
          sum += from[line * across + (index + radius) * along]!
          count++
        }
        if (index - radius - 1 >= 0) {
          sum -= from[line * across + (index - radius - 1) * along]!
          count--
        }
        to[line * across + index * along] = sum / count
      }
    }
  }
  pass(values, spare, width, height, 1, width)
  pass(spare, blurred, height, width, width, 1)
  pass(blurred, spare, width, height, 1, width)
  pass(spare, blurred, height, width, width, 1)
}

/**
 * Where water would stand on the ground: in each hollow, up to the mean height of the ground round it, capped at
 * `DEEPEST` above its floor. Shell craters, trench floors and ruts hold water; level ground and slopes don't, since their
 * mean is their own height. The renderer lowers the water by how wet the ground is.
 */
export function basinsOf(map: BattlefieldMap, step = STEP, buffers?: BasinBuffers): Basins {
  const { stride, width, height } = marksGrid(map, step)
  // Given buffers, the basins are found in them, and the level and pool returned are theirs.
  const { ground, spare, level, pool } = buffers ?? basinBuffers(width * height)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      ground[row * width + column] = map.heights[sampleIndex(map, column * stride, row * stride)] ?? 0
    }
  }
  // The level starts as the ground's mean round each point, then is capped a puddle's depth above the ground.
  blur(ground, level, spare, width, height, Math.max(1, Math.round(BASIN_RADIUS / (stride * map.cellSize) / 2)))
  for (let index = 0; index < level.length; index++) {
    level[index] = Math.min(level[index]!, ground[index]! + DEEPEST)
  }
  blur(ground, pool, spare, width, height, Math.max(1, Math.round(POOL_RADIUS / (stride * map.cellSize) / 2)))
  return { width, height, step: stride * map.cellSize, level, pool }
}

/** The ground's marks for the weather to draw on: its hollows for puddles, and trails trodden in the snow. */
export interface GroundMarks {
  /**
   * Half floats, less `base`: in red, the water level each hollow can hold; in green, the height ground fog pools up to.
   */
  readonly basins: RawTexture
  /** How trodden the snow is, from 0 to 1, in a byte red channel. */
  readonly tracks: RawTexture
  /** Metres added back to the basin texture's values: the lowest water level on the map, or 0 with no basins found. */
  readonly base: number
  /** Texture coordinates from ground metres: u = x × scale.x + offset.x, v = z × scale.y + offset.y. */
  readonly scale: { readonly x: number; readonly y: number }
  readonly offset: { readonly x: number; readonly y: number }
  /** Trodden texels as bytes, row by row: what the tracks texture shows. */
  readonly trodden: Uint8Array
  /** Craters have reshaped the ground: find its hollows again, if it finds them at all. */
  reshape(): void
  /** Marks where men stand in lying snow, and lets fresh snow fill old trails. `snowCover` in millimetres of water. */
  tread(points: Iterable<{ readonly x: number; readonly z: number }>, snowCover: number): void
  dispose(): void
}

/**
 * The ground's marks over a map. With `basins` off, as on the low setting, which draws no puddles or fog in the
 * hollows, the hollows are never found and the basin texture stays flat.
 */
export function createGroundMarks(
  scene: Scene,
  map: BattlefieldMap,
  { basins: finding = true }: { readonly basins?: boolean } = {}
): GroundMarks {
  const { stride, width, height } = marksGrid(map)
  const step = stride * map.cellSize
  const buffers = finding ? basinBuffers(width * height) : null
  const basins = buffers && basinsOf(map, STEP, buffers)
  const base = basins ? basins.level.reduce((lowest, level) => Math.min(lowest, level), Number.POSITIVE_INFINITY) : 0
  // The texture's data, rewritten in place each time the basins are found: the texture copies it when it updates.
  const half = new Uint16Array(width * height * 2)
  const encode = ({ level, pool }: Basins) => {
    for (let index = 0; index < level.length; index++) {
      half[index * 2] = ToHalfFloat(level[index]! - base)
      half[index * 2 + 1] = ToHalfFloat(pool[index]! - base)
    }
    return half
  }
  const basinTexture = new RawTexture(
    basins ? encode(basins) : half,
    width,
    height,
    Constants.TEXTUREFORMAT_RG,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_HALF_FLOAT
  )
  basinTexture.name = "ground-basins"
  const trodden = new Uint8Array(width * height)
  const tracks = new RawTexture(
    trodden,
    width,
    height,
    Constants.TEXTUREFORMAT_R,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE
  )
  tracks.name = "ground-tracks"
  for (const texture of [basinTexture, tracks]) {
    texture.wrapU = Texture.CLAMP_ADDRESSMODE
    texture.wrapV = Texture.CLAMP_ADDRESSMODE
  }
  let lastCover = 0
  let anyTrodden = false

  const press = (column: number, row: number, value: number) => {
    if (column < 0 || row < 0 || column >= width || row >= height) {
      return
    }
    const index = row * width + column
    if (trodden[index]! < value) {
      trodden[index] = value
      anyTrodden = true
    }
  }

  return {
    basins: basinTexture,
    tracks,
    base,
    scale: { x: 1 / (step * width), y: 1 / (step * height) },
    offset: { x: 0.5 / width, y: 0.5 / height },
    trodden,
    reshape() {
      if (buffers) {
        basinTexture.update(encode(basinsOf(map, STEP, buffers)))
      }
    },
    tread(points, snowCover) {
      // Gone with the snow: a fresh fall starts clean.
      if (snowCover <= 0.05) {
        lastCover = 0
        if (anyTrodden) {
          trodden.fill(0)
          anyTrodden = false
          tracks.update(trodden)
        }
        return
      }
      const fresh = snowCover - lastCover
      lastCover = snowCover
      if (fresh > 0 && anyTrodden) {
        const keep = Math.exp(-fresh / SNOW_FILLS)
        for (let index = 0; index < trodden.length; index++) {
          trodden[index] = Math.floor(trodden[index]! * keep)
        }
      }
      for (const point of points) {
        const column = Math.round(point.x / step)
        const row = Math.round(point.z / step)
        press(column, row, TREAD.centre)
        press(column - 1, row, TREAD.beside)
        press(column + 1, row, TREAD.beside)
        press(column, row - 1, TREAD.beside)
        press(column, row + 1, TREAD.beside)
      }
      tracks.update(trodden)
    },
    dispose() {
      basinTexture.dispose()
      tracks.dispose()
    }
  }
}
