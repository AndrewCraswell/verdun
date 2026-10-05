import type { Command, SimSync, WeatherRegion } from "@verdun/sim"

/** What the battle is: everything the worker needs to make the same simulation the page mirrors. */
export interface BattleSetup {
  /** The Fleury sector's elevation, as fetched: the map is generated from it on both sides. */
  readonly elevation: ArrayBuffer
  readonly mapSeed: number
  readonly simSeed: number
  readonly region: WeatherRegion
  readonly weatherSeed: number
}

/** From the page to the worker. */
export type ToWorker =
  | { readonly type: "start"; readonly setup: BattleSetup }
  /** Commands the page has queued, then this many steps to take. */
  | { readonly type: "step"; readonly commands: readonly Command[]; readonly steps: number }

/** What the player's squad can see, worked out beside the simulation: the fog's ground cells, and the enemies in sight. */
export interface SightLook {
  readonly ground: Uint8Array
  readonly enemies: Int32Array
}

/** From the worker to the page. */
export type FromWorker =
  /** The battle is set up: the player's squad, and the state to mirror. */
  | { readonly type: "started"; readonly playerSquad: number; readonly sync: SimSync }
  /** Steps taken, and, when it has looked again, what the squad can see. */
  | { readonly type: "stepped"; readonly sync: SimSync; readonly sight: SightLook | null }
  | { readonly type: "failed"; readonly message: string }
