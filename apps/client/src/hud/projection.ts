import type { ScreenPoint } from "./element.ts"

/**
 * Battlefield to screen, for marks the HUD draws over the ground: plain arithmetic on the camera's view-projection
 * matrix, so it can be tested without a scene.
 */

/**
 * Where a world point lands on a screen `width` by `height` CSS pixels, through a view-projection matrix laid out as
 * Babylon's are (16 numbers, row vectors, translation in 12-14). Null for a point behind the camera.
 */
export function projectPoint(
  matrix: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number
): ScreenPoint | null {
  const m = (index: number) => matrix[index] ?? 0
  const w = x * m(3) + y * m(7) + z * m(11) + m(15)
  if (w <= 1e-6) {
    return null
  }
  const clipX = (x * m(0) + y * m(4) + z * m(8) + m(12)) / w
  const clipY = (x * m(1) + y * m(5) + z * m(9) + m(13)) / w
  return { x: ((clipX + 1) / 2) * width, y: ((1 - clipY) / 2) * height }
}

/** The angle, clockwise from straight up the screen, of the line from one screen point to another. */
export function screenAngleBetween(from: ScreenPoint, to: ScreenPoint): number {
  return Math.atan2(to.x - from.x, from.y - to.y)
}
