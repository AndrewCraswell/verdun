import { mapDepth, mapWidth } from "@verdun/map"
import { cellsNear, createSyncEncoder, type EncodedSync, NEAR_RADIUS, type Recipient } from "@verdun/net"
import { createSyncSource, isAlive, Side, soldierArrayLayout, type Squad } from "@verdun/sim"
import type { Sector } from "./sector.ts"
import { createInlineSight, SIGHT_SHARES, type SideSightModel } from "./sight.ts"

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
  /**
   * Who a squad's player is, for their message: the cells near its men still in the fight, which they're sent every
   * message, its side, whose sight of the enemy they're sent, and its men, of whom they're sent everything.
   */
  recipient(squad: Squad): Recipient
  /** A player has left. */
  forget(player: string): void
}

/**
 * `sight` is each side's sight of the enemy, looked at once a message: the server's works it out in a worker
 * (sight-thread.ts); by default, on this thread.
 */
export function createRelay(
  sector: Sector,
  every = SYNC_EVERY,
  sight: SideSightModel = createInlineSight(sector.sim, SIGHT_SHARES)
): Relay {
  const { sim } = sector
  const source = createSyncSource(sim)
  const encoder = createSyncEncoder(soldierArrayLayout(sim), mapWidth(sim.map), mapDepth(sim.map))
  // A first sync, so a player can be welcomed straight away.
  const first = source.take()
  encoder.encode(first, sight.look(first.ground))
  let steps = 0
  sector.onStep(() => {
    source.stepped()
    steps++
  })
  return {
    welcome(playerSquad) {
      const side = sim.squads[playerSquad]?.side ?? Side.French
      return encoder.welcome(playerSquad, side, sector.war.schedule, sector.reshapedGround())
    },
    due() {
      if (steps < every) {
        return null
      }
      steps = 0
      // Encoded even with no one to send it to: the next player is welcomed to this sync, and the next builds on it.
      const sync = source.take()
      return encoder.encode(sync, sight.look(sync.ground))
    },
    recipient(squad) {
      const { x, z } = sim.soldiers.position
      const men = squad.members.filter((member) => isAlive(sim, member))
      const near = cellsNear(
        encoder.grid,
        men.map((member) => ({ x: x[member], z: z[member] })),
        NEAR_RADIUS
      )
      return { near, side: squad.side, own: squad.members }
    },
    forget(player) {
      encoder.forget(player)
    }
  }
}
