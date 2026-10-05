import { type Command, type EntityId, type Simulation, STEP_SECONDS, type Steering, steeredPosition } from "@verdun/sim"

/**
 * Client-side prediction for the soldier the player controls, when a server runs the battle. The server's word on him
 * comes back a round trip after the player's keys, so the page moves him itself: from where the server last had him, it
 * replays the steering the server hasn't yet applied, step by step, with the simulation's own arithmetic
 * (`steeredPosition`), and shows him facing where the player last aimed. Each sync from the server starts it afresh from
 * the server's position, so a man the server stopped (a wall, the wire) is corrected within a message.
 *
 * Steps are counted twice: the page's own (its clock at the simulation's rate) and the server's ticks. The server
 * acknowledges each batch of commands with the tick it applied them at, which ties the two together.
 */
export interface Prediction {
  /** Notes the commands the page sent at its step `step`: its controlled soldier's steering and aim among them. */
  sent(step: number, commands: readonly Command[]): void
  /** The server applied the page's commands of its step `step` at its tick `tick`. */
  acknowledged(step: number, tick: number): void
  /** The server's word on the battle, as of its tick `tick`, has just been taken into the mirror. */
  synced(tick: number): void
  /** Puts `soldier` in the mirror where the page's own steering has him by its step `step`. */
  predict(step: number, soldier: EntityId): void
}

/** At most this many steps are replayed: a round trip longer than two seconds isn't worth guessing across. */
const MOST_STEPS = 40

interface Steered {
  readonly step: number
  readonly soldier: EntityId
  readonly steering: Steering
}

export function createPrediction(mirror: Simulation): Prediction {
  const { position, facing } = mirror.soldiers
  // The steering the page sent, oldest first: kept while the server may not have applied it.
  let steered: Steered[] = []
  let aim: { readonly soldier: EntityId; readonly x: number; readonly z: number } | null = null
  // The server's tick, less the page's step, as of the last acknowledgement; null until there's been one.
  let offset: number | null = null
  let tick = 0
  // The server's own position for the soldier, as of the last sync.
  let server: { readonly soldier: EntityId; readonly x: number; readonly z: number } | null = null
  let fresh = false

  /** The soldier's steering in effect at the page's step `step`: the last sent by then, or none. */
  const steeringAt = (soldier: EntityId, step: number): Steering | null => {
    let found: Steering | null = null
    for (const entry of steered) {
      if (entry.step > step) {
        break
      }
      if (entry.soldier === soldier) {
        found = entry.steering
      }
    }
    return found
  }

  return {
    sent(step, commands) {
      for (const command of commands) {
        if (command.type === "steer") {
          steered.push({ step, soldier: command.soldier, steering: { x: command.x, z: command.z, run: !!command.run } })
        } else if (command.type === "face") {
          aim = { soldier: command.soldier, x: command.x, z: command.z }
        }
      }
    },
    acknowledged(step, at) {
      offset = at - step
    },
    synced(at) {
      tick = at
      fresh = true
    },
    predict(step, soldier) {
      if (fresh || server?.soldier !== soldier) {
        server = { soldier, x: position.x[soldier], z: position.z[soldier] }
        fresh = false
      }
      position.x[soldier] = server.x
      position.z[soldier] = server.z
      if (aim?.soldier === soldier) {
        const length = Math.sqrt(aim.x * aim.x + aim.z * aim.z)
        if (length > 0) {
          facing.x[soldier] = aim.x / length
          facing.z[soldier] = aim.z / length
        }
      }
      if (offset === null) {
        return
      }
      // The page's step the server's last sync stands at: everything the page sent after it is still to come.
      const from = tick - offset
      // What's older than the sync is in the server's word already, but for the last steering, still in force.
      const current = steeringAt(soldier, from)
      steered = steered.filter((entry) => entry.step > from)
      if (current) {
        steered.unshift({ step: from, soldier, steering: current })
      }
      for (let at = Math.max(from + 1, step - MOST_STEPS + 1); at <= step; at++) {
        const steering = steeringAt(soldier, at)
        if (steering) {
          const next = steeredPosition(mirror, soldier, steering, STEP_SECONDS)
          position.x[soldier] = next.x
          position.z[soldier] = next.z
        }
      }
    }
  }
}
