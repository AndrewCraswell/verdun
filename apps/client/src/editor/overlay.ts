import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"

/** Sector files lay their images out at this many pixels a metre, as their Tiled maps are drawn. */
const PIXELS_PER_METRE = 10
/** The overlay follows the ground in steps this long, in metres, and floats this far above it. */
const STEP = 2
const LIFT = 0.25

/** An image laid over the ground: the LiDAR survey, a historical map traced in, the generator's preview. */
export interface ImageOverlay {
  setOpacity(opacity: number): void
  dispose(): void
}

/** Where an image layer of a sector file lies: its top-left corner, in the Tiled map's pixels. */
export interface ImagePlacement {
  readonly url: string
  readonly offsetX: number
  readonly offsetY: number
}

/**
 * Drapes an image layer of the sector's Tiled map over the ground, unlit, so it reads as drawn: north at the top, 10
 * pixels a metre from its offset, as Tiled shows it. Resolves once the image has loaded and its size is known.
 */
export async function createImageOverlay(
  scene: Scene,
  map: BattlefieldMap,
  { url, offsetX, offsetY }: ImagePlacement,
  opacity: number
): Promise<ImageOverlay> {
  const texture = await new Promise<Texture>((resolve, reject) => {
    const loading: Texture = new Texture(
      url,
      scene,
      false,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => resolve(loading),
      () => reject(new Error(`Couldn't load ${url}`))
    )
  })
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  const { width: pixelsWide, height: pixelsHigh } = texture.getBaseSize()
  const depth = mapDepth(map)
  // The image's rectangle in metres, clipped to the sector.
  const left = offsetX / PIXELS_PER_METRE
  const top = depth - offsetY / PIXELS_PER_METRE
  const right = left + pixelsWide / PIXELS_PER_METRE
  const bottom = top - pixelsHigh / PIXELS_PER_METRE
  const fromX = Math.max(0, left)
  const toX = Math.min(mapWidth(map), right)
  const fromZ = Math.max(0, bottom)
  const toZ = Math.min(depth, top)
  const columns = Math.max(1, Math.ceil((toX - fromX) / STEP))
  const rows = Math.max(1, Math.ceil((toZ - fromZ) / STEP))
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let row = 0; row <= rows; row++) {
    const z = fromZ + ((toZ - fromZ) * row) / rows
    for (let column = 0; column <= columns; column++) {
      const x = fromX + ((toX - fromX) * column) / columns
      positions.push(x, heightAt(map, x, z) + LIFT, z)
      uvs.push((x - left) / (right - left), (z - bottom) / (top - bottom))
    }
  }
  const stride = columns + 1
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * stride + column
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
  }
  const mesh = new Mesh(`overlay-${url}`, scene)
  const data = new VertexData()
  data.positions = positions
  data.uvs = uvs
  data.indices = indices
  data.applyToMesh(mesh)
  const material = new StandardMaterial(`overlay-${url}`, scene)
  material.diffuseTexture = texture
  material.emissiveColor = Color3.White()
  material.disableLighting = true
  material.useAlphaFromDiffuseTexture = true
  material.zOffset = -2
  material.alpha = opacity
  mesh.material = material
  mesh.isPickable = false
  return {
    setOpacity(value) {
      material.alpha = value
      mesh.setEnabled(value > 0)
    },
    dispose() {
      mesh.dispose()
      material.dispose()
      texture.dispose()
    }
  }
}
