import {
  arrivalOf,
  capturedIds,
  type EntityId,
  fallenIds,
  GRENADES_CARRIED,
  isAlive,
  MaskState,
  PINNED,
  Side,
  type SimEvent,
  type Simulation,
  type Squad,
  Stance,
  Shell,
  UNLIMITED,
  evacuatedIds,
  woundedIds
} from "@verdun/sim"
import { battleHour, weekLabel } from "../environment/calendar.ts"

/** How many messages the battle log keeps on screen. */
export const LOG_LENGTH = 6
/** Seconds a message stays in the log. */
const MESSAGE_SECONDS = 20

const SIDE_NAMES: Readonly<Record<Side, string>> = { [Side.French]: "French", [Side.German]: "Germans" }

/** What the soldier the player controls is doing. */
export interface SoldierStatus {
  readonly alive: boolean
  readonly stance: string
  readonly mask: string | null
  readonly grenades: string
  readonly pinned: boolean
  readonly wounded: boolean
}

/** One line of the battle log. */
export interface LogMessage {
  readonly text: string
  /** The simulation step it happened on. */
  readonly tick: number
  /** Whether it's bad news for the player's side. */
  readonly alarm: boolean
}

/** Everything the HUD shows, worked out from the simulation and nothing else. */
export interface HudModel {
  readonly soldier: SoldierStatus
  /** The player's squad: men still fighting, of how many, or when replacements arrive once it's wiped out. */
  readonly squad: string
  /** Men the side still holds back to replace wiped-out squads, or nothing if it has no reserves to draw on. */
  readonly reserves: string | null
  /** Each side's losses: killed, wounded (lying out or carried back) and taken prisoner. */
  readonly losses: readonly {
    readonly side: string
    readonly killed: number
    readonly wounded: number
    readonly captured: number
  }[]
  /** The sector's objectives and who holds each. */
  readonly objectives: readonly { readonly name: string; readonly holder: string; readonly contested: boolean }[]
  /** Shells the side's batteries have left, or nothing when the scenario sets no limit. */
  readonly shells: string | null
  /** The week of the war, and the battle's hour by French civil time. */
  readonly week: string
  readonly hour: string
}

function stanceName(stance: number): string {
  if (stance === Stance.Prone) {
    return "Lying down"
  }
  return stance === Stance.Sheltering ? "In a dugout" : "Standing"
}

function maskName(state: number): string | null {
  if (state === MaskState.Donning) {
    return "Pulling on gas mask"
  }
  return state === MaskState.On ? "Gas mask on" : null
}

/** The squad line: its strength, or once it's wiped out, how long until replacements reach the rear trench. */
function squadLine(sim: Simulation, squad: Squad, fighting: number, tickRate: number): string {
  if (fighting > 0) {
    return `Squad ${fighting} of ${squad.members.length}`
  }
  const arrival = arrivalOf(sim, squad)
  return arrival < 0
    ? "Squad wiped out"
    : `Squad wiped out: replacements in ${Math.max(1, Math.ceil((arrival - sim.tick) / tickRate))} s`
}

/** The HUD's view of the battle at this moment. */
export function hudModel(sim: Simulation, squad: Squad, tickRate: number): HudModel {
  const soldier: EntityId = squad.leader
  const alive = soldier >= 0 && isAlive(sim, soldier)
  const fighting = squad.members.filter((member) => isAlive(sim, member)).length
  const lying = new Set(woundedIds(sim))
  const killed = fallenIds(sim).filter((id) => !lying.has(id))
  const wounded = [...lying, ...evacuatedIds(sim)]
  const captured = capturedIds(sim)
  const count = (ids: readonly EntityId[], side: Side) =>
    ids.filter((id) => sim.soldiers.side.value[id] === side).length
  return {
    soldier: {
      alive,
      stance: alive ? stanceName(sim.soldiers.stance.value[soldier]) : "Fallen",
      mask: alive ? maskName(sim.soldiers.mask.state[soldier]) : null,
      grenades: alive ? `Grenades ${sim.soldiers.grenades.count[soldier]} of ${GRENADES_CARRIED}` : "",
      pinned: alive && sim.soldiers.suppression.value[soldier] >= PINNED,
      wounded: alive && sim.soldiers.health.value[soldier] < 1
    },
    squad: squadLine(sim, squad, fighting, tickRate),
    reserves:
      sim.reinforcements.full[squad.side] > 0
        ? `Reserves: ${Math.floor(sim.reinforcements.pool[squad.side])} men`
        : null,
    losses: [Side.French, Side.German].map((side) => ({
      side: SIDE_NAMES[side],
      killed: count(killed, side),
      wounded: count(wounded, side),
      captured: count(captured, side)
    })),
    objectives: sim.objectives.map((objective) => ({
      name: objective.name,
      holder: objective.holder === -1 ? "No one" : SIDE_NAMES[objective.holder],
      contested: objective.contested
    })),
    shells: shellsLine(sim, squad.side),
    week: weekLabel(sim.environment.clock.week),
    hour: battleHour(sim.environment.clock)
  }
}

const SHELL_NAMES: readonly (readonly [Shell, string])[] = [
  [Shell.FieldHighExplosive, "field"],
  [Shell.FieldShrapnel, "shrapnel"],
  [Shell.HeavyHighExplosive, "heavy"],
  [Shell.FieldGas, "gas"]
]

/** "Shells: 7,420 field, 960 shrapnel, 380 heavy, 500 gas", leaving out kinds with no limit. */
function shellsLine(sim: Simulation, side: Side): string | null {
  const stock = sim.artillery.ammunition[side]
  const counted = SHELL_NAMES.filter(([shell]) => (stock[shell] ?? UNLIMITED) < UNLIMITED).map(
    ([shell, name]) => `${(stock[shell] ?? 0).toLocaleString("en-GB")} ${name}`
  )
  return counted.length > 0 ? `Shells: ${counted.join(", ")}` : null
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
 * hands, counter-attacks, surrenders and the gas alarm are what a soldier would hear about.
 */
export function createBattleLog(sim: Simulation, squad: Squad, tickRate: number): BattleLog {
  const side = squad.side
  const enemy = side === Side.French ? Side.German : Side.French
  let messages: LogMessage[] = []
  let gasAlarm = false
  const say = (text: string, alarm: boolean) => messages.push({ text, tick: sim.tick, alarm })

  return {
    get messages() {
      return messages
    },
    record(events) {
      let prisoners = 0
      let surrendered = 0
      for (const event of events) {
        if (event.type === "objective-taken") {
          say(`${event.name} taken by the ${SIDE_NAMES[event.side]}`, event.side !== side)
        } else if (event.type === "counter-attack") {
          say(
            event.side === enemy
              ? "The enemy is shelling the lost trench: counter-attack coming"
              : "Counter-attack ordered",
            event.side === enemy
          )
        } else if (event.type === "reinforcement" && event.squad === squad.id) {
          say(`Replacements up in the rear trench: ${event.men} men`, false)
        } else if (event.type === "out-of-shells" && event.side === side) {
          const name = SHELL_NAMES.find(([shell]) => shell === event.shell)?.[1] ?? "artillery"
          say(`The batteries are out of ${name} shells`, true)
        } else if (event.type === "capture") {
          if (sim.soldiers.side.value[event.soldier] === enemy) {
            prisoners++
          } else {
            surrendered++
          }
        }
      }
      if (prisoners > 0) {
        say(`${prisoners} ${prisoners === 1 ? "prisoner" : "prisoners"} taken`, false)
      }
      if (surrendered > 0) {
        say(`${surrendered} of ours surrendered`, true)
      }
      // The gas alarm: the squad's own men pulling on their masks.
      const masking = squad.members.some(
        (member) => isAlive(sim, member) && sim.soldiers.mask.state[member] === MaskState.Donning
      )
      if (masking && !gasAlarm) {
        gasAlarm = true
        say("Gas! Masks on", true)
      } else if (squad.members.every((member) => sim.soldiers.mask.state[member] === MaskState.Off)) {
        gasAlarm = false
      }
      messages = messages.filter((message) => sim.tick - message.tick < MESSAGE_SECONDS * tickRate).slice(-LOG_LENGTH)
    }
  }
}
