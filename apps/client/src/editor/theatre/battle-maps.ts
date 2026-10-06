import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import catalogueFile from "@verdun/map/data/battle-maps.json" with { type: "json" }
import { type ControlPoint, georeference } from "./georeference.ts"
import { THEATRE } from "./ground.ts"

/** A dated battle map: a scan fitted to the ground by its control points (packages/map/data/battle-maps.json). */
export interface BattleMap {
  readonly id: string
  readonly title: string
  readonly from: string
  readonly to: string
  readonly source: string
  readonly credit: string
  readonly file: string
  readonly size: readonly [number, number]
  /** The part of the scan that is map, in pixels: left, top, right, bottom; and boxes within it to leave off. */
  readonly frame: readonly [number, number, number, number]
  readonly excluded: readonly (readonly [number, number, number, number])[]
  readonly order: 1 | 2
  /** Whether the scan is stretched to pass through every control point (see georeference.ts). */
  readonly exact?: boolean
  readonly controlPoints: readonly ControlPoint[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isNumbers(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number")
}

function isControlPoint(value: unknown): value is ControlPoint {
  return isRecord(value) && typeof value.name === "string" && isNumbers(value.pixel, 2) && isNumbers(value.ground, 2)
}

function isBattleMap(value: unknown): value is BattleMap {
  return (
    isRecord(value) &&
    ["id", "title", "from", "to", "source", "credit", "file"].every((key) => typeof value[key] === "string") &&
    isNumbers(value.size, 2) &&
    isNumbers(value.frame, 4) &&
    Array.isArray(value.excluded) &&
    value.excluded.every((box: unknown) => isNumbers(box, 4)) &&
    (value.order === 1 || value.order === 2) &&
    (value.exact === undefined || typeof value.exact === "boolean") &&
    Array.isArray(value.controlPoints) &&
    value.controlPoints.every(isControlPoint)
  )
}

/** The battle maps, earliest first. */
const catalogue: unknown = catalogueFile
export const BATTLE_MAPS: readonly BattleMap[] = (
  isRecord(catalogue) && Array.isArray(catalogue.maps) ? catalogue.maps : []
)
  .filter(isBattleMap)
  .sort((a, b) => a.from.localeCompare(b.from))

/** The ground is followed in steps this long, in metres, and the map floats this far above it. */
const STEP = 40
const LIFT = 9

export interface BattleMapDrape {
  /** How far the fit misses its control points, on average, in metres. */
  readonly rms: number
  setOpacity(opacity: number): void
  dispose(): void
}

/**
 * Lays a battle map over the theatre's ground, under `parent` (the theatre's frame), unlit, at `opacity`: each point of
 * a grid over the ground takes the scan's pixel the fit puts there, and only the scan's map frame is drawn.
 * `heightAt` gives the ground's height in the theatre's frame.
 */
export function drapeBattleMap(
  scene: Scene,
  map: BattleMap,
  parent: TransformNode,
  heightAt: (x: number, z: number) => number,
  opacity: number
): BattleMapDrape {
  const fit = georeference(map.controlPoints, map.order, map.exact === true)
  const [width, height] = map.size
  const [left, top, right, bottom] = map.frame
  const onMap = ([u, v]: readonly [number, number]) =>
    u >= left &&
    u <= right &&
    v >= top &&
    v <= bottom &&
    !map.excluded.some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v >= y0 && v <= y1)
  const columns = Math.floor(THEATRE.width / STEP) + 1
  const rows = Math.floor(THEATRE.depth / STEP) + 1
  const positions: number[] = []
  const uvs: number[] = []
  const inside: boolean[] = []
  for (let row = 0; row < rows; row++) {
    const z = row * STEP
    for (let column = 0; column < columns; column++) {
      const x = column * STEP
      const pixel = fit.toPixel(THEATRE.west + x, THEATRE.south + z)
      positions.push(x, heightAt(x, z) + LIFT, z)
      uvs.push(pixel[0] / width, 1 - pixel[1] / height)
      inside.push(onMap(pixel))
    }
  }
  const indices: number[] = []
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column
      const corners = [a, a + 1, a + columns, a + columns + 1]
      if (corners.every((corner) => inside[corner])) {
        indices.push(a, a + 1, a + columns, a + 1, a + columns + 1, a + columns)
      }
    }
  }
  const mesh = new Mesh(`battle-map-${map.id}`, scene)
  const data = new VertexData()
  data.positions = positions
  data.uvs = uvs
  data.indices = indices
  data.applyToMesh(mesh)
  mesh.parent = parent
  mesh.isPickable = false
  const material = new StandardMaterial(`battle-map-${map.id}`, scene)
  const texture = new Texture(`/battle-maps/${map.file}`, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE)
  texture.anisotropicFilteringLevel = 8
  material.diffuseTexture = texture
  material.emissiveColor = Color3.White()
  material.disableLighting = true
  material.alpha = opacity
  material.zOffset = -6
  material.backFaceCulling = false
  mesh.material = material
  return {
    rms: fit.rms,
    setOpacity(value) {
      material.alpha = value
      mesh.setEnabled(value > 0)
    },
    dispose() {
      mesh.dispose()
      material.dispose(true, true)
    }
  }
}
