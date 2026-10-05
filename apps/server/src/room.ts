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
  /** Logs how the room keeps up every this many milliseconds (`--stats`), for the load test; never if absent. */
  readonly statsEvery?: number
}

/** How the room kept up since the last report: the battle's steps, the messages, and how long each took. */
function createStats() {
  let steps = 0
  let stepMs: number[] = []
  let encodeMs = 0
  let messages = 0
  let bytes = 0
  let since = performance.now()
  // Each of the step's systems, by name: its milliseconds in all since the last report.
  let systems = new Map<string, number>()
  return {
    /** Times one of the step's systems: the simulation's `systemTimer`. */
    system(name: string, work: () => void) {
      const started = performance.now()
      work()
      systems.set(name, (systems.get(name) ?? 0) + performance.now() - started)
    },
    stepped(ms: number, count: number) {
      steps += count
      if (count > 0) {
        stepMs.push(ms / count)
      }
    },
    sent(ms: number, size: number) {
      encodeMs += ms
      messages++
      bytes += size
    },
    report(players: number): string {
      const seconds = (performance.now() - since) / 1000
      stepMs.sort((a, b) => a - b)
      const at = (fraction: number) =>
        (stepMs[Math.min(stepMs.length - 1, Math.floor(stepMs.length * fraction))] ?? 0).toFixed(1)
      const mean = stepMs.reduce((sum, ms) => sum + ms, 0) / Math.max(1, stepMs.length)
      const memory = process.memoryUsage().heapUsed / 1048576
      const line =
        `stats: ${players} players, ${(steps / seconds).toFixed(1)} steps/s, step ${mean.toFixed(1)} ms mean, ` +
        `${at(0.95)} p95, ${at(1)} max; ${messages} messages, ${(bytes / Math.max(1, messages) / 1024).toFixed(1)} KB each, ` +
        `${(bytes / seconds / 1024).toFixed(1)} KB/s a player, encode ${(encodeMs / Math.max(1, messages)).toFixed(1)} ms; ` +
        `heap ${memory.toFixed(0)} MB; per step, ` +
        [...systems]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, ms]) => `${name.replace("sim: ", "")} ${(ms / Math.max(1, steps)).toFixed(1)} ms`)
          .join(", ")
      systems = new Map()
      steps = 0
      stepMs = []
      encodeMs = 0
      messages = 0
      bytes = 0
      since = performance.now()
      return line
    }
  }
}

/**
 * The Colyseus room for a sector: it steps the battle on the real clock whether anyone is in it, gives each player who
 * joins a squad of their side, takes their commands, and sends everyone the battle ten times a second. Made once, when
 * the server starts, and never closed.
 */
export function sectorRoom({ sector, dev, log, statsEvery }: SectorRoomOptions) {
  const players = createPlayers(sector.sim, dev)
  const relay = createRelay(sector)
  sector.onStep(() => players.stepped())
  const stats = createStats()
  let reported = performance.now()
  if (statsEvery !== undefined) {
    sector.sim.systemTimer = (name, work) => stats.system(name, work)
  }

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
        const started = performance.now()
        const steps = sector.advance(Date.now())
        const stepped = performance.now()
        const sync = relay.due()
        if (sync) {
          // One encoding for everyone; each player's message is its parts for the cells near their men.
          let bytes = 0
          for (const client of this.clients) {
            const squad = players.squadOf(client.sessionId)
            const message = sync.for(client.sessionId, squad ? relay.nearCells(squad) : new Set())
            client.sendBytes(MESSAGE.sync, message)
            bytes += message.byteLength
          }
          stats.sent(performance.now() - stepped, this.clients.length > 0 ? bytes / this.clients.length : 0)
        }
        stats.stepped(stepped - started, steps)
        if (statsEvery !== undefined && performance.now() - reported >= statsEvery) {
          reported = performance.now()
          log(stats.report(this.clients.length))
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
      relay.forget(client.sessionId)
      log(`${client.sessionId} left; the bots took over`)
    }
  }
}
