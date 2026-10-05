import { Matrix } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"

const IDENTITY = Matrix.Identity()
/** A ray is marched no further than this, in metres: past the map whatever the camera does. */
const MAX_DISTANCE = 3000
/** Marching steps are this share of the ray's height above the ground, between these limits, in metres. */
const STEP = { share: 0.5, min: 0.25, max: 20 } as const
/** Halvings to pin down the crossing once the ray has passed below the ground. */
const REFINEMENTS = 12

interface Point {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Where a ray first meets the map's ground, by marching along it over the height grid: cheap enough for every frame,
 * where picking against the terrain's meshes is not. Null if it misses the map or never comes down to the ground.
 */
export function marchToGround(map: BattlefieldMap, origin: Point, direction: Point): { x: number; z: number } | null {
  const width = mapWidth(map)
  const depth = mapDepth(map)
  const at = (t: number) => ({
    x: origin.x + direction.x * t,
    y: origin.y + direction.y * t,
    z: origin.z + direction.z * t
  })
  const above = (t: number) => {
    const point = at(t)
    return point.y - heightAt(map, point.x, point.z)
  }
  let before = 0
  let t = 0
  while (t <= MAX_DISTANCE) {
    const point = at(t)
    const inside = point.x >= 0 && point.z >= 0 && point.x <= width && point.z <= depth
    if (inside) {
      const height = above(t)
      if (height <= 0) {
        // Crossed between `before` and `t`: halve the gap until it's well under a centimetre.
        let low = before
        let high = t
        for (let index = 0; index < REFINEMENTS; index++) {
          const middle = (low + high) / 2
          if (above(middle) > 0) {
            low = middle
          } else {
            high = middle
          }
        }
        const hit = at(high)
        return { x: hit.x, z: hit.z }
      }
      before = t
      t += Math.min(STEP.max, Math.max(STEP.min, height * STEP.share))
    } else {
      // Outside the map: step on in case the ray comes over its edge.
      before = t
      t += STEP.max
    }
  }
  return null
}

/** Scenes picking from the middle of the screen rather than the pointer: the aim view's. */
const centred = new WeakSet<Scene>()

/**
 * Picks from the middle of the screen, where the aim view's reticle is, rather than from the pointer, while on: the
 * pointer is locked away there, and the man aims where the camera looks.
 */
export function pickFromCentre(scene: Scene, on: boolean): void {
  if (on) {
    centred.add(scene)
  } else {
    centred.delete(scene)
  }
}

/** Where on the canvas the game picks from, in CSS pixels from its top left: the pointer, or the aim view's middle. */
export function pickPoint(scene: Scene): { x: number; y: number } {
  if (centred.has(scene)) {
    const engine = scene.getEngine()
    const scale = engine.getHardwareScalingLevel()
    return { x: (engine.getRenderWidth() * scale) / 2, y: (engine.getRenderHeight() * scale) / 2 }
  }
  return { x: scene.pointerX, y: scene.pointerY }
}

/** The ground point under the pointer (the middle of the screen in the aim view), from the scene's active camera. */
export function groundUnderPointer(scene: Scene, map: BattlefieldMap): { x: number; z: number } | null {
  const camera = scene.activeCamera
  if (!camera) {
    return null
  }
  const { x, y } = pickPoint(scene)
  const ray = scene.createPickingRay(x, y, IDENTITY, camera)
  return marchToGround(map, ray.origin, ray.direction)
}
