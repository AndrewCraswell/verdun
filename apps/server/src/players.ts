import { type Acknowledgement, playerCommand } from "@verdun/net"
import { enqueueCommand, isAlive, type Side, type Simulation, type Squad } from "@verdun/sim"

/** The players in a sector, each leading a squad of their side while they're connected. */
export interface Players {
  /**
   * Gives a joining player a squad of their side that no one leads, the one nearest the middle of its line, as the local
   * game does; null when every squad of the side has a player or has fallen.
   */
  join(player: string, side: Side): Squad | null
  /** The squad a player leads, if they're in the battle. */
  squadOf(player: string): Squad | null
  /** Hands the player's squad back to its own orders, as every bot squad fights. */
  leave(player: string): void
  /**
   * Queues what the player's squad may do of what they sent (see `playerCommand`): a `CommandBatch`, or commands bare.
   * Returns the types of those refused, as sent, or "?" for what had none.
   */
  command(player: string, sent: unknown): string[]
  /** After every step the battle takes: the batches it has just applied are acknowledged. */
  stepped(): void
  /** The acknowledgements since the last asked, by player: each player's latest. */
  acknowledgements(): Map<string, Acknowledgement>
}

function isBatch(value: unknown): value is { readonly step: number; readonly commands: readonly unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "step" in value &&
    Number.isInteger(value.step) &&
    "commands" in value &&
    Array.isArray(value.commands)
  )
}

/** Whether a squad is free for a joining player: a front-line squad of bots with men still in the fight. */
function free(sim: Simulation, squad: Squad, side: Side, led: ReadonlySet<number>): boolean {
  return (
    squad.side === side &&
    squad.controller === "ai" &&
    !led.has(squad.id) &&
    squad.order.kind !== "reserve" &&
    squad.members.some((member) => isAlive(sim, member))
  )
}

/** `dev` lets the dev keys' commands through: see `playerCommand`. */
export function createPlayers(sim: Simulation, dev = false): Players {
  // The squad each player leads, by id: their command takes effect at the next step, so it's kept here meanwhile.
  const leading = new Map<string, number>()

  const squadOf = (player: string): Squad | null => sim.squads[leading.get(player) ?? -1] ?? null
  // Each player's last batch, by its step, waiting for the step that applies it, then for its acknowledgement to go.
  const waiting = new Map<string, number>()
  let applied = new Map<string, Acknowledgement>()

  return {
    join(player, side) {
      const led = new Set(leading.values())
      const candidates = sim.squads.filter((squad) => free(sim, squad, side, led))
      const squad = candidates[Math.floor(candidates.length / 2)]
      if (!squad) {
        return null
      }
      leading.set(player, squad.id)
      enqueueCommand(sim, { type: "squad-controller", squad: squad.id, controller: "player" })
      return squad
    },
    squadOf,
    leave(player) {
      const squad = squadOf(player)
      leading.delete(player)
      if (squad) {
        enqueueCommand(sim, { type: "squad-controller", squad: squad.id, controller: "ai" })
      }
    },
    command(player, sent) {
      const squad = squadOf(player)
      let commands: readonly unknown[] = Array.isArray(sent) ? sent : [sent]
      if (isBatch(sent)) {
        commands = sent.commands
        if (squad) {
          waiting.set(player, sent.step)
        }
      }
      const refused: string[] = []
      for (const value of commands) {
        const command = squad ? playerCommand(sim, squad, value, dev) : null
        if (command) {
          enqueueCommand(sim, command)
        } else {
          const type = typeof value === "object" && value !== null && "type" in value ? value.type : null
          refused.push(typeof type === "string" ? type : "?")
        }
      }
      return refused
    },
    stepped() {
      for (const [player, step] of waiting) {
        applied.set(player, { step, tick: sim.tick })
      }
      waiting.clear()
    },
    acknowledgements() {
      const taken = applied
      applied = new Map()
      return taken
    }
  }
}
