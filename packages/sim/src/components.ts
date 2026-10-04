export const Side = { French: 0, German: 1 } as const
export type Side = (typeof Side)[keyof typeof Side]

/**
 * How a soldier holds themselves. Standing to walk or man a fire step; prone in the open, a third of the target and far
 * safer from shell fragments; sheltering down a dugout under bombardment, out of the fight but nearly safe.
 */
export const Stance = { Standing: 0, Prone: 1, Sheltering: 2 } as const
export type Stance = (typeof Stance)[keyof typeof Stance]

/** A soldier's gas mask: off, being pulled on, or on. */
export const MaskState = { Off: 0, Donning: 1, On: 2 } as const
export type MaskState = (typeof MaskState)[keyof typeof MaskState]

/** A step long before any battle starts, for "never shelled". */
export const NEVER = -1_000_000

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
  /** Unit vector the soldier faces and aims along. */
  readonly facing: { readonly x: Float32Array; readonly z: Float32Array }
  /**
   * Present while a player steers the soldier directly: a direction with length up to 1, as a fraction of walking speed.
   * Steering overrides any move order.
   */
  readonly steer: { readonly x: Float32Array; readonly z: Float32Array }
  /** Index into `Simulation.squads`, or -1 for a soldier without a squad. */
  readonly squad: { readonly id: Int32Array }
  /** Remaining health, from 1 (unhurt) to 0. */
  readonly health: { readonly value: Float32Array }
  /** Tag: present once a soldier has fallen. The fallen keep their place on the battlefield but take no part. */
  readonly dead: Record<string, never>
  /** Tag: present once a soldier has surrendered. Prisoners walk to their captors' rear and take no part. */
  readonly captured: Record<string, never>
  /** The soldier's weapon (a `Weapon`) and seconds until it can fire again. */
  readonly weapon: { readonly kind: Uint8Array; readonly cooldown: Float32Array }
  /** The enemy the soldier is shooting at, or -1. */
  readonly target: { readonly id: Int32Array }
  /** How pinned down the soldier is by incoming fire, from 0 to 1. */
  readonly suppression: { readonly value: Float32Array }
  /** Fighting spirit, from 1 (steady) to 0 (broken). */
  readonly morale: { readonly value: Float32Array }
  /** How the soldier holds themselves: a `Stance`. */
  readonly stance: { readonly value: Uint8Array }
  /**
   * Dugout bookkeeping: the last step a shell burst close by, and the step a sheltering soldier will be back up on the
   * fire step, or -1 while they stay down.
   */
  readonly shelter: { readonly lastShelled: Int32Array; readonly emergeAt: Int32Array }
  /**
   * Gas mask: its `MaskState`, the step a mask being pulled on is on, and the step the air around a masked soldier
   * cleared (-1 while there's still gas).
   */
  readonly mask: { readonly state: Uint8Array; readonly at: Int32Array; readonly clearSince: Int32Array }
  /** Gas breathed so far, in mg·min/m³ (concentration times minutes): the measure of a gas casualty. */
  readonly gasDose: { readonly value: Float32Array }
}

export function createSoldierComponents(capacity: number): SoldierComponents {
  return {
    position: { x: new Float32Array(capacity), z: new Float32Array(capacity) },
    side: { value: new Uint8Array(capacity) },
    speed: { value: new Float32Array(capacity) },
    moveOrder: { x: new Float32Array(capacity), z: new Float32Array(capacity) },
    facing: { x: new Float32Array(capacity), z: new Float32Array(capacity) },
    steer: { x: new Float32Array(capacity), z: new Float32Array(capacity) },
    squad: { id: new Int32Array(capacity).fill(-1) },
    health: { value: new Float32Array(capacity) },
    dead: {},
    captured: {},
    weapon: { kind: new Uint8Array(capacity), cooldown: new Float32Array(capacity) },
    target: { id: new Int32Array(capacity).fill(-1) },
    suppression: { value: new Float32Array(capacity) },
    morale: { value: new Float32Array(capacity) },
    stance: { value: new Uint8Array(capacity) },
    shelter: { lastShelled: new Int32Array(capacity).fill(NEVER), emergeAt: new Int32Array(capacity).fill(-1) },
    mask: {
      state: new Uint8Array(capacity),
      at: new Int32Array(capacity).fill(-1),
      clearSince: new Int32Array(capacity).fill(-1)
    },
    gasDose: { value: new Float32Array(capacity) }
  }
}
