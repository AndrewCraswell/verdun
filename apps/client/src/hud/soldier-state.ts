import {
  BROKEN_MORALE,
  canRun,
  concentrationAt,
  type EntityId,
  flareLight,
  FULL_STAMINA,
  GAS_DETECTED,
  gasTolerance,
  GRENADES_CARRIED,
  RIFLE_GRENADES_CARRIED,
  isAlive,
  isDark,
  gunPartner,
  isInTrench,
  canCut,
  isCutting,
  vaultLanding,
  MaskState,
  PINNED,
  seesOverParapet,
  type Simulation,
  type Squad,
  Stance,
  magazineOf,
  reloadSeconds,
  WEAPONS,
  Weapon,
  weatherPace,
  WINDED,
  wireAt
} from "@verdun/sim"
import { actionHeading } from "../control/action-heading.ts"
import { type Role, roleLabel, roleOf, type SoldierName, type SquadNames, weaponName, weaponOf } from "./squad-names.ts"

/** The weapon a man carries, as the HUD draws it. */
export type WeaponView = "rifle" | "machine-gun" | "sniper" | "rifle-grenade"

const WEAPON_VIEWS: Readonly<Record<Weapon, WeaponView>> = {
  [Weapon.Rifle]: "rifle",
  [Weapon.MachineGun]: "machine-gun",
  [Weapon.Sniper]: "sniper",
  [Weapon.RifleGrenadier]: "rifle-grenade"
}

/**
 * One soldier's state as the HUD shows it, in the shared vocabulary of docs/design/interface.md: words and kinds, never
 * hit points. Worked out from the simulation and nothing else.
 */

/** How bad a state is, for colour and shape: the same scale everywhere on the HUD. */
export type Severity = "good" | "info" | "caution" | "danger" | "out"

/** Morale at or above this is steady; below it a man is shaken (docs/design/morale-and-stamina.md#states). */
export const STEADY_MORALE = 0.6
/** Suppression from here up is "under fire": rounds landing close enough to spoil his aim, short of pinning him. */
export const UNDER_FIRE = 0.2
/** Gas breathed, as a share of what disables this man, from which he is "gassed": coughing, and in danger. */
const GASSED = 0.5
/** Flare light, in lux, that shows a man up to the enemy on a dark night: more than a quarter moon gives. */
const LIT_BY_FLARE = 0.5
/** Wire this thick underfoot catches a man: below it, the lane is cut through. */
const IN_WIRE = 0.15
/** Ground taking at least this share off his pace is worth telling him about. */
const SLOW_GOING = 0.9

export type Spirit = "steady" | "shaken" | "broken"
export type FireState = "calm" | "under-fire" | "pinned"
export type Posture = "standing" | "crouching" | "prone" | "sheltering" | "climbing-out"
export type MaskView = "off" | "masking" | "on"

/** The man under the player's control, in full. */
export interface SoldierView {
  readonly id: EntityId
  /** His squad slot, counting from 1: the key that takes him. */
  readonly slot: number
  readonly name: SoldierName
  readonly role: Role
  readonly roleLabel: string
  readonly weapon: {
    readonly kind: WeaponView
    readonly name: string
    /** How far through reloading or working the bolt, from 0 (just fired) to 1 (ready). */
    readonly ready: number
    /** Rounds left in the magazine, clip, strip or belt, and how many it holds. */
    readonly rounds: number
    readonly capacity: number
    /** Seconds left reloading, or null when he isn't. */
    readonly reloading: number | null
  }
  readonly spirit: Spirit
  readonly fire: FireState
  readonly wounded: boolean
  readonly posture: Posture
  readonly mask: MaskView
  /** While masking, how far the mask is on, from 0 to 1. */
  readonly maskProgress: number
  /** In a trench and not below in a dugout: whether his head is over the parapet. Null out of the trenches. */
  readonly overParapet: boolean | null
  readonly stamina: {
    /** Breath left, from 0 to 1. */
    readonly share: number
    /** Below this share he can't run. */
    readonly runs: number
    readonly winded: boolean
    readonly spent: boolean
  }
  readonly grenades: { readonly count: number; readonly carried: number }
  /** A rifle grenadier's VB grenades, fired from the cup on his rifle; null for anyone else. */
  readonly rifleGrenades: { readonly count: number; readonly carried: number } | null
  readonly position: { readonly x: number; readonly z: number }
  /** What the action key (Space) would do now, in a few words, or null when it would do nothing. */
  readonly action: string | null
  /** How far through the belt the lane he's cutting is, from 0 to 1, or null when he isn't cutting. */
  readonly cutting: number | null
}

/**
 * What the action key would do for a man now, as the player control decides it (control/player-control.ts): take over
 * a comrade's machine gun beside him, or hand his own back; stop cutting wire; down at the wire, crouched or prone, cut
 * it; else climb what's ahead of him, a trench wall, a wooden fence or a low wall. Null with nothing to do.
 */
export function actionFor(sim: Simulation, soldier: EntityId): string | null {
  if (gunPartner(sim, soldier) >= 0) {
    return sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun ? "Hand back the gun" : "Man the gun"
  }
  if (isCutting(sim, soldier)) {
    return "Stop cutting"
  }
  const heading = actionHeading(sim)
  if (sim.soldiers.stance.value[soldier] !== Stance.Standing && canCut(sim, soldier, heading)) {
    return "Cut the wire"
  }
  if (!vaultLanding(sim, soldier, heading)) {
    return null
  }
  const { x, z } = sim.soldiers.position
  return isInTrench(sim.map, x[soldier], z[soldier]) ? "Climb out" : "Climb over"
}

/** The one state that says most about a man at a glance, by the priority in docs/design/interface.md. */
export type SlotStatus =
  | "steady"
  | "shaken"
  | "broken"
  | "under-fire"
  | "pinned"
  | "masking"
  | "gassed"
  | "spent"
  | "wounded"
  | "down"
  | "carried"
  | "aid-post"
  | "returned"
  | "hospital"
  | "killed"
  | "captured"

/** Small marks beside the main state, where there's room. */
export type SlotMark = "wounded" | "masked" | "no-grenades" | "spent"

/** One man of the squad, for the roster. */
export interface RosterSlot {
  readonly id: EntityId
  /** Counting from 1. */
  readonly slot: number
  readonly name: SoldierName
  readonly role: Role
  readonly controlled: boolean
  /** Still on his feet and in the fight: he can be taken. */
  readonly fighting: boolean
  readonly status: SlotStatus
  readonly severity: Severity
  readonly marks: readonly SlotMark[]
  /** Metres from the man under control, or null for the man himself, or when nobody is under control. */
  readonly distance: number | null
}

/** Everything about the squad's men that tells one fallen man's fate from another's, gathered once per reading. */
export interface Casualties {
  readonly lying: ReadonlySet<EntityId>
  readonly evacuated: ReadonlySet<EntityId>
  readonly captured: ReadonlySet<EntityId>
  /** Men patched up at the aid post and sent back to the reserves. */
  readonly returned: ReadonlySet<EntityId>
}

function spiritOf(morale: number): Spirit {
  if (morale < BROKEN_MORALE) {
    return "broken"
  }
  return morale < STEADY_MORALE ? "shaken" : "steady"
}

function fireOf(suppression: number): FireState {
  if (suppression >= PINNED) {
    return "pinned"
  }
  return suppression >= UNDER_FIRE ? "under-fire" : "calm"
}

function postureOf(sim: Simulation, soldier: EntityId): Posture {
  const stance = sim.soldiers.stance.value[soldier]
  if (stance === Stance.Sheltering) {
    return sim.soldiers.shelter.emergeAt[soldier] >= 0 ? "climbing-out" : "sheltering"
  }
  if (stance === Stance.Prone) {
    return "prone"
  }
  return stance === Stance.Crouching ? "crouching" : "standing"
}

function maskOf(state: number): MaskView {
  if (state === MaskState.Donning) {
    return "masking"
  }
  return state === MaskState.On ? "on" : "off"
}

/** How far a mask being pulled on has got: masks take 5-12 s, so this counts down to the step it's on. */
function maskProgress(sim: Simulation, soldier: EntityId, tickRate: number): number {
  if (sim.soldiers.mask.state[soldier] !== MaskState.Donning) {
    return sim.soldiers.mask.state[soldier] === MaskState.On ? 1 : 0
  }
  const remaining = (sim.soldiers.mask.at[soldier] - sim.tick) / tickRate
  // Masks go on in at most 12 s; read the time left against that.
  return Math.min(1, Math.max(0, 1 - remaining / 12))
}

/** His weapon: what it is, the rounds in it, and how far through a reload or working the bolt. */
function weaponView(sim: Simulation, soldier: EntityId, kind: Weapon): SoldierView["weapon"] {
  const { weapon } = sim.soldiers
  const cooldown = weapon.cooldown[soldier]
  const reloading = weapon.reloading[soldier] === 1
  // Read against the whole reload while reloading; otherwise against the time between shots.
  const span = reloading ? reloadSeconds(sim, soldier) : WEAPONS[kind].interval
  return {
    kind: WEAPON_VIEWS[kind],
    name: weaponName(sim, soldier),
    ready: Math.min(1, Math.max(0, 1 - cooldown / span)),
    rounds: weapon.rounds[soldier],
    capacity: magazineOf(sim, soldier).rounds,
    reloading: reloading ? Math.max(0, cooldown) : null
  }
}

/** The man under control, or null when nobody is: the squad is wiped out. */
export function soldierView(sim: Simulation, squad: Squad, names: SquadNames, tickRate: number): SoldierView | null {
  const soldier = squad.leader
  if (soldier < 0 || !isAlive(sim, soldier)) {
    return null
  }
  const { soldiers } = sim
  const x = soldiers.position.x[soldier]
  const z = soldiers.position.z[soldier]
  const kind = weaponOf(sim, soldier)
  const role = roleOf(sim, squad, soldier)
  const posture = postureOf(sim, soldier)
  const trench = isInTrench(sim.map, x, z) && posture !== "sheltering" && posture !== "climbing-out"
  return {
    id: soldier,
    slot: squad.members.indexOf(soldier) + 1,
    name: names.nameOf(sim, squad, soldier),
    role,
    roleLabel: roleLabel(role),
    weapon: weaponView(sim, soldier, kind),
    spirit: spiritOf(soldiers.morale.value[soldier]),
    fire: fireOf(soldiers.suppression.value[soldier]),
    wounded: soldiers.health.value[soldier] < 1,
    posture,
    mask: maskOf(soldiers.mask.state[soldier]),
    maskProgress: maskProgress(sim, soldier, tickRate),
    overParapet: trench ? seesOverParapet(sim, soldier) : null,
    stamina: {
      share: soldiers.stamina.value[soldier] / FULL_STAMINA,
      runs: WINDED / FULL_STAMINA,
      winded: !canRun(sim, soldier),
      spent: soldiers.stamina.spent[soldier] === 1
    },
    grenades: { count: soldiers.grenades.count[soldier], carried: GRENADES_CARRIED },
    rifleGrenades:
      kind === Weapon.RifleGrenadier
        ? { count: soldiers.rifleGrenades.count[soldier], carried: RIFLE_GRENADES_CARRIED }
        : null,
    position: { x, z },
    action: actionFor(sim, soldier),
    cutting: isCutting(sim, soldier) ? Math.min(1, Math.max(0, sim.soldiers.cutting.progress[soldier])) : null
  }
}

/** A fallen or captured man's fate, by what the simulation knows of him. */
function fateOf(sim: Simulation, soldier: EntityId, casualties: Casualties): SlotStatus {
  if (casualties.captured.has(soldier)) {
    return "captured"
  }
  if (casualties.lying.has(soldier)) {
    return sim.soldiers.casualty.evacuateAt[soldier] >= 0 ? "carried" : "down"
  }
  if (casualties.evacuated.has(soldier)) {
    if (casualties.returned.has(soldier)) {
      return "returned"
    }
    return sim.soldiers.casualty.treatment[soldier] >= 0 ? "aid-post" : "hospital"
  }
  return "killed"
}

/** A man still in the fight: the worst of what's happening to him. */
function fightingStatus(sim: Simulation, soldier: EntityId): SlotStatus {
  const { soldiers } = sim
  const spirit = spiritOf(soldiers.morale.value[soldier])
  const fire = fireOf(soldiers.suppression.value[soldier])
  if (spirit === "broken") {
    return "broken"
  }
  if (fire === "pinned") {
    return "pinned"
  }
  if (soldiers.mask.state[soldier] === MaskState.Donning) {
    return "masking"
  }
  if (soldiers.gasDose.value[soldier] >= GASSED * gasTolerance(soldier)) {
    return "gassed"
  }
  if (spirit === "shaken") {
    return "shaken"
  }
  if (fire === "under-fire") {
    return "under-fire"
  }
  if (soldiers.stamina.spent[soldier] === 1) {
    return "spent"
  }
  return soldiers.health.value[soldier] < 1 ? "wounded" : "steady"
}

const SEVERITY: Readonly<Record<SlotStatus, Severity>> = {
  steady: "good",
  shaken: "caution",
  "under-fire": "caution",
  spent: "caution",
  wounded: "caution",
  broken: "danger",
  pinned: "danger",
  masking: "danger",
  gassed: "danger",
  down: "out",
  carried: "out",
  "aid-post": "out",
  returned: "out",
  hospital: "out",
  killed: "out",
  captured: "out"
}

export function severityOf(status: SlotStatus): Severity {
  return SEVERITY[status]
}

function marksOf(sim: Simulation, soldier: EntityId, status: SlotStatus): SlotMark[] {
  const { soldiers } = sim
  const marks: SlotMark[] = []
  if (status !== "wounded" && soldiers.health.value[soldier] < 1) {
    marks.push("wounded")
  }
  if (soldiers.mask.state[soldier] === MaskState.On) {
    marks.push("masked")
  }
  if (soldiers.grenades.count[soldier] === 0) {
    marks.push("no-grenades")
  }
  if (status !== "spent" && soldiers.stamina.spent[soldier] === 1) {
    marks.push("spent")
  }
  return marks
}

/** The squad's men in slot order, each with the state that matters most about him. */
export function rosterView(sim: Simulation, squad: Squad, names: SquadNames, casualties: Casualties): RosterSlot[] {
  const controlled = squad.leader >= 0 && isAlive(sim, squad.leader) ? squad.leader : -1
  const { position } = sim.soldiers
  return squad.members.map((soldier, index) => {
    const fighting = isAlive(sim, soldier)
    const status = fighting ? fightingStatus(sim, soldier) : fateOf(sim, soldier, casualties)
    const distance =
      controlled < 0 || soldier === controlled
        ? null
        : Math.hypot(position.x[soldier] - position.x[controlled], position.z[soldier] - position.z[controlled])
    return {
      id: soldier,
      slot: index + 1,
      name: names.nameOf(sim, squad, soldier),
      role: roleOf(sim, squad, soldier),
      controlled: soldier === controlled,
      fighting,
      status,
      severity: SEVERITY[status],
      marks: fighting ? marksOf(sim, soldier, status) : [],
      distance
    }
  })
}

/** Something acting on the man under control, and why, in a soldier's words. */
export interface EffectView {
  readonly id: string
  readonly reason: string
  readonly severity: Severity
}

/**
 * Every condition changing the controlled soldier's dials, each with its reason, as the rules for interactions require
 * (docs/design/interactions.md#rules-for-interactions). Worst first.
 */
export function effectsOn(sim: Simulation, soldier: SoldierView): EffectView[] {
  const { x, z } = soldier.position
  const effects: EffectView[] = []
  const add = (id: string, reason: string, severity: Severity) => effects.push({ id, reason, severity })
  const gas = concentrationAt(sim.gas, x, z)
  if (soldier.mask === "masking") {
    add("mask", "Pulling the mask on: hold your breath", "danger")
  } else if (gas >= GAS_DETECTED && soldier.mask === "off") {
    add("gas", "Gas: get the mask on", "danger")
  }
  if (soldier.fire === "pinned") {
    add("pinned", "Pinned: rounds landing close", "danger")
  } else if (soldier.fire === "under-fire") {
    add("under-fire", "Under fire: aim spoiled", "caution")
  }
  if (soldier.spirit === "broken") {
    add("broken", "Broken: can't make himself run", "danger")
  } else if (soldier.spirit === "shaken") {
    add("shaken", "Shaken: hands unsteady", "caution")
  }
  if (soldier.wounded) {
    add("wounded", "Wounded: slower, aims worse", "danger")
  }
  if (wireAt(sim.wire, x, z) >= IN_WIRE) {
    add("wire", "Caught in the wire", "danger")
  }
  if (isDark(sim) && flareLight(sim, x, z) >= LIT_BY_FLARE) {
    add("flare", "Lit by a flare: you can be seen", "danger")
  }
  if (soldier.stamina.spent) {
    add("spent", "Spent: walking till he has his breath", "caution")
  } else if (soldier.stamina.winded) {
    add("winded", "Out of breath: can't run", "caution")
  }
  if (soldier.mask === "on") {
    add("masked", "Mask on: hard to aim and breathe", "caution")
  }
  if (weatherPace(sim, x, z) < SLOW_GOING) {
    const snow = sim.environment.weather.snowCover > 0 && sim.environment.weather.wetness < 0.3
    add("mud", snow ? "Snow underfoot: slow going" : "Deep mud: slow going", "info")
  }
  if (isDark(sim)) {
    add("night", "Dark: you see little and aim worse", "info")
  } else if (sim.environment.weather.visibility < 1000) {
    add("fog", "Fog: sight closes in", "info")
  } else if (sim.environment.weather.precipitation >= 0.5) {
    const snow = sim.environment.weather.snowFraction > 0.5
    add(snow ? "snow" : "rain", snow ? "Snow: sight closes in" : "Rain: sight closes in", "info")
  }
  if (soldier.overParapet) {
    add("parapet", "Head up: seeing out, and seen", "info")
  }
  if (soldier.posture === "sheltering") {
    add("dugout", "In a dugout: safe, getting his breath", "good")
  }
  return effects.sort((a, b) => WORST[a.severity] - WORST[b.severity])
}

/** Severities in order, worst first, for sorting. */
const WORST: Readonly<Record<Severity, number>> = { danger: 0, caution: 1, info: 2, good: 3, out: 4 }
