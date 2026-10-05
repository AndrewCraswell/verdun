import { mapDepth, mapWidth } from "@verdun/map"
import { cellsNear, NEAR_RADIUS, type Recipient } from "@verdun/net"
import { createSyncSource, isAlive, Side, soldierArrayLayout, type Squad } from "@verdun/sim"
import { createInlineEncoding, type Encoding, type EncodingShape, type Messages } from "./encoding.ts"
import type { Sector } from "./sector.ts"
import { createInlineSight, SIGHT_SHARES, type SideSightModel } from "./sight.ts"

/** Players are sent the battle every this many steps: ten times a second. */
export const SYNC_EVERY = 2

/** Keeps every player's mirror of a sector's battle in step with it. */
export interface Relay {
  /**
   * Calls `deliver` with what a player joining to lead `playerSquad` is sent: the whole battle as of the last sync,
   * craters and all, which the next sync's message builds on.
   */
  welcome(playerSquad: number, deliver: (welcome: Uint8Array) => void): void
  /**
   * After the battle has stepped: once `SYNC_EVERY` steps have been taken, encodes what changed since the last sync
   * for `recipients()` (by player) and calls `deliver` with each one's message, at once or once encoded elsewhere, syncs
   * in the order taken. Returns whether a sync was due.
   */
  sync(
    recipients: () => ReadonlyMap<string, Recipient>,
    deliver: (messages: Messages, encodeMs: number) => void
  ): boolean
  /**
   * Who a squad's player is, for their message: the cells near its men still in the fight, which they're sent every
   * message, its side, whose sight of the enemy they're sent, and its men, of whom they're sent everything.
   */
  recipient(squad: Squad): Recipient
  /** A player has left. */
  forget(player: string): void
}

/** What a sector's encoding is made from. */
export function encodingShape(sector: Sector): EncodingShape {
  const { sim } = sector
  return { layout: soldierArrayLayout(sim), width: mapWidth(sim.map), depth: mapDepth(sim.map) }
}

/**
 * `sight` is each side's sight of the enemy, looked at once a message, and `encoding` what makes each player's message:
 * the server's work in worker threads (sight-thread.ts, encoding-thread.ts); by default, on this thread.
 */
export function createRelay(
  sector: Sector,
  every = SYNC_EVERY,
  sight: SideSightModel = createInlineSight(sector.sim, SIGHT_SHARES),
  encoding: Encoding = createInlineEncoding(encodingShape(sector))
): Relay {
  const { sim } = sector
  const source = createSyncSource(sim)
  // A first sync, so a player can be welcomed straight away.
  const first = source.take()
  encoding.encode(first, sight.look(first.ground), new Map(), () => undefined)
  let steps = 0
  sector.onStep(() => {
    source.stepped()
    steps++
  })
  return {
    welcome(playerSquad, deliver) {
      const side = sim.squads[playerSquad]?.side ?? Side.French
      encoding.welcome(playerSquad, side, sector.war.schedule, sector.reshapedGround(), deliver)
    },
    sync(recipients, deliver) {
      if (steps < every) {
        return false
      }
      steps = 0
      // Encoded even with no one to send it to: the next player is welcomed to this sync, and the next builds on it.
      const sync = source.take()
      encoding.encode(sync, sight.look(sync.ground), recipients(), deliver)
      return true
    },
    recipient(squad) {
      const { x, z } = sim.soldiers.position
      const men = squad.members.filter((member) => isAlive(sim, member))
      const near = cellsNear(
        encoding.grid,
        men.map((member) => ({ x: x[member], z: z[member] })),
        NEAR_RADIUS
      )
      return { near, side: squad.side, own: squad.members }
    },
    forget(player) {
      encoding.forget(player)
    }
  }
}
