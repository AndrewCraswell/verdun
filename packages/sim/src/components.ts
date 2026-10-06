export const Side = { French: 0, German: 1 } as const
export type Side = (typeof Side)[keyof typeof Side]

/**
 * How a soldier holds themselves. Standing to walk or man a fire step; prone in the open, a third of the target and far
 * safer from shell fragments; sheltering down a dugout under bombardment, out of the fight but nearly safe.
 */
export const Stance = { Standing: 0, Prone: 1, Sheltering: 2, Crouching: 3 } as const
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
  readonly moveOrder: { readonly x: Float32Array; readonly z: Float32Array; readonly run: Uint8Array }
  /** Unit vector the soldier faces and aims along. */
  readonly facing: { readonly x: Float32Array; readonly z: Float32Array }
  /** Present while the soldier climbs over a wire fence (vault.ts): where he comes down. It overrides steering and orders. */
  readonly vault: { readonly x: Float32Array; readonly z: Float32Array }
  /**
   * Present while the soldier mans a machine-gun nest's gun (nests.ts): which nest, by its index among the map's nests,
   * and the weapon he put down to take it up. His squad leaves him at it.
   */
  readonly post: { readonly nest: Int32Array; readonly weapon: Uint8Array }
  /**
   * Present while the soldier cuts a lane through the wire (cutters.ts): the way he cuts, a unit vector; the work the
   * lane through the belt took when he started, in seconds; and how far through it he is, from 0 to 1.
   */
  readonly cutting: {
    readonly x: Float32Array
    readonly z: Float32Array
    readonly total: Float32Array
    readonly progress: Float32Array
  }
  /**
   * Present while a player steers the soldier directly: a direction with length up to 1, as a fraction of walking speed.
   * Steering overrides any move order. `run` is 1 while the player holds the run key.
   */
  readonly steer: { readonly x: Float32Array; readonly z: Float32Array; readonly run: Uint8Array }
  /** Index into `Simulation.squads`, or -1 for a soldier without a squad. */
  readonly squad: { readonly id: Int32Array }
  /** Remaining health, from 1 (unhurt) to 0. */
  readonly health: { readonly value: Float32Array }
  /** Tag: present once a soldier has fallen. The fallen keep their place on the battlefield but take no part. */
  readonly dead: Record<string, never>
  /** Tag: present once a soldier has surrendered. Prisoners walk to their captors' rear and take no part. */
  readonly captured: Record<string, never>
  /**
   * Tag: present with `dead` while a fallen soldier is only wounded, lying where he fell until the stretcher-bearers
   * reach him, the enemy picks him up, or his wound kills him.
   */
  readonly wounded: Record<string, never>
  /** Tag: present with `dead` once a wounded soldier has been carried off the field. */
  readonly evacuated: Record<string, never>
  /**
   * The step the stretcher-bearers sent for a wounded soldier get him to the aid post (-1 while none are on their way),
   * and the seconds of care he's had there since triage sent him back to duty (-1 when he isn't being patched up).
   */
  readonly casualty: { readonly evacuateAt: Int32Array; readonly treatment: Float32Array }
  /**
   * The soldier's weapon (a `Weapon`), seconds until it can fire again, and the step it last fired: at night the muzzle
   * flash gives the shooter away for a moment.
   */
  readonly weapon: {
    readonly kind: Uint8Array
    readonly cooldown: Float32Array
    readonly firedAt: Int32Array
    /** Rounds left in the magazine, clip, strip or belt; refilled when a reload finishes (combat.ts, `MAGAZINES`). */
    readonly rounds: Uint16Array
    /** 1 while reloading: the cooldown is then the time left to finish. */
    readonly reloading: Uint8Array
  }
  /** The enemy the soldier is shooting at, or -1. For a player's man, the one the player aims at. */
  readonly target: { readonly id: Int32Array }
  /**
   * The step a player's man settled on his aim: since then he hasn't switched target, swung his aim, moved or changed
   * stance. His shots steady from it (combat.ts `steadiness`).
   */
  readonly aim: { readonly since: Int32Array }
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
  /** Hand grenades still carried. */
  readonly grenades: { readonly count: Uint8Array }
  /** Rifle grenades a grenadier still carries, and the step he can fire the next. */
  readonly rifleGrenades: { readonly count: Uint8Array; readonly readyAt: Int32Array }
  /**
   * Breath for running and climbing, from 100 down to 0, and whether the soldier is spent: he ran himself out and walks
   * slowly until he has his breath back.
   */
  readonly stamina: { readonly value: Float32Array; readonly spent: Uint8Array }
}

export function createSoldierComponents(capacity: number): SoldierComponents {
  return {
    position: { x: new Float32Array(capacity), z: new Float32Array(capacity) },
    side: { value: new Uint8Array(capacity) },
    speed: { value: new Float32Array(capacity) },
    moveOrder: { x: new Float32Array(capacity), z: new Float32Array(capacity), run: new Uint8Array(capacity) },
    facing: { x: new Float32Array(capacity), z: new Float32Array(capacity) },
    vault: { x: new Float32Array(capacity), z: new Float32Array(capacity) },
    post: { nest: new Int32Array(capacity), weapon: new Uint8Array(capacity) },
    cutting: {
      x: new Float32Array(capacity),
      z: new Float32Array(capacity),
      total: new Float32Array(capacity),
      progress: new Float32Array(capacity)
    },
    steer: { x: new Float32Array(capacity), z: new Float32Array(capacity), run: new Uint8Array(capacity) },
    squad: { id: new Int32Array(capacity).fill(-1) },
    health: { value: new Float32Array(capacity) },
    dead: {},
    captured: {},
    wounded: {},
    evacuated: {},
    casualty: { evacuateAt: new Int32Array(capacity).fill(-1), treatment: new Float32Array(capacity).fill(-1) },
    weapon: {
      kind: new Uint8Array(capacity),
      cooldown: new Float32Array(capacity),
      rounds: new Uint16Array(capacity),
      reloading: new Uint8Array(capacity),
      firedAt: new Int32Array(capacity).fill(NEVER)
    },
    target: { id: new Int32Array(capacity).fill(-1) },
    aim: { since: new Int32Array(capacity) },
    suppression: { value: new Float32Array(capacity) },
    morale: { value: new Float32Array(capacity) },
    stance: { value: new Uint8Array(capacity) },
    shelter: { lastShelled: new Int32Array(capacity).fill(NEVER), emergeAt: new Int32Array(capacity).fill(-1) },
    mask: {
      state: new Uint8Array(capacity),
      at: new Int32Array(capacity).fill(-1),
      clearSince: new Int32Array(capacity).fill(-1)
    },
    gasDose: { value: new Float32Array(capacity) },
    grenades: { count: new Uint8Array(capacity) },
    rifleGrenades: { count: new Uint8Array(capacity), readyAt: new Int32Array(capacity) },
    stamina: { value: new Float32Array(capacity), spent: new Uint8Array(capacity) }
  }
}
