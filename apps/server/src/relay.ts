import { encodeJoined, encodeSync } from "@verdun/net"
import { createSyncSource } from "@verdun/sim"
import type { Sector } from "./sector.ts"

/** Players are sent the battle every this many steps: ten times a second. */
export const SYNC_EVERY = 2

/** Keeps every player's mirror of a sector's battle in step with it. */
export interface Relay {
  /** What a player joining to lead `playerSquad` is sent: the whole battle as it stands, craters and all. */
  welcome(playerSquad: number): Uint8Array
  /**
   * After the battle has stepped: what changed since the last sync, for every player, once `SYNC_EVERY` steps have been
   * taken; null when it isn't due, or when no one is `listening` to be sent it.
   */
  due(listening: boolean): Uint8Array | null
}

export function createRelay(sector: Sector, every = SYNC_EVERY): Relay {
  const source = createSyncSource(sector.sim)
  let steps = 0
  sector.onStep(() => {
    source.stepped()
    steps++
  })
  return {
    welcome(playerSquad) {
      // A source of its own, so the first sync carries the wire and the clouds whole; the shared one's next sync brings
      // the player the steps since.
      const sync = createSyncSource(sector.sim).take()
      const ground = sector.reshapedGround()
      return encodeJoined({
        playerSquad,
        schedule: sector.war.schedule,
        sync: { ...sync, ground: ground ? [ground] : [] }
      })
    },
    due(listening) {
      if (steps < every) {
        return null
      }
      steps = 0
      // Taken even with no one listening, so the steps don't pile up for the next player.
      const sync = source.take()
      return listening ? encodeSync(sync) : null
    }
  }
}
