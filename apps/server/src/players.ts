import { playerCommand } from "@verdun/net"
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
  /** Queues what the player's squad may do of what they sent (see `playerCommand`); returns how many were refused. */
  command(player: string, commands: unknown): number
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
    command(player, commands) {
      const squad = squadOf(player)
      const sent: readonly unknown[] = Array.isArray(commands) ? commands : [commands]
      let refused = 0
      for (const value of sent) {
        const command = squad ? playerCommand(sim, squad, value, dev) : null
        if (command) {
          enqueueCommand(sim, command)
        } else {
          refused++
        }
      }
      return refused
    }
  }
}
