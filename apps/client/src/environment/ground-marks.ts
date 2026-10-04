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

/** Two box blurs in a row, each `radius` texels each way, along rows then columns: near enough a Gaussian. */
function blur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
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
  const a = new Float32Array(values.length)
  const b = new Float32Array(values.length)
  pass(values, a, width, height, 1, width)
  pass(a, b, height, width, width, 1)
  pass(b, a, width, height, 1, width)
  pass(a, b, height, width, width, 1)
  return b
}

/**
 * Where water would stand on the ground: in each hollow, up to the mean height of the ground round it, capped at
 * `DEEPEST` above its floor. Shell craters, trench floors and ruts hold water; level ground and slopes don't, since their
 * mean is their own height. The renderer lowers the water by how wet the ground is.
 */
export function basinsOf(map: BattlefieldMap, step = STEP): Basins {
  const stride = Math.max(1, Math.round(step / map.cellSize))
  const width = Math.floor(map.columns / stride) + 1
  const height = Math.floor(map.rows / stride) + 1
  const ground = new Float32Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      ground[row * width + column] = map.heights[sampleIndex(map, column * stride, row * stride)] ?? 0
    }
  }
  const mean = blur(ground, width, height, Math.max(1, Math.round(BASIN_RADIUS / (stride * map.cellSize) / 2)))
  const level = new Float32Array(width * height)
  for (let index = 0; index < level.length; index++) {
    level[index] = Math.min(mean[index]!, ground[index]! + DEEPEST)
  }
  const pool = blur(ground, width, height, Math.max(1, Math.round(POOL_RADIUS / (stride * map.cellSize) / 2)))
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
  /** Metres added back to the basin texture's values: the lowest water level on the map. */
  readonly base: number
  /** Texture coordinates from ground metres: u = x × scale.x + offset.x, v = z × scale.y + offset.y. */
  readonly scale: { readonly x: number; readonly y: number }
  readonly offset: { readonly x: number; readonly y: number }
  /** Trodden texels as bytes, row by row: what the tracks texture shows. */
  readonly trodden: Uint8Array
  /** Craters have reshaped the ground: find its hollows again. */
  reshape(): void
  /** Marks where men stand in lying snow, and lets fresh snow fill old trails. `snowCover` in millimetres of water. */
  tread(points: Iterable<{ readonly x: number; readonly z: number }>, snowCover: number): void
  dispose(): void
}

export function createGroundMarks(scene: Scene, map: BattlefieldMap): GroundMarks {
  let basins = basinsOf(map)
  const { width, height, step } = basins
  const base = basins.level.reduce((lowest, level) => Math.min(lowest, level), Number.POSITIVE_INFINITY)
  const encode = ({ level, pool }: Basins) => {
    const half = new Uint16Array(level.length * 2)
    for (let index = 0; index < level.length; index++) {
      half[index * 2] = ToHalfFloat(level[index]! - base)
      half[index * 2 + 1] = ToHalfFloat(pool[index]! - base)
    }
    return half
  }
  const basinTexture = new RawTexture(
    encode(basins),
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
      basins = basinsOf(map)
      basinTexture.update(encode(basins))
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
