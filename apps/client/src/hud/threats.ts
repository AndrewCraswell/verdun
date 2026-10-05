import { type EntityId, isAlive, Shell, type SimEvent, type Simulation, type Squad } from "@verdun/sim"

/**
 * Where the danger comes from, for marks at the screen's edge (H2's fire made directional, and the spec's visual sound
 * cues): rifle and machine-gun fire at or close past the man under control, from where it was fired; shells about to
 * land near him, at where they'll land. In trenches the question is always "from where?", and sound alone doesn't
 * tell a player who plays without it.
 */

export type ThreatKind = "fire" | "shell" | "heavy"

export interface Threat {
  readonly kind: ThreatKind
  /** Where it comes from: the shooter, or where the shell will land. */
  readonly x: number
  readonly z: number
  /** 1 when fresh (just fired, or about to land), falling to 0 as it passes. */
  readonly strength: number
}

/** A round passing this close to the man under control, in metres, is fire at him whether or not it was aimed so. */
const CLOSE_PAST = 5
/** Fire is marked this many seconds after the last round from that way. */
const FIRE_SECONDS = 1.6
/** Shells are marked from this many seconds before they land, within this many metres of him. */
const SHELL_WARNING = 3
const SHELL_NEAR = 45
/** Shots from one place merge into one mark: shooters within this many metres of each other. */
const SAME_PLACE = 6

export interface ThreatWatch {
  /** Takes one simulation step's events. */
  record(events: readonly SimEvent[]): void
  /** The danger now, seconds by the simulation's clock. */
  read(): Threat[]
}

export function createThreatWatch(sim: Simulation, squad: Squad, tickRate: number): ThreatWatch {
  let fire: { x: number; z: number; tick: number }[] = []

  const leader = (): EntityId | null => (squad.leader >= 0 && isAlive(sim, squad.leader) ? squad.leader : null)

  return {
    record(events) {
      const man = leader()
      if (man === null) {
        return
      }
      const mx = sim.soldiers.position.x[man]
      const mz = sim.soldiers.position.z[man]
      for (const event of events) {
        if (event.type !== "shot" || sim.soldiers.side.value[event.shooter] === squad.side) {
          continue
        }
        const close = event.target === man || Math.hypot(event.to.x - mx, event.to.z - mz) <= CLOSE_PAST
        if (!close) {
          continue
        }
        const same = fire.find((mark) => Math.hypot(mark.x - event.from.x, mark.z - event.from.z) <= SAME_PLACE)
        if (same) {
          same.tick = sim.tick
        } else {
          fire.push({ x: event.from.x, z: event.from.z, tick: sim.tick })
        }
      }
    },
    read() {
      const seconds = (tick: number) => (sim.tick - tick) / tickRate
      fire = fire.filter((mark) => seconds(mark.tick) < FIRE_SECONDS)
      const threats: Threat[] = fire.map((mark) => ({
        kind: "fire",
        x: mark.x,
        z: mark.z,
        strength: 1 - seconds(mark.tick) / FIRE_SECONDS
      }))
      const man = leader()
      if (man === null) {
        return threats
      }
      const mx = sim.soldiers.position.x[man]
      const mz = sim.soldiers.position.z[man]
      for (const shell of sim.artillery.shells) {
        const left = (shell.landsAtTick - sim.tick) / tickRate
        if (shell.shell === Shell.Grenade || left < 0 || left > SHELL_WARNING) {
          continue
        }
        if (Math.hypot(shell.x - mx, shell.z - mz) > SHELL_NEAR) {
          continue
        }
        threats.push({
          kind: shell.shell === Shell.HeavyHighExplosive ? "heavy" : "shell",
          x: shell.x,
          z: shell.z,
          strength: 1 - left / SHELL_WARNING
        })
      }
      return threats
    }
  }
}
