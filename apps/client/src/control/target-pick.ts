import type { EntityId } from "@verdun/sim"

/** A man as the screen shows him: who he is, and where his chest is, in CSS pixels from the canvas's top left. */
export interface OnScreen {
  readonly id: EntityId
  readonly x: number
  readonly y: number
}

/**
 * How near the pointer a man's chest must be on the screen to be picked out, in pixels at the usual marker size: in the
 * field view, and in the aim view, where the reticle is in the middle of a magnified view.
 */
export const PICK_RADIUS = { field: 28, aim: 16 } as const
/**
 * The man already picked out keeps the pick until another is clearly nearer the pointer: nearer by this share of the
 * radius. And he keeps it a little past the radius, by `reach` of it, so a man at its edge doesn't flicker in and out.
 */
const STICKY = { margin: 0.3, reach: 1.25 } as const

/**
 * The man to pick out under the pointer: the nearest on the screen within `radius` pixels of it, unless the one already
 * picked (`held`) is still near and no other is clearly nearer, as top-down shooters' target magnetism does. -1 for
 * nobody.
 */
export function pickOnScreen(
  men: Iterable<OnScreen>,
  at: { readonly x: number; readonly y: number },
  radius: number,
  held: EntityId
): EntityId {
  let nearest: EntityId = -1
  let nearestDistance = Infinity
  let heldDistance = Infinity
  for (const man of men) {
    const distance = Math.hypot(man.x - at.x, man.y - at.y)
    if (man.id === held) {
      heldDistance = distance
    }
    if (distance <= radius && distance < nearestDistance) {
      nearest = man.id
      nearestDistance = distance
    }
  }
  if (held >= 0 && heldDistance <= radius * STICKY.reach && nearestDistance > heldDistance - radius * STICKY.margin) {
    return held
  }
  return nearest
}
