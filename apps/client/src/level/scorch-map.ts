import { Constants } from "@babylonjs/core/Engines/constants"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { Scene } from "@babylonjs/core/scene"

/** Scorch is painted at this many texels per metre: enough for a field gun's 2 m blot to keep its facets. */
const TEXELS_PER_METRE = 1
/** Corners of a scorch blot: Synty's flat, faceted look rather than a soft splat. */
const BLOT_CORNERS = 7

/**
 * Where shells have blackened the ground: one byte per texel over the whole map, 0 untouched to 255 burnt black. The
 * ground material darkens by it (see ground-splat-plugin.ts).
 */
export interface ScorchMap {
  readonly width: number
  readonly depth: number
  readonly texture: RawTexture
  /** Blackens a faceted blot of ground `radius` metres across around a burst, ragged splashes thrown out beyond it. */
  scorch(x: number, z: number, radius: number, random?: () => number): void
  /** Rain washing the soot into the mud: fades every scorch mark by this fraction of what's left of it. */
  wash(fraction: number): void
  /** Sends the scorch painted or washed since the last call to the GPU. Call once per frame. */
  update(): void
  dispose(): void
}

/** True when a point lies inside a convex polygon, its corners' x and z given in order. */
function inside(xs: readonly number[], zs: readonly number[], x: number, z: number): boolean {
  let sign = 0
  for (let index = 0; index < xs.length; index++) {
    const next = (index + 1) % xs.length
    const cross =
      ((xs[next] ?? 0) - (xs[index] ?? 0)) * (z - (zs[index] ?? 0)) -
      ((zs[next] ?? 0) - (zs[index] ?? 0)) * (x - (xs[index] ?? 0))
    if (cross !== 0) {
      if (sign !== 0 && Math.sign(cross) !== sign) {
        return false
      }
      sign = Math.sign(cross)
    }
  }
  return true
}

/**
 * Paints a faceted blot into a scorch grid: darkest at the middle, `strength` at most, never lightening what's there.
 * Exported for tests.
 */
export function paintBlot(
  texels: Uint8Array,
  width: number,
  depth: number,
  x: number,
  z: number,
  radius: number,
  strength: number,
  random: () => number
): void {
  const turn = random() * Math.PI * 2
  const xs: number[] = []
  const zs: number[] = []
  for (let corner = 0; corner < BLOT_CORNERS; corner++) {
    const angle = turn + (corner / BLOT_CORNERS) * Math.PI * 2
    const reach = radius * (0.75 + random() * 0.3)
    xs.push(x + Math.cos(angle) * reach)
    zs.push(z + Math.sin(angle) * reach)
  }
  const minColumn = Math.max(0, Math.floor((x - radius) * TEXELS_PER_METRE))
  const maxColumn = Math.min(width - 1, Math.ceil((x + radius) * TEXELS_PER_METRE))
  const minRow = Math.max(0, Math.floor((z - radius) * TEXELS_PER_METRE))
  const maxRow = Math.min(depth - 1, Math.ceil((z + radius) * TEXELS_PER_METRE))
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const px = (column + 0.5) / TEXELS_PER_METRE
      const pz = (row + 0.5) / TEXELS_PER_METRE
      if (!inside(xs, zs, px, pz)) {
        continue
      }
      // Two flat steps rather than a gradient: a black core and a browner ring.
      const core = Math.hypot(px - x, pz - z) < radius * 0.55
      const value = Math.round(255 * strength * (core ? 1 : 0.62))
      const index = row * width + column
      texels[index] = Math.max(texels[index] ?? 0, value)
    }
  }
}

export function createScorchMap(scene: Scene, widthMetres: number, depthMetres: number): ScorchMap {
  const width = Math.ceil(widthMetres * TEXELS_PER_METRE)
  const depth = Math.ceil(depthMetres * TEXELS_PER_METRE)
  const texels = new Uint8Array(width * depth)
  const texture = new RawTexture(
    texels,
    width,
    depth,
    Constants.TEXTUREFORMAT_R,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE
  )
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  let dirty = false
  return {
    width: widthMetres,
    depth: depthMetres,
    texture,
    scorch(x, z, radius, random = Math.random) {
      paintBlot(texels, width, depth, x, z, radius, 0.7, random)
      // Earth and burning charge thrown out: a few small blots around the main one.
      const splashes = 2 + Math.floor(random() * 3)
      for (let splash = 0; splash < splashes; splash++) {
        const angle = random() * Math.PI * 2
        const reach = radius * (1 + random() * 0.8)
        paintBlot(
          texels,
          width,
          depth,
          x + Math.cos(angle) * reach,
          z + Math.sin(angle) * reach,
          radius * (0.2 + random() * 0.25),
          0.5,
          random
        )
      }
      dirty = true
    },
    wash(fraction) {
      const keep = 1 - Math.min(1, Math.max(0, fraction))
      // Rounding down takes at least a step off every mark, however faint, so they wash away in the end.
      for (let index = 0; index < texels.length; index++) {
        const value = texels[index] ?? 0
        if (value > 0) {
          texels[index] = Math.floor(value * keep)
        }
      }
      dirty = true
    },
    update() {
      if (dirty) {
        texture.update(texels)
        dirty = false
      }
    },
    dispose() {
      texture.dispose()
    }
  }
}
