import { mapWidth } from "@verdun/map"
import { type FireMission, Shell, type Side, type Simulation, UNLIMITED } from "@verdun/sim"
import { keyOf } from "./keys.ts"

/**
 * The guns, as the HUD's fire-support panel shows them: the calls the player can make, the fire missions of their side
 * in progress, and the shells left. Worked out from the simulation and nothing else.
 */

/** The prototype's four calls, on the keys ui/bindings.ts lists for them. */
export type CallId = "bombard" | "fire" | "gas" | "whistle"

export interface CallView {
  readonly id: CallId
  readonly key: string
  readonly label: string
  readonly detail: string
  /** Whether it would fire now: there are shells for it, and it isn't already going. */
  readonly available: boolean
  /** Why it isn't available, in a few words. */
  readonly reason: string | null
  /** A mission of this kind is in progress. */
  readonly active: boolean
}

/** What a group of missions ordered together amounts to. */
export type MissionKind = "bombardment" | "creeping" | "gas" | "fire"

/** Where one mission's rounds fall: a band `band` metres deep around `z`, from `fromX` to `toX`. */
export interface Footprint {
  readonly fromX: number
  readonly toX: number
  readonly z: number
  readonly band: number
}

export interface MissionView {
  /** The first mission's id: stable for the life of the group. */
  readonly id: number
  readonly kind: MissionKind
  readonly label: string
  /** Where it falls, in words: "the enemy line", "near Fleury crossroads". */
  readonly place: string
  /** Waiting for the first rounds, firing, or (a creeping barrage) firing with the next lift coming. */
  readonly phase: "pending" | "firing"
  /** Seconds to the first rounds while pending; seconds of fire left, or to the next lift, once firing. */
  readonly seconds: number
  /** How far through the wait or the fire it is, from 0 to 1. */
  readonly progress: number
  readonly shells: readonly Shell[]
  readonly footprints: readonly Footprint[]
  /** A creeping barrage's line now, x across and z, and the way it creeps (+1 north, -1 south); null otherwise. */
  readonly creep: { readonly z: number; readonly direction: number } | null
}

export interface ShellStock {
  readonly shell: Shell
  readonly label: string
  readonly left: number
  /** Left of the most the side has held, from 0 to 1. */
  readonly share: number
}

export interface FireSupportView {
  readonly calls: readonly CallView[]
  readonly missions: readonly MissionView[]
  /** Kinds of shell the scenario counts; none when it sets no limit. */
  readonly shells: readonly ShellStock[]
  /** Our side's defensive barrage has been called. */
  readonly sos: boolean
}

const SHELL_LABELS: readonly (readonly [Shell, string])[] = [
  [Shell.FieldHighExplosive, "Field HE"],
  [Shell.FieldShrapnel, "Shrapnel"],
  [Shell.HeavyHighExplosive, "Heavy HE"],
  [Shell.FieldGas, "Gas"]
]

/** Within this many metres of an objective, a target is named after it. */
const NAMED_WITHIN = 120
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const

/** A mission covering this share of the map's width is fired along the whole front. */
const WHOLE_FRONT = 0.8

function groupKind(missions: readonly FireMission[], width: number): MissionKind {
  if (missions.some((mission) => mission.creep)) {
    return "creeping"
  }
  if (missions.every((mission) => mission.shell === Shell.FieldGas)) {
    return "gas"
  }
  const wide = missions.every((mission) => mission.toX - mission.fromX >= WHOLE_FRONT * width)
  return wide && missions.length > 1 ? "bombardment" : "fire"
}

const KIND_LABELS: Readonly<Record<MissionKind, string>> = {
  bombardment: "Bombardment",
  creeping: "Creeping barrage",
  gas: "Gas shoot",
  fire: "Fire mission"
}

/** A place's name inside a sentence: "The mine craters" reads "the mine craters" after "near". */
function inSentence(name: string): string {
  return name.startsWith("The ") ? `the ${name.slice(4)}` : name
}

/** Words for where a group of missions falls. */
function placeOf(sim: Simulation, missions: readonly FireMission[], from: { x: number; z: number } | null): string {
  const width = mapWidth(sim.map)
  const [first] = missions
  if (!first) {
    return ""
  }
  if (first.toX - first.fromX >= WHOLE_FRONT * width) {
    return first.creep ? "ahead of our line" : "the enemy line"
  }
  const x = (first.fromX + first.toX) / 2
  const z = first.lineZ
  let nearest: { name: string; distance: number } | null = null
  for (const objective of sim.objectives) {
    const distance = Math.hypot(objective.x - x, objective.z - z)
    if (distance <= NAMED_WITHIN && (!nearest || distance < nearest.distance)) {
      nearest = { name: objective.name, distance }
    }
  }
  if (nearest) {
    return `near ${inSentence(nearest.name)}`
  }
  if (!from) {
    return "on the map"
  }
  const distance = Math.hypot(x - from.x, z - from.z)
  const bearing = (Math.atan2(x - from.x, z - from.z) * 180) / Math.PI
  const point = COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8] ?? "north"
  return `${Math.round(distance / 10) * 10} m ${point}`
}

function missionView(
  sim: Simulation,
  missions: readonly FireMission[],
  tickRate: number,
  from: { x: number; z: number } | null
): MissionView | null {
  const [first] = missions
  if (!first) {
    return null
  }
  const kind = groupKind(missions, mapWidth(sim.map))
  const creeping = missions.find((mission) => mission.creep)
  const pending = sim.tick < first.startTick
  let seconds: number
  let progress: number
  if (pending) {
    const wait = Math.max(1, first.delay * tickRate)
    seconds = (first.startTick - sim.tick) / tickRate
    progress = 1 - (first.startTick - sim.tick) / wait
  } else if (creeping?.creep) {
    const firing = (sim.tick - creeping.startTick) / tickRate
    const interval = creeping.creep.interval
    seconds = interval - (firing % interval)
    progress = (firing % interval) / interval
  } else {
    const end = Math.max(...missions.map((mission) => mission.startTick + mission.duration * tickRate))
    seconds = Math.max(0, (end - sim.tick) / tickRate)
    progress = Math.min(1, (sim.tick - first.startTick) / Math.max(1, end - first.startTick))
  }
  const direction = creeping?.creep ? Math.sign(creeping.creep.stopZ - creeping.z) || 1 : 0
  return {
    id: first.id,
    kind,
    label: KIND_LABELS[kind],
    place: placeOf(sim, missions, from),
    phase: pending ? "pending" : "firing",
    seconds,
    progress: Math.min(1, Math.max(0, progress)),
    shells: [...new Set(missions.map((mission) => mission.shell))],
    footprints: missions.map((mission) => ({
      fromX: mission.fromX,
      toX: mission.toX,
      z: mission.lineZ,
      band: mission.band
    })),
    creep: creeping ? { z: creeping.lineZ, direction } : null
  }
}

/**
 * The side's fire missions still to fire or firing, grouped as they were ordered: missions starting together along the
 * same stretch of front were one order (a bombardment's heavy and field guns; a creeping barrage and the standing
 * barrage ahead of it).
 */
export function missionsOf(
  sim: Simulation,
  side: Side,
  tickRate: number,
  from: { x: number; z: number } | null
): MissionView[] {
  const groups = new Map<string, FireMission[]>()
  for (const mission of sim.artillery.missions) {
    if (mission.side !== side || mission.finished) {
      continue
    }
    const key = `${mission.startTick}:${mission.fromX}:${mission.toX}`
    const group = groups.get(key)
    if (group) {
      group.push(mission)
    } else {
      groups.set(key, [mission])
    }
  }
  return [...groups.values()].flatMap((missions) => missionView(sim, missions, tickRate, from) ?? [])
}

/** What a mission's countdown counts to: its first rounds, its next lift, or the end of its fire. */
export function countdownWord(mission: MissionView): string {
  if (mission.phase === "pending") {
    return "Rounds in"
  }
  return mission.kind === "creeping" ? "Lifts in" : "Firing"
}

/** Remembers the most of each kind of shell the side has held, to show stocks against. */
export interface ShellLedger {
  stocks(sim: Simulation, side: Side): ShellStock[]
}

export function createShellLedger(): ShellLedger {
  const most = new Map<Shell, number>()
  return {
    stocks(sim, side) {
      const stock = sim.artillery.ammunition[side]
      return SHELL_LABELS.flatMap(([shell, label]) => {
        const left = stock[shell] ?? 0
        if (left >= UNLIMITED) {
          return []
        }
        const held = Math.max(most.get(shell) ?? 0, left)
        most.set(shell, held)
        return [{ shell, label, left, share: held > 0 ? left / held : 0 }]
      })
    }
  }
}

function stockOf(sim: Simulation, side: Side, shell: Shell): number {
  return sim.artillery.ammunition[side][shell] ?? 0
}

/** The calls on the player's keys, with whether each would fire now. */
export function callsOf(sim: Simulation, side: Side, missions: readonly MissionView[]): CallView[] {
  const has = (shell: Shell) => stockOf(sim, side, shell) > 0
  const active = (kind: MissionKind) => missions.some((mission) => mission.kind === kind)
  const call = (
    id: CallId,
    key: string,
    label: string,
    detail: string,
    shells: readonly Shell[],
    busy: boolean,
    busyReason: string
  ): CallView => {
    const stocked = shells.some(has)
    let reason: string | null = null
    if (!stocked) {
      reason = "No shells left"
    } else if (busy) {
      reason = busyReason
    }
    return { id, key, label, detail, available: stocked && !busy, reason, active: busy }
  }
  return [
    call(
      "bombard",
      keyOf("bombard"),
      "Bombard",
      "The enemy line, for two minutes",
      [Shell.HeavyHighExplosive, Shell.FieldHighExplosive],
      active("bombardment"),
      "Bombardment firing"
    ),
    call(
      "fire",
      keyOf("fire-mission"),
      "Fire mission",
      "High explosive on the pointer",
      [Shell.FieldHighExplosive],
      false,
      ""
    ),
    call("gas", keyOf("gas"), "Gas shoot", "Gas shells on the pointer", [Shell.FieldGas], false, ""),
    call(
      "whistle",
      keyOf("whistle"),
      "Whistle",
      "Every squad over the top, behind a creeping barrage",
      [Shell.FieldHighExplosive],
      active("creeping"),
      "The attack is going in"
    )
  ]
}
