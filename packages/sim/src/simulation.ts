import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import { addComponent, addEntity, createWorld, type EntityId, Not, query, type QueryResult, type World } from "bitecs"
import { applyCommand, type Command } from "./commands.ts"
import { createSoldierComponents, Side, type SoldierComponents } from "./components.ts"
import { createRng, type Rng } from "./rng.ts"
import { type Squad, squadSystem } from "./squads.ts"
import { movementSystem } from "./systems/movement.ts"

/** Simulation steps per second. */
export const TICK_RATE = 20
export const STEP_SECONDS = 1 / TICK_RATE

const DEFAULT_CAPACITY = 8192
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
  tick: number
}

export interface SimulationOptions {
  readonly map: BattlefieldMap
  readonly seed: number
  /** Highest entity id + 1 the component stores can hold. */
  readonly capacity?: number
}

export function createSimulation({ map, seed, capacity = DEFAULT_CAPACITY }: SimulationOptions): Simulation {
  return {
    map,
    world: createWorld(),
    soldiers: createSoldierComponents(capacity),
    capacity,
    rng: createRng(seed),
    pendingCommands: [],
    squads: [],
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
}

export function spawnSoldier(sim: Simulation, { side, x, z, speed = WALKING_SPEED, facing }: SoldierSpawn): EntityId {
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
  const towardEnemy = side === Side.French ? 1 : -1
  facingStore.x[soldier] = facing?.x ?? 0
  facingStore.z[soldier] = facing?.z ?? towardEnemy
  return soldier
}

/** Every living soldier. The result is owned by the ECS: read it, don't keep it across steps. */
export function soldierIds(sim: Simulation): QueryResult {
  return query(sim.world, [sim.soldiers.position, Not(sim.soldiers.dead)])
}

/** Every fallen soldier, still lying where they fell. */
export function fallenIds(sim: Simulation): QueryResult {
  return query(sim.world, [sim.soldiers.position, sim.soldiers.dead])
}

/** Queues a command for the next step. Input, AI and (later) the network all enter the simulation here. */
export function enqueueCommand(sim: Simulation, command: Command): void {
  sim.pendingCommands.push(command)
}

/** Advances the world by exactly one fixed step. */
export function stepSimulation(sim: Simulation): void {
  for (const command of sim.pendingCommands.splice(0)) {
    applyCommand(sim, command)
  }
  squadSystem(sim)
  movementSystem(sim, STEP_SECONDS)
  sim.tick += 1
}
