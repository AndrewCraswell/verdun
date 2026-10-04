export const Side = { French: 0, German: 1 } as const
export type Side = (typeof Side)[keyof typeof Side]

/**
 * Soldier component stores, one typed-array slot per entity id. Each simulation owns its own stores, so several worlds
 * (a replay, a test, a server sector) never share state.
 *
 * Positions are 2.5D: x east and z north on the ground plane, in metres. Height always comes from the map.
 */
export interface SoldierComponents {
  readonly position: { readonly x: Float32Array; readonly z: Float32Array }
  readonly side: { readonly value: Uint8Array }
  /** Walking speed in metres per second. */
  readonly speed: { readonly value: Float32Array }
  /** Present while the soldier is walking to an ordered point. */
  readonly moveOrder: { readonly x: Float32Array; readonly z: Float32Array }
}

export function createSoldierComponents(capacity: number): SoldierComponents {
  return {
    position: { x: new Float32Array(capacity), z: new Float32Array(capacity) },
    side: { value: new Uint8Array(capacity) },
    speed: { value: new Float32Array(capacity) },
    moveOrder: { x: new Float32Array(capacity), z: new Float32Array(capacity) }
  }
}
