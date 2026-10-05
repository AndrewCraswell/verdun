import { gunzipSync, gzipSync } from "node:zlib"
import type { BattlefieldMap } from "@verdun/map"
import { type GroundMovement, groundMovement } from "@verdun/net"
import {
  createFixedStepper,
  createWarClock,
  scheduleForWeek,
  SIM_STATE_VERSION,
  type Simulation,
  type SimulationSnapshot,
  STEP_SECONDS,
  stepSimulation,
  takeSnapshot,
  TICK_RATE,
  type WarClock
} from "@verdun/sim"
import { newBattle, resumeBattle } from "./battle.ts"
import { groundOf, restoreGround, saveGround } from "./ground.ts"
import type { SavedBattle, SectorStore } from "./store.ts"

/** A sector's battle, running on the server whether anyone is playing it or not. */
export interface Sector {
  readonly name: string
  readonly sim: Simulation
  /** The war's calendar the battle keeps: its week, and the stand-to after each daily cutoff when it waits. */
  readonly war: WarClock
  /** Brings the battle up to the real moment `now`, in fixed steps, unless the war has it wait. Returns the steps. */
  advance(now: number): number
  /** Calls `listener` after every step the battle takes. */
  onStep(listener: () => void): void
  /** How shells have moved the ground, for a player joining late: see `groundMovement`. */
  reshapedGround(): GroundMovement | null
  /** The battle as it stands, ready to keep. */
  save(now: number): SavedBattle
}

/** After a stall (a slow save, a paused debugger), the battle catches up at most a second and lets the rest go. */
const MOST_STEPS = TICK_RATE

export interface SectorOptions {
  readonly store: SectorStore
  readonly name: string
  /** The sector's map as generated: a saved battle's craters are put back into it. */
  readonly map: BattlefieldMap
  readonly now: number
  readonly log: (line: string) => void
  /** Men in each side's front line, if a new battle begins: the local game's 200 unless given. */
  readonly soldiersPerSide?: number
}

/** Our own saves, read back: checked only as far as telling a snapshot of this build's format from anything else. */
function isSnapshot(value: unknown): value is SimulationSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === SIM_STATE_VERSION &&
    "tick" in value &&
    typeof value.tick === "number" &&
    "soldiers" in value &&
    Array.isArray(value.soldiers)
  )
}

/** The saved battle to take up again, if the latest save is one this build can read. */
function readable(saved: SavedBattle | null, log: (line: string) => void): SimulationSnapshot | null {
  if (!saved) {
    return null
  }
  const snapshot: unknown =
    saved.version === SIM_STATE_VERSION ? JSON.parse(gunzipSync(saved.snapshot).toString()) : null
  if (!isSnapshot(snapshot)) {
    log(`The last save is in format ${saved.version}, and this build reads ${SIM_STATE_VERSION}: a new battle begins`)
    return null
  }
  return snapshot
}

/**
 * Opens a sector: takes up its latest save where it left off, or begins a new battle. The war's calendar is the
 * sector's own, kept from the first time it opened, so the war goes on a week each real day across restarts and new
 * battles alike.
 */
export async function openSector({ store, name, map, now, log, soldiersPerSide }: SectorOptions): Promise<Sector> {
  const generated = groundOf(map)
  const saved = store.latest(name)
  const snapshot = readable(saved, log)
  let sim: Simulation
  if (saved && snapshot) {
    if (!restoreGround(map, saved)) {
      log("The saved ground is of a map of another size: the battle goes on over unshelled ground")
    }
    sim = await resumeBattle(map, snapshot)
    log(`Took up ${name} at step ${sim.tick}, saved ${Math.round((now - saved.savedAt) / 1000)} s ago`)
  } else {
    sim = await newBattle(map, soldiersPerSide)
    log(`Began a new battle in ${name}`)
  }
  let schedule = store.schedule(name)
  if (!schedule) {
    schedule = scheduleForWeek(sim.environment.clock.week, now)
    store.addSector(name, schedule, now)
  }
  const war = createWarClock(sim, schedule, now)
  const stepper = createFixedStepper(STEP_SECONDS, MOST_STEPS)
  const listeners: (() => void)[] = []
  let last = now

  return {
    name,
    sim,
    war,
    advance(at) {
      const due = stepper.advance((at - last) / 1000)
      last = at
      war.update(at)
      // The stand-to and the breaks between seasons hold the battle; the time passes all the same.
      const steps = war.paused ? 0 : due
      for (let step = 0; step < steps; step++) {
        stepSimulation(sim)
        for (const listener of listeners) {
          listener()
        }
      }
      return steps
    },
    onStep(listener) {
      listeners.push(listener)
    },
    reshapedGround() {
      return groundMovement(map, generated)
    },
    save(at) {
      return {
        savedAt: at,
        version: SIM_STATE_VERSION,
        tick: sim.tick,
        snapshot: gzipSync(JSON.stringify(takeSnapshot(sim))),
        ...saveGround(map, generated)
      }
    }
  }
}
