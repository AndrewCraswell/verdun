import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import { addComponent, addEntity, createWorld, type EntityId, Not, query, type QueryResult, type World } from "bitecs"
import {
  type ArtilleryState,
  artillerySystem,
  type BurstEvent,
  createArtilleryState,
  type OutOfShellsEvent
} from "./artillery.ts"
import { captureSystem, type CaptureEvent } from "./capture.ts"
import { combatSystem, type ShotEvent, type ThrowEvent, Weapon } from "./combat.ts"
import { type CommanderState, commanderSystem, type CounterAttackEvent, createCommanders } from "./commander.ts"
import { applyCommand, type Command } from "./commands.ts"
import { createSoldierComponents, MaskState, NEVER, Side, type SoldierComponents, Stance } from "./components.ts"
import { createEnvironment, type Environment, environmentSystem, type EnvironmentOptions } from "./environment.ts"
import { type Flare, type FlareEvent, flareSystem } from "./flares.ts"
import { createGasField, type GasField, gasSystem } from "./gas.ts"
import type { LineOfSight } from "./line-of-sight.ts"
import { navigationSystem } from "./navigation.ts"
import { createObjectives, type ObjectiveState, objectiveSystem, type ObjectiveTakenEvent } from "./objectives.ts"
import {
  createReinforcements,
  type ReinforcementEvent,
  reinforcementSystem,
  type ReinforcementState
} from "./reinforcements.ts"
import { createRng, type Rng } from "./rng.ts"
import { type Squad, squadSystem } from "./squads.ts"
import { stanceSystem } from "./stance.ts"
import { movementSystem } from "./systems/movement.ts"
import { createWireField, type WireCutEvent, type WireField } from "./wire.ts"
import { type CasualtyEvent, type FallenEvent, type WoundedEvent, woundSystem } from "./wounds.ts"

/** Simulation steps per second. */
export const TICK_RATE = 20
export const STEP_SECONDS = 1 / TICK_RATE

const DEFAULT_CAPACITY = 8192
/** Hand grenades each soldier goes into action with. Bombers carried a sackful; riflemen two to four. */
export const GRENADES_CARRIED = 3
/** Average marching pace with kit, in metres per second. */
export const WALKING_SPEED = 1.4
/** A rested soldier's stamina. */
export const FULL_STAMINA = 100

export interface Simulation {
  readonly map: BattlefieldMap
  readonly world: World
  readonly soldiers: SoldierComponents
  readonly capacity: number
  readonly rng: Rng
  /** Commands waiting for the next step, applied in arrival order. */
  readonly pendingCommands: Command[]
  /** Every squad, indexed by squad id. */
  readonly squads: Squad[]
  /**
   * Terrain sight lines for spotting and shooting. Created asynchronously (Rapier is WebAssembly), so it's attached
   * after the simulation is made; until then nobody can see anyone, so nobody fires.
   */
  lineOfSight: LineOfSight | null
  /** Batteries' fire missions and shells in flight. */
  readonly artillery: ArtilleryState
  /** Gas drifting over the battlefield. */
  readonly gas: GasField
  /** Smoke and dust thrown up by shell bursts, which hide whatever lies behind them. */
  readonly smoke: GasField
  /** Barbed wire in front of the trenches, as staked and as shells have cut it since. */
  readonly wire: WireField
  /** The wind near the ground, in metres per second toward +x (east) and +z (north). It carries gas. */
  readonly wind: { x: number; z: number }
  /** The date and time of day, the weather and the light. The weather sets the wind each second. */
  readonly environment: Environment
  /** Each side's commander: whether it has lost its front line and counter-attacked. */
  readonly commanders: Record<Side, CommanderState>
  /** The map's objectives and who holds them. */
  readonly objectives: ObjectiveState[]
  /** Each side's men held back to replace wiped-out squads, and replacements on their way up. */
  readonly reinforcements: ReinforcementState
  /** Very lights in the air over no man's land at night, lighting the ground beneath them. */
  readonly flares: Flare[]
  /** What happened during the last step, for renderers: shots fired and shells landing. Replaced every step. */
  readonly events: SimEvent[]
  tick: number
  /**
   * Times each system's work in a step, for profiling: called with the system's name and its work, it must run the
   * work. Unset, systems run untimed. It changes nothing in the simulation.
   */
  systemTimer?: SystemTimer
}

/** Something that happened during a step that a renderer may want to show. */
export type SimEvent =
  | ShotEvent
  | ThrowEvent
  | BurstEvent
  | CaptureEvent
  | CounterAttackEvent
  | WireCutEvent
  | ObjectiveTakenEvent
  | ReinforcementEvent
  | FlareEvent
  | OutOfShellsEvent
  | WoundedEvent
  | FallenEvent
  | CasualtyEvent

export interface SimulationOptions {
  readonly map: BattlefieldMap
  readonly seed: number
  /** Highest entity id + 1 the component stores can hold. */
  readonly capacity?: number
  /** Wind near the ground, in metres per second. Defaults to a light westerly, Verdun's prevailing wind. */
  readonly wind?: { readonly x: number; readonly z: number }
  /** When the battle starts, how fast days pass and where the weather comes from. Defaults to fair weather held. */
  readonly environment?: EnvironmentOptions
  /**
   * Men each side holds back to replace squads that are wiped out. A side without any never replaces a squad, which is
   * the default.
   */
  readonly reinforcements?: Partial<Record<Side, number>>
}

export function createSimulation({
  map,
  seed,
  capacity = DEFAULT_CAPACITY,
  wind = { x: 2, z: 0.5 },
  environment: environmentOptions,
  reinforcements
}: SimulationOptions): Simulation {
  const environment = createEnvironment({ ...environmentOptions, wind })
  return {
    map,
    world: createWorld(),
    soldiers: createSoldierComponents(capacity),
    capacity,
    rng: createRng(seed),
    pendingCommands: [],
    squads: [],
    lineOfSight: null,
    artillery: createArtilleryState(),
    gas: createGasField(map),
    smoke: createGasField(map),
    wire: createWireField(map),
    wind: { x: environment.weather.wind.x, z: environment.weather.wind.z },
    environment,
    commanders: createCommanders(),
    objectives: createObjectives(map),
    flares: [],
    reinforcements: createReinforcements(reinforcements),
    events: [],
    tick: 0
  }
}

/** Keeps a ground position inside the map. */
export function clampToMap(sim: Simulation, x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(mapWidth(sim.map), Math.max(0, x)),
    z: Math.min(mapDepth(sim.map), Math.max(0, z))
  }
}

export interface SoldierSpawn {
  readonly side: Side
  readonly x: number
  readonly z: number
  readonly speed?: number
  /** Initial facing; defaults toward the enemy: north for the French, south for the Germans. */
  readonly facing?: { readonly x: number; readonly z: number }
  readonly weapon?: Weapon
}

export function spawnSoldier(
  sim: Simulation,
  { side, x, z, speed = WALKING_SPEED, facing, weapon = Weapon.Rifle }: SoldierSpawn
): EntityId {
  const soldier = addEntity(sim.world)
  if (soldier >= sim.capacity) {
    throw new RangeError(`Soldier id ${soldier} exceeds simulation capacity ${sim.capacity}`)
  }
  const { position, side: sideStore, speed: speedStore, facing: facingStore, health } = sim.soldiers
  addComponent(sim.world, soldier, position)
  addComponent(sim.world, soldier, sideStore)
  addComponent(sim.world, soldier, speedStore)
  addComponent(sim.world, soldier, health)
  health.value[soldier] = 1
  const clamped = clampToMap(sim, x, z)
  position.x[soldier] = clamped.x
  position.z[soldier] = clamped.z
  sideStore.value[soldier] = side
  speedStore.value[soldier] = speed
  addComponent(sim.world, soldier, sim.soldiers.weapon)
  sim.soldiers.weapon.kind[soldier] = weapon
  sim.soldiers.weapon.cooldown[soldier] = 0
  sim.soldiers.target.id[soldier] = -1
  sim.soldiers.suppression.value[soldier] = 0
  sim.soldiers.morale.value[soldier] = 1
  sim.soldiers.stance.value[soldier] = Stance.Standing
  sim.soldiers.shelter.lastShelled[soldier] = NEVER
  sim.soldiers.shelter.emergeAt[soldier] = -1
  sim.soldiers.mask.state[soldier] = MaskState.Off
  sim.soldiers.mask.at[soldier] = -1
  sim.soldiers.mask.clearSince[soldier] = -1
  sim.soldiers.gasDose.value[soldier] = 0
  sim.soldiers.grenades.count[soldier] = GRENADES_CARRIED
  sim.soldiers.stamina.value[soldier] = FULL_STAMINA
  sim.soldiers.stamina.spent[soldier] = 0
  const towardEnemy = side === Side.French ? 1 : -1
  facingStore.x[soldier] = facing?.x ?? 0
  facingStore.z[soldier] = facing?.z ?? towardEnemy
  return soldier
}

/**
 * Entity ids in ascending order. The ECS's own query order shifts as components come and go (and differs after a
 * snapshot restore), and systems that draw random numbers per soldier must visit soldiers in the same order every
 * time to stay deterministic.
 */
function inIdOrder(ids: QueryResult): readonly EntityId[] {
  return Array.from(ids).sort((a, b) => a - b)
}

/** Every soldier still in the fight, alive and free, in id order. */
export function soldierIds(sim: Simulation): readonly EntityId[] {
  return inIdOrder(query(sim.world, [sim.soldiers.position, Not(sim.soldiers.dead), Not(sim.soldiers.captured)]))
}

/** Every soldier who has surrendered, on their way to the rear, in id order. */
export function capturedIds(sim: Simulation): readonly EntityId[] {
  return inIdOrder(query(sim.world, [sim.soldiers.position, sim.soldiers.captured]))
}

/** Every fallen soldier, killed or wounded, still lying where they fell, in id order. */
export function fallenIds(sim: Simulation): readonly EntityId[] {
  return inIdOrder(query(sim.world, [sim.soldiers.position, sim.soldiers.dead, Not(sim.soldiers.evacuated)]))
}

/** Every wounded soldier still lying where he fell, in id order. */
export function woundedIds(sim: Simulation): readonly EntityId[] {
  return inIdOrder(query(sim.world, [sim.soldiers.position, sim.soldiers.wounded]))
}

/** Every wounded soldier carried off the field, in id order. */
export function evacuatedIds(sim: Simulation): readonly EntityId[] {
  return inIdOrder(query(sim.world, [sim.soldiers.position, sim.soldiers.evacuated]))
}

/** Queues a command for the next step. Input, AI and (later) the network all enter the simulation here. */
export function enqueueCommand(sim: Simulation, command: Command): void {
  sim.pendingCommands.push(command)
}

/** Advances the world by exactly one fixed step. */
export function stepSimulation(sim: Simulation): void {
  sim.events.length = 0
  const timer = sim.systemTimer
  for (const [name, system] of SYSTEMS) {
    if (timer) {
      timer(name, () => system(sim))
    } else {
      system(sim)
    }
  }
  sim.tick += 1
}

/** Times a system's work: see `Simulation.systemTimer`. */
export type SystemTimer = (name: string, work: () => void) => void

/** The systems of a step, in the order they run, by name. */
const SYSTEMS: readonly (readonly [string, (sim: Simulation) => void])[] = [
  [
    "sim: commands",
    (sim) => {
      for (const command of sim.pendingCommands.splice(0)) {
        applyCommand(sim, command)
      }
    }
  ],
  ["sim: environment", (sim) => environmentSystem(sim, STEP_SECONDS)],
  ["sim: commanders", commanderSystem],
  ["sim: squads", squadSystem],
  ["sim: navigation", navigationSystem],
  ["sim: reinforcements", reinforcementSystem],
  ["sim: stances", stanceSystem],
  ["sim: flares", flareSystem],
  ["sim: capture", captureSystem],
  ["sim: combat", combatSystem],
  ["sim: artillery", artillerySystem],
  ["sim: gas", gasSystem],
  ["sim: wounds", woundSystem],
  ["sim: movement", (sim) => movementSystem(sim, STEP_SECONDS)],
  ["sim: objectives", objectiveSystem]
]
