import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import { addComponent, addEntity, createWorld, type EntityId, Not, query, type QueryResult, type World } from "bitecs"
import { type ArtilleryState, artillerySystem, type BurstEvent, createArtilleryState } from "./artillery.ts"
import { captureSystem, type CaptureEvent } from "./capture.ts"
import { combatSystem, type ShotEvent, type ThrowEvent, Weapon } from "./combat.ts"
import { type CommanderState, commanderSystem, type CounterAttackEvent, createCommanders } from "./commander.ts"
import { applyCommand, type Command } from "./commands.ts"
import { createSoldierComponents, MaskState, NEVER, Side, type SoldierComponents, Stance } from "./components.ts"
import { createGasField, type GasField, gasSystem } from "./gas.ts"
import type { LineOfSight } from "./line-of-sight.ts"
import { createRng, type Rng } from "./rng.ts"
import { type Squad, squadSystem } from "./squads.ts"
import { stanceSystem } from "./stance.ts"
import { movementSystem } from "./systems/movement.ts"
import { createWireField, type WireCutEvent, type WireField } from "./wire.ts"

/** Simulation steps per second. */
export const TICK_RATE = 20
export const STEP_SECONDS = 1 / TICK_RATE

const DEFAULT_CAPACITY = 8192
/** Hand grenades each soldier goes into action with. Bombers carried a sackful; riflemen two to four. */
export const GRENADES_CARRIED = 3
/** Average marching pace with kit, in metres per second. */
export const WALKING_SPEED = 1.4

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
  /** Each side's commander: whether it has lost its front line and counter-attacked. */
  readonly commanders: Record<Side, CommanderState>
  /** What happened during the last step, for renderers: shots fired and shells landing. Replaced every step. */
  readonly events: SimEvent[]
  tick: number
}

/** Something that happened during a step that a renderer may want to show. */
export type SimEvent = ShotEvent | ThrowEvent | BurstEvent | CaptureEvent | CounterAttackEvent | WireCutEvent

export interface SimulationOptions {
  readonly map: BattlefieldMap
  readonly seed: number
  /** Highest entity id + 1 the component stores can hold. */
  readonly capacity?: number
  /** Wind near the ground, in metres per second. Defaults to a light westerly, Verdun's prevailing wind. */
  readonly wind?: { readonly x: number; readonly z: number }
}

export function createSimulation({
  map,
  seed,
  capacity = DEFAULT_CAPACITY,
  wind = { x: 2, z: 0.5 }
}: SimulationOptions): Simulation {
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
    wind: { x: wind.x, z: wind.z },
    commanders: createCommanders(),
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

/** Every fallen soldier, still lying where they fell, in id order. */
export function fallenIds(sim: Simulation): readonly EntityId[] {
  return inIdOrder(query(sim.world, [sim.soldiers.position, sim.soldiers.dead]))
}

/** Queues a command for the next step. Input, AI and (later) the network all enter the simulation here. */
export function enqueueCommand(sim: Simulation, command: Command): void {
  sim.pendingCommands.push(command)
}

/** Advances the world by exactly one fixed step. */
export function stepSimulation(sim: Simulation): void {
  sim.events.length = 0
  for (const command of sim.pendingCommands.splice(0)) {
    applyCommand(sim, command)
  }
  commanderSystem(sim)
  squadSystem(sim)
  stanceSystem(sim)
  captureSystem(sim)
  combatSystem(sim)
  artillerySystem(sim)
  gasSystem(sim)
  movementSystem(sim, STEP_SECONDS)
  sim.tick += 1
}
