import { type Client, Room } from "@colyseus/core"
import { joinSide, MESSAGE } from "@verdun/net"
import { STEP_SECONDS } from "@verdun/sim"
import { createPlayers } from "./players.ts"
import { createRelay } from "./relay.ts"
import type { Sector } from "./sector.ts"

/** Half a step, so the battle never runs more than half a step behind the clock. */
const LOOP_MS = (STEP_SECONDS * 1000) / 2

export interface SectorRoomOptions {
  readonly sector: Sector
  /** Lets the dev keys' commands through (`--dev`). */
  readonly dev: boolean
  readonly log: (line: string) => void
}

/**
 * The Colyseus room for a sector: it steps the battle on the real clock whether anyone is in it, gives each player who
 * joins a squad of their side, takes their commands, and sends everyone the battle ten times a second. Made once, when
 * the server starts, and never closed.
 */
export function sectorRoom({ sector, dev, log }: SectorRoomOptions) {
  const players = createPlayers(sector.sim, dev)
  const relay = createRelay(sector)
  sector.onStep(() => players.stepped())

  return class SectorRoom extends Room {
    override autoDispose = false

    override onCreate(): void {
      // The player's client has its handlers in place: now it can take the battle.
      this.onMessage(MESSAGE.ready, (client: Client) => {
        const squad = players.squadOf(client.sessionId)
        if (squad) {
          client.sendBytes(MESSAGE.joined, relay.welcome(squad.id))
        }
      })
      this.onMessage(MESSAGE.commands, (client: Client, commands: unknown) => {
        const refused = players.command(client.sessionId, commands)
        if (refused > 0) {
          log(`Refused ${refused} of ${client.sessionId}'s commands`)
        }
      })
      this.setSimulationInterval(() => {
        sector.advance(Date.now())
        const sync = relay.due(this.clients.length > 0)
        if (sync) {
          this.broadcastBytes(MESSAGE.sync, sync, {})
        }
        // After the sync, so a player's prediction starts again from the battle that has their commands in it.
        for (const [player, acknowledgement] of players.acknowledgements()) {
          this.clients.getById(player)?.send(MESSAGE.ack, acknowledgement)
        }
      }, LOOP_MS)
    }

    override onJoin(client: Client, options: unknown): void {
      const side = joinSide(options)
      const squad = players.join(client.sessionId, side)
      if (!squad) {
        throw new Error("Every squad of that side has a player, or has fallen")
      }
      log(`${client.sessionId} joined, leading squad ${squad.id}; ${this.clients.length} in the battle`)
    }

    override onLeave(client: Client): void {
      players.leave(client.sessionId)
      log(`${client.sessionId} left; the bots took over`)
    }
  }
}
