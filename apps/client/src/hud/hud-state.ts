import {
  aimedTarget,
  hitChance,
  WEAPONS,
  arrivalOf,
  capturedIds,
  concentrationAt,
  type EntityId,
  evacuatedIds,
  GAS_DETECTED,
  Shell,
  type Side,
  type SimEvent,
  type Simulation,
  type Squad,
  type WarDay,
  woundedIds
} from "@verdun/sim"
import { type Attention, createAttentionWatch } from "./attention.ts"
import { type Banner, createBannerQueue } from "./banners.ts"
import { type BattleLog, createBattleLog, type LogMessage } from "./battle-log.ts"
import { callsOf, createShellLedger, type FireSupportView, missionsOf } from "./fire-support.ts"
import { createHints, type Hint, type Hints, type HintStore } from "./hints.ts"
import { type OperationView, operationView } from "./operation-state.ts"
import {
  type ClockView,
  clockView,
  createLightReader,
  type SectorView,
  sectorView,
  type StrengthView,
  strengthView
} from "./sector-state.ts"
import {
  type Casualties,
  type EffectView,
  effectsOn,
  type RosterSlot,
  rosterView,
  type SoldierView,
  soldierView,
  STEADY_MORALE
} from "./soldier-state.ts"
import { type SpottedGun, spottedGunsView } from "./spotted-guns.ts"
import { createSquadNames, type SquadNames, weaponOf } from "./squad-names.ts"
import { createOrderWatch, type OrderView } from "./squad-order.ts"
import { createSuccessionWatch, type Succession } from "./succession.ts"
import { middleOf, type TakeOverChoice, takeOverChoices } from "./take-over.ts"
import { type WarStatus, warStatus } from "./war-status.ts"

/**
 * Everything the HUD shows, worked out from the simulation and nothing else: the one contract between the battle and
 * the HUD's elements. Each element reads what it needs from this and draws it its own way, so an element can be
 * redesigned and swapped without touching the others or the battle (see ./registry.ts).
 */
export interface HudState {
  readonly tick: number
  readonly tickRate: number
  readonly side: Side
  /** The man under the player's control; null once the squad is wiped out. */
  readonly soldier: SoldierView | null
  readonly roster: readonly RosterSlot[]
  readonly order: OrderView
  /** Conditions acting on the man under control, worst first. */
  readonly effects: readonly EffectView[]
  readonly fire: FireSupportView
  readonly clock: ClockView
  readonly sector: SectorView
  readonly strength: StrengthView
  readonly log: readonly LogMessage[]
  readonly banner: { readonly banner: Banner; readonly progress: number } | null
  readonly succession: Succession | null
  readonly wiped: WipedView | null
  /** Machine guns given away by their fire: the enemy's we've spotted, and ours once the enemy has. */
  readonly guns: readonly SpottedGun[]
  /** The operation the battle is fought in, counted down from now; null without one. */
  readonly operation: OperationView | null
  readonly hint: Hint | null
  readonly screen: ScreenView
  readonly cursor: CursorView
  /** The war's calendar, when the battle runs on it. */
  readonly war: WarStatus | null
  /** What has just changed and deserves a moment on screen, for the parts of the HUD that otherwise stay away. */
  readonly attention: Attention
  /** How the player is looking at the battle: not the simulation's, but what the HUD shows depends on it. */
  readonly view: HudView
}

/** How the player is looking at the battle. */
export interface HudView {
  /** The overview key is held, or was tapped to keep the overview up: show the sector's state in full. */
  readonly overview: boolean
  /** How far the camera has pulled back into the war map's view, from 0 (in among the men) to 1 (the map). */
  readonly tactical: number
}

const CLOSE_VIEW: HudView = { overview: false, tactical: 0 }

/** The squad gone, and its replacements coming up (H17). */
export interface WipedView {
  /** Seconds until the replacements reach the rear trench, or null when none are coming. */
  readonly seconds: number | null
  readonly men: number
  /** Men left in the side's pool after these, or null without a pool. */
  readonly reserves: number | null
  /** Squads nearby the player can take over at once instead of waiting, nearest first. */
  readonly choices: readonly TakeOverChoice[]
  /** Where the squad fell: the middle of its men. */
  readonly fell: { readonly x: number; readonly z: number }
}

/** How strongly each screen effect shows, from 0 to 1 (E1-E8). */
export interface ScreenView {
  /** Rounds landing close: the edges darken in. */
  readonly suppression: number
  readonly wounded: number
  /** Gas breathed without a mask. */
  readonly gas: number
  /** The mask's lenses, from pulling it on (0 to 1) to on (1). */
  readonly mask: number
  /** Morale going: colour draining from the world. */
  readonly shaken: number
  /** A shell bursting close: a jolt of dust and deafness, fading in under a second. */
  readonly burst: number
  /** The man under control has just fallen. */
  readonly fallen: number
}

/** What the pointer should look like over the battlefield (H8). */
export interface CursorView {
  readonly state: "aim" | "target" | "reload" | "none"
  /** How far through reloading, from 0 to 1. */
  readonly ready: number
  /** Aim spoiled by fire. */
  readonly shaken: boolean
  /** How good a shot at the man in the sights is, in words, never a number (H8); null with nobody in them. */
  readonly chance: ShotChance | null
}

export type ShotChance = "good" | "fair" | "poor"

/**
 * A shot's chance of hitting, as a share of the best this weapon can do (point-blank at a man standing in the open):
 * good from half of that, fair from a quarter, poor below.
 */
export function shotChance(chance: number, best: number): ShotChance {
  const share = best > 0 ? chance / best : 0
  if (share >= 0.5) {
    return "good"
  }
  return share >= 0.25 ? "fair" : "poor"
}

export interface HudModel {
  /** Feeds one simulation step's events. Call after every step. */
  record(events: readonly SimEvent[]): void
  /**
   * The HUD's view of the battle at a real moment `now`, in seconds; `clock` is the real time for the war's calendar,
   * and `view` how the player is looking at it.
   */
  read(now: number, clock?: number, view?: HudView): HudState
  readonly names: SquadNames
  readonly hints: Hints
}

export interface HudModelOptions {
  /** The war's calendar, when the battle runs on it. */
  readonly war?: { readonly day: WarDay; readonly paused: boolean }
  /** Where the prompts already done are kept. */
  readonly hintStore?: HintStore
  /** The real moment the HUD starts, in seconds. */
  readonly started?: number
}

/** A close burst within this many metres of the man under control shakes the screen. */
const BURST_REACH = 15
/** Seconds a close burst's jolt takes to fade to a third. */
const BURST_FADE = 0.6
/** How much harder than a field gun's shell a burst shakes a man close by. */
const BURST_FORCE = new Map<Shell, number>([[Shell.HeavyHighExplosive, 1.4]])

/** Gas this thick, in mg/m³, fills the screen's tint. */
const GAS_FULL = 200

const NO_HINTS: HintStore = { load: () => [], save: () => undefined }

export function createHudModel(
  sim: Simulation,
  squad: Squad,
  tickRate: number,
  { war, hintStore = NO_HINTS, started = 0 }: HudModelOptions = {}
): HudModel {
  const names = createSquadNames()
  const log: BattleLog = createBattleLog(sim, squad, tickRate, names)
  const banners = createBannerQueue(sim, squad, names)
  const succession = createSuccessionWatch(sim, squad, names)
  const orders = createOrderWatch(sim, squad)
  const ledger = createShellLedger()
  const light = createLightReader()
  const hints = createHints(sim, squad, hintStore, started)
  const attention = createAttentionWatch()
  const returned = new Set<EntityId>()
  let burst: { readonly tick: number; readonly strength: number } | null = null

  function casualties(): Casualties {
    const ofSquad = (ids: readonly EntityId[]) => new Set(ids.filter((id) => squad.members.includes(id)))
    return {
      lying: ofSquad(woundedIds(sim)),
      evacuated: ofSquad(evacuatedIds(sim)),
      captured: ofSquad(capturedIds(sim)),
      returned
    }
  }

  function screenOf(soldier: SoldierView | null, handover: Succession | null): ScreenView {
    const fallen = handover ? Math.max(0, 1 - handover.progress * 1.6) : 0
    const jolt = burst ? burst.strength * Math.exp(-(sim.tick - burst.tick) / tickRate / BURST_FADE) : 0
    if (!soldier) {
      return { suppression: 0, wounded: 0, gas: 0, mask: 0, shaken: 0, burst: 0, fallen }
    }
    const { soldiers } = sim
    const suppression = soldiers.suppression.value[soldier.id]
    const morale = soldiers.morale.value[soldier.id]
    const gas = concentrationAt(sim.gas, soldier.position.x, soldier.position.z)
    return {
      suppression: Math.min(1, Math.max(0, (suppression - 0.1) / 0.8)),
      wounded: soldier.wounded ? Math.min(1, 0.35 + (1 - soldiers.health.value[soldier.id])) : 0,
      gas: soldier.mask === "off" && gas >= GAS_DETECTED ? Math.min(1, gas / GAS_FULL) : 0,
      mask: soldier.mask === "off" ? 0 : soldier.maskProgress,
      shaken: morale < STEADY_MORALE ? Math.min(1, (STEADY_MORALE - morale) / STEADY_MORALE) : 0,
      burst: jolt < 0.01 ? 0 : jolt,
      fallen
    }
  }

  function cursorOf(soldier: SoldierView | null): CursorView {
    if (!soldier) {
      return { state: "none", ready: 0, shaken: false, chance: null }
    }
    const shaken = soldier.fire === "pinned" || soldier.spirit !== "steady"
    if (soldier.weapon.ready < 1) {
      return { state: "reload", ready: soldier.weapon.ready, shaken, chance: null }
    }
    const target = aimedTarget(sim, soldier.id)
    if (target < 0) {
      return { state: "aim", ready: 1, shaken, chance: null }
    }
    const best = WEAPONS[weaponOf(sim, soldier.id)].accuracy
    return { state: "target", ready: 1, shaken, chance: shotChance(hitChance(sim, soldier.id, target), best) }
  }

  // The order squads were first offered in, kept while the list is up, so none moves under the player's pointer.
  let offered: number[] = []

  /** The squads on offer, those already offered first in the order they came, new ones after. */
  function inOfferedOrder(choices: readonly TakeOverChoice[]): TakeOverChoice[] {
    const known = (choice: TakeOverChoice) => offered.indexOf(choice.squad)
    const kept = choices.filter((choice) => known(choice) >= 0).sort((a, b) => known(a) - known(b))
    const ordered = [...kept, ...choices.filter((choice) => known(choice) < 0)]
    offered = ordered.map((choice) => choice.squad)
    return ordered
  }

  function wipedOf(
    soldier: SoldierView | null,
    roster: readonly RosterSlot[],
    reserves: number | null
  ): WipedView | null {
    if (soldier || roster.some((slot) => slot.fighting)) {
      offered = []
      return null
    }
    const arrival = arrivalOf(sim, squad)
    const coming = sim.reinforcements.arrivals.find((entry) => entry.squad === squad.id)
    return {
      seconds: arrival >= 0 ? Math.max(0, (arrival - sim.tick) / tickRate) : null,
      men: coming?.men ?? 0,
      reserves,
      choices: inOfferedOrder(takeOverChoices(sim, squad, names)),
      fell: middleOf(sim, squad)
    }
  }

  return {
    names,
    hints,
    record(events) {
      log.record(events)
      banners.record(events)
      const leader = squad.leader
      for (const event of events) {
        if (event.type === "returned-to-duty") {
          returned.add(event.soldier)
        } else if (event.type === "burst" && leader >= 0) {
          // A grenade shakes a man at half a shell's reach; a heavy shell harder than a field gun's.
          const grenade = event.shell === Shell.Grenade
          const reach = grenade ? BURST_REACH / 2 : BURST_REACH
          const distance = Math.hypot(
            event.at.x - sim.soldiers.position.x[leader],
            event.at.z - sim.soldiers.position.z[leader]
          )
          if (distance < reach) {
            const force = grenade ? 0.6 : (BURST_FORCE.get(event.shell) ?? 1)
            const strength = Math.min(1, (1 - distance / reach) * force)
            const fading = burst ? burst.strength * Math.exp(-(sim.tick - burst.tick) / tickRate / BURST_FADE) : 0
            burst = { tick: sim.tick, strength: Math.max(fading, strength) }
          }
        }
      }
    },
    read(now, clock = Date.now(), view = CLOSE_VIEW) {
      const soldier = soldierView(sim, squad, names, tickRate)
      const roster = rosterView(sim, squad, names, casualties())
      const from = soldier?.position ?? null
      const missions = missionsOf(sim, squad.side, tickRate, from)
      const strength = strengthView(sim, squad)
      const handover = succession.read(now)
      const order = orders.read()
      const clockNow = clockView(sim, light(sim))
      const sector = sectorView(sim, squad.side, from)
      return {
        tick: sim.tick,
        tickRate,
        side: squad.side,
        soldier,
        roster,
        order,
        effects: soldier ? effectsOn(sim, soldier) : [],
        fire: {
          calls: callsOf(sim, squad.side, missions),
          missions,
          shells: ledger.stocks(sim, squad.side),
          sos: sim.artillery.sosCalledAt[squad.side] >= 0
        },
        clock: clockNow,
        sector,
        strength,
        log: log.messages,
        banner: banners.current(now),
        succession: handover,
        wiped: wipedOf(soldier, roster, strength.reserves?.men ?? null),
        guns: spottedGunsView(sim, squad, tickRate),
        operation: operationView(sim, squad.side, tickRate),
        hint: hints.read(now, view),
        screen: screenOf(soldier, handover),
        cursor: cursorOf(soldier),
        war: war ? warStatus(war.day, war.paused, clock) : null,
        attention: attention.read(now, { sector, clock: clockNow, missions, order }),
        view
      }
    }
  }
}
