import {
  type CasualtyKind,
  DAY,
  type EntityId,
  isAlive,
  isStandTo,
  MaskState,
  type OperationResult,
  Shell,
  Side,
  type SimEvent,
  type Simulation,
  type Squad,
  WeatherPattern
} from "@verdun/sim"
import { missionsOf } from "./fire-support.ts"
import type { SquadNames } from "./squad-names.ts"
import { direction } from "./squad-order.ts"

/** How an operation ended, for the attackers and for the defenders. */
const OUTCOMES: Readonly<Record<OperationResult, readonly [string, string]>> = {
  taken: ["their line is taken", "our line is lost"],
  footing: ["a footing gained in their line", "a footing lost in our line"],
  repulsed: ["the attack was thrown back", "we held"]
}

/** What a line of the log is about, for its mark: bad news, the squad's own men, the sector, the guns, the sky. */
export type LogKind = "alarm" | "squad" | "sector" | "fire" | "weather"

/** One line of the battle log. */
export interface LogMessage {
  /** Unique for the life of the log, so views can tell new lines from old. */
  readonly id: number
  readonly text: string
  /** The simulation step it was last said on: merged lines move up to the latest. */
  readonly tick: number
  readonly kind: LogKind
  /** Whether it's bad news for the player's side. */
  readonly alarm: boolean
}

/** How many messages the battle log keeps. */
export const LOG_LENGTH = 6
/** Seconds a message stays in the log. */
const MESSAGE_SECONDS = 20
/** A count said again within this many seconds adds to the line already up rather than adding another. */
const MERGE_SECONDS = 10

const SIDE_NAMES: Readonly<Record<Side, string>> = { [Side.French]: "French", [Side.German]: "Germans" }

const SHELL_NAMES: readonly (readonly [Shell, string])[] = [
  [Shell.FieldHighExplosive, "field"],
  [Shell.FieldShrapnel, "shrapnel"],
  [Shell.HeavyHighExplosive, "heavy"],
  [Shell.FieldGas, "gas"]
]

/** What hit a man, as his mates would say it. */
const CAUSES: Readonly<Record<CasualtyKind, string>> = {
  rifle: "by a rifle bullet",
  "machine-gun": "by machine-gun fire",
  shell: "by a shell",
  grenade: "by a grenade",
  gas: "by gas",
  other: ""
}

/** The sky turning, as the men would remark on it. */
const WEATHER_TURNS: Readonly<Record<WeatherPattern, string>> = {
  [WeatherPattern.Clear]: "The sky is clearing",
  [WeatherPattern.Fair]: "Fair weather coming in",
  [WeatherPattern.Overcast]: "Clouding over",
  [WeatherPattern.Fog]: "Fog coming down",
  [WeatherPattern.Drizzle]: "Drizzle setting in",
  [WeatherPattern.Rain]: "Rain setting in",
  [WeatherPattern.Storm]: "A thunderstorm is breaking"
}

/** The battle log: what a soldier on the player's side hears about, as it happens. */
export interface BattleLog {
  /** Adds the log lines for one simulation step's events. Call after every step. */
  record(events: readonly SimEvent[]): void
  /** The recent messages, newest last. */
  readonly messages: readonly LogMessage[]
}

/**
 * A battle log from the point of view of the player's side. Shots and shell bursts are too frequent to log; changes of
 * hands, counter-attacks, surrenders, the gas alarm, the guns called, the weather turning and what happens to the men of
 * the player's own squad, by name, are what a soldier would hear about. No kill feed: the enemy's dead aren't counted
 * out one by one.
 */
export function createBattleLog(sim: Simulation, squad: Squad, tickRate: number, names: SquadNames): BattleLog {
  const side = squad.side
  const enemy = side === Side.French ? Side.German : Side.French
  let messages: LogMessage[] = []
  let nextId = 0
  let gasAlarm = false
  let missionsSeen = sim.artillery.missions.length
  let pattern: WeatherPattern = sim.environment.weather.pattern
  let standTo = isStandTo(sim)
  const counts = new Map<string, { readonly id: number; readonly count: number }>()
  const hurt = new Set<EntityId>()

  function say(text: string, kind: LogKind, alarm: boolean): void {
    messages.push({ id: nextId++, text, tick: sim.tick, kind, alarm })
  }

  /** A line counting something, merged with the same count said in the last few seconds. */
  function count(key: string, added: number, text: (total: number) => string, kind: LogKind, alarm: boolean): void {
    const previous = counts.get(key)
    const recent = previous && messages.find((message) => message.id === previous.id)
    if (previous && recent && sim.tick - recent.tick < MERGE_SECONDS * tickRate) {
      const total = previous.count + added
      messages = messages.filter((message) => message.id !== previous.id)
      messages.push({ ...recent, text: text(total), tick: sim.tick })
      counts.set(key, { id: previous.id, count: total })
      return
    }
    const id = nextId
    say(text(added), kind, alarm)
    counts.set(key, { id, count: added })
  }

  const inSquad = (soldier: EntityId) => squad.members.includes(soldier)
  const who = (soldier: EntityId) => {
    const name = names.nameOf(sim, squad, soldier)
    return `${name.rank} ${name.surname}`
  }

  /** What happens to a man of the player's own squad, by name. Returns whether the event was his. */
  function squadEvent(event: SimEvent): boolean {
    switch (event.type) {
      case "fallen": {
        if (!inSquad(event.soldier)) {
          return false
        }
        const cause =
          event.cause.kind === "shell" && event.cause.by === side ? "by our own shells" : CAUSES[event.cause.kind]
        const how = cause ? ` ${cause}` : ""
        const fate = event.killed ? "killed" : "is down, wounded"
        say(`${who(event.soldier)} ${fate}${how}`, "squad", true)
        return true
      }
      case "capture":
        if (!inSquad(event.soldier)) {
          return false
        }
        say(`${who(event.soldier)} taken prisoner`, "squad", true)
        return true
      case "arrived-at-aid-post":
      case "returned-to-duty":
      case "died-of-wounds": {
        if (!inSquad(event.soldier)) {
          return false
        }
        const fates = {
          "arrived-at-aid-post": ["reached the aid post", false],
          "returned-to-duty": ["is patched up and back in the reserves", false],
          "died-of-wounds": ["died of his wounds", true]
        } as const
        const [fate, alarm] = fates[event.type]
        say(`${who(event.soldier)} ${fate}`, "squad", alarm)
        return true
      }
      default:
        return false
    }
  }

  return {
    get messages() {
      return messages
    },
    record(events) {
      let prisoners = 0
      let surrendered = 0
      for (const event of events) {
        if (squadEvent(event)) {
          continue
        }
        if (event.type === "objective-taken") {
          say(
            `${event.name} taken by the ${SIDE_NAMES[event.side]}`,
            event.side === side ? "sector" : "alarm",
            event.side !== side
          )
        } else if (event.type === "counter-attack") {
          say(
            event.side === enemy
              ? "The enemy is shelling the lost trench: counter-attack coming"
              : "Counter-attack ordered",
            event.side === enemy ? "alarm" : "sector",
            event.side === enemy
          )
        } else if (event.type === "reinforcement" && event.squad === squad.id) {
          say(`Replacements up in the rear trench: ${event.men} men`, "squad", false)
        } else if (event.type === "zero-hour") {
          say(
            event.side === side ? "Zero hour: the first wave goes over" : "They're coming: the enemy is over the top",
            event.side === side ? "sector" : "alarm",
            event.side !== side
          )
        } else if (event.type === "second-wave") {
          const count = event.squads.length
          say(
            event.side === side
              ? `The second wave goes forward: ${count} ${count === 1 ? "squad" : "squads"}`
              : "Enemy reserves are coming forward",
            event.side === side ? "sector" : "alarm",
            event.side !== side
          )
        } else if (event.type === "operation-over") {
          const attacking = sim.operation?.plan.side === side
          say(
            `${attacking ? "The operation" : "The attack"} is over: ${OUTCOMES[event.result][attacking ? 0 : 1]}`,
            "sector",
            false
          )
        } else if (event.type === "squad-taken-over" && event.squad === squad.id) {
          const leader = squad.leader >= 0 ? names.nameOf(sim, squad, squad.leader) : null
          say(
            leader
              ? `You take over ${leader.rank} ${leader.surname}'s squad: ${event.men} men`
              : `You take over a squad: ${event.men} men`,
            "squad",
            false
          )
        } else if (event.type === "gun-manned" && event.squad === squad.id) {
          const gunner = names.nameOf(sim, squad, event.soldier)
          say(`${gunner.rank} ${gunner.surname} takes over the machine gun`, "squad", false)
        } else if (event.type === "gun-spotted") {
          if (event.side === side) {
            const leader = squad.leader
            const where =
              leader >= 0
                ? `, ${direction({ x: sim.soldiers.position.x[leader], z: sim.soldiers.position.z[leader] }, event)}`
                : ""
            say(`Enemy machine gun spotted${where}`, "sector", false)
          } else {
            const ours = squad.members.includes(event.soldier)
            say(
              ours
                ? "The enemy has spotted your machine gun: move it"
                : "The enemy has spotted one of our machine guns",
              "alarm",
              ours
            )
          }
        } else if (event.type === "counter-thrust") {
          say(
            event.side === side
              ? `Reserves counter-attack the break-in: ${event.squads} ${event.squads === 1 ? "squad" : "squads"}`
              : "The enemy's reserves are counter-attacking the break-in",
            event.side === side ? "sector" : "alarm",
            event.side !== side
          )
        } else if (event.type === "reserves-up") {
          say(
            event.side === side
              ? `Reserves going up to the line: ${event.squads} ${event.squads === 1 ? "squad" : "squads"}`
              : "Enemy reserves moving up",
            "sector",
            false
          )
        } else if (event.type === "out-of-shells" && event.side === side) {
          const name = SHELL_NAMES.find(([shell]) => shell === event.shell)?.[1] ?? "artillery"
          say(`The batteries are out of ${name} shells`, "alarm", true)
        } else if (event.type === "capture") {
          if (sim.soldiers.side.value[event.soldier] === enemy) {
            prisoners++
          } else {
            surrendered++
          }
        }
      }
      if (prisoners > 0) {
        count("prisoners", prisoners, (n) => `${n} ${n === 1 ? "prisoner" : "prisoners"} taken`, "sector", false)
      }
      if (surrendered > 0) {
        count("surrendered", surrendered, (n) => `${n} of ours surrendered`, "alarm", true)
      }
      // A man of the squad hit but still fighting.
      for (const member of squad.members) {
        if (!hurt.has(member) && isAlive(sim, member) && sim.soldiers.health.value[member] < 1) {
          hurt.add(member)
          say(`${who(member)} wounded, still fighting`, "squad", true)
        }
      }
      // The gas alarm: the squad's own men pulling on their masks.
      const masking = squad.members.some(
        (member) => isAlive(sim, member) && sim.soldiers.mask.state[member] === MaskState.Donning
      )
      if (masking && !gasAlarm) {
        gasAlarm = true
        say("Gas! Masks on", "alarm", true)
      } else if (squad.members.every((member) => sim.soldiers.mask.state[member] === MaskState.Off)) {
        gasAlarm = false
      }
      // Our guns called: each group of missions ordered together, once.
      if (sim.artillery.missions.length > missionsSeen) {
        const leader = squad.leader
        const from = leader >= 0 ? { x: sim.soldiers.position.x[leader], z: sim.soldiers.position.z[leader] } : null
        for (const mission of missionsOf(sim, side, tickRate, from)) {
          if (mission.id >= missionsSeen) {
            const when = mission.phase === "pending" ? `: rounds in ${Math.ceil(mission.seconds)} s` : ""
            say(`${mission.label}, ${mission.place}${when}`, "fire", false)
          }
        }
        missionsSeen = sim.artillery.missions.length
      }
      // The sky, and the stand-to at dawn and dusk.
      if (sim.environment.weather.pattern !== pattern) {
        pattern = sim.environment.weather.pattern
        say(WEATHER_TURNS[pattern], "weather", false)
      }
      const standing = isStandTo(sim)
      if (standing && !standTo) {
        // Dawn comes before noon, dusk after: the stand-tos are hours either side of it.
        const dawn = sim.environment.clock.elapsed % DAY < DAY / 2
        say(`Stand-to: ${dawn ? "dawn" : "dusk"}, every man to the fire step`, "sector", false)
      }
      standTo = standing
      messages = messages.filter((message) => sim.tick - message.tick < MESSAGE_SECONDS * tickRate).slice(-LOG_LENGTH)
    }
  }
}
