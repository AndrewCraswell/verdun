import { mapDepth, mapWidth } from "@verdun/map"
import { cellsNear, createSyncEncoder, type EncodedSync, NEAR_RADIUS } from "@verdun/net"
import { createSyncSource, isAlive, soldierArrayLayout, type Squad } from "@verdun/sim"
import type { Sector } from "./sector.ts"

/** Players are sent the battle every this many steps: ten times a second. */
export const SYNC_EVERY = 2

/** Keeps every player's mirror of a sector's battle in step with it. */
export interface Relay {
  /** What a player joining to lead `playerSquad` is sent: the whole battle as of the last sync, craters and all. */
  welcome(playerSquad: number): Uint8Array
  /**
   * After the battle has stepped: what changed since the last sync, once `SYNC_EVERY` steps have been taken, to make
   * each player's message from (`EncodedSync.for`); null when it isn't due.
   */
  due(): EncodedSync | null
  /** The cells near a squad's men still in the fight, which its player is sent every message. */
  nearCells(squad: Squad): Set<number>
  /** A player has left. */
  forget(player: string): void
}

export function createRelay(sector: Sector, every = SYNC_EVERY): Relay {
  const { sim } = sector
  const source = createSyncSource(sim)
  const encoder = createSyncEncoder(soldierArrayLayout(sim), mapWidth(sim.map), mapDepth(sim.map))
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
    due() {
      if (steps < every) {
        return null
      }
      steps = 0
      // Encoded even with no one to send it to: the next player is welcomed to this sync, and the next builds on it.
      return encoder.encode(source.take())
    },
    nearCells(squad) {
      const { x, z } = sim.soldiers.position
      const men = squad.members.filter((member) => isAlive(sim, member))
      return cellsNear(
        encoder.grid,
        men.map((member) => ({ x: x[member], z: z[member] })),
        NEAR_RADIUS
      )
    },
    forget(player) {
      encoder.forget(player)
    }
  }
}
