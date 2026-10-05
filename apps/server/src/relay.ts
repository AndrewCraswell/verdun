import { createSyncEncoder } from "@verdun/net"
import { createSyncSource } from "@verdun/sim"
import type { Sector } from "./sector.ts"

/** Players are sent the battle every this many steps: ten times a second. */
export const SYNC_EVERY = 2

/** Keeps every player's mirror of a sector's battle in step with it. */
export interface Relay {
  /** What a player joining to lead `playerSquad` is sent: the whole battle as of the last sync, craters and all. */
  welcome(playerSquad: number): Uint8Array
  /**
   * After the battle has stepped: what changed since the last sync, for every player, once `SYNC_EVERY` steps have been
   * taken; null when it isn't due, or when no one is `listening` to be sent it.
   */
  due(listening: boolean): Uint8Array | null
}

export function createRelay(sector: Sector, every = SYNC_EVERY): Relay {
  const source = createSyncSource(sector.sim)
  const encoder = createSyncEncoder()
  // A first sync, so a player can be welcomed straight away.
  encoder.encode(source.take())
  let steps = 0
  sector.onStep(() => {
    source.stepped()
    steps++
  })
  return {
    welcome(playerSquad) {
      return encoder.welcome(playerSquad, sector.war.schedule, sector.reshapedGround())
    },
    due(listening) {
      if (steps < every) {
        return null
      }
      steps = 0
      // Encoded even with no one listening: the next player is welcomed to this sync, and the next builds on it.
      const sync = encoder.encode(source.take())
      return listening ? sync : null
    }
  }
}
