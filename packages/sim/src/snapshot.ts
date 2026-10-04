import type { BattlefieldMap } from "@verdun/map"
import { addComponent, hasComponent } from "bitecs"
import { Side } from "./components.ts"
import { createSimulation, fallenIds, type Simulation, soldierIds, spawnSoldier } from "./simulation.ts"
import type { SquadOrder } from "./squads.ts"

/** Bump when the snapshot shape changes, and add a migration for older saves. */
export const SIM_STATE_VERSION = 3

export interface SoldierState {
  readonly id: number
  readonly side: Side
  readonly x: number
  readonly z: number
  readonly speed: number
  readonly moveOrder: { readonly x: number; readonly z: number } | null
  readonly facing: { readonly x: number; readonly z: number }
  readonly steer: { readonly x: number; readonly z: number } | null
  readonly health: number
  readonly dead: boolean
}

export interface SquadState {
  readonly side: Side
  readonly members: readonly number[]
  readonly leader: number
  readonly order: SquadOrder
}

/** Everything needed to resume a simulation exactly: the basis of save files and crash recovery. */
export interface SimulationSnapshot {
  readonly version: typeof SIM_STATE_VERSION
  readonly tick: number
  readonly rngState: number
  readonly soldiers: readonly SoldierState[]
  /** In squad id order. */
  readonly squads: readonly SquadState[]
}

function toSide(value: number): Side {
  return value === Side.German ? Side.German : Side.French
}

export function takeSnapshot(sim: Simulation): SimulationSnapshot {
  const { position, side, speed, moveOrder, facing, steer, health, dead } = sim.soldiers
  const soldiers = [...Array.from(soldierIds(sim)), ...Array.from(fallenIds(sim))]
    .sort((a, b) => a - b)
    .map((id): SoldierState => ({
      id,
      side: toSide(side.value[id]),
      x: position.x[id],
      z: position.z[id],
      speed: speed.value[id],
      moveOrder: hasComponent(sim.world, id, moveOrder) ? { x: moveOrder.x[id], z: moveOrder.z[id] } : null,
      facing: { x: facing.x[id], z: facing.z[id] },
      steer: hasComponent(sim.world, id, steer) ? { x: steer.x[id], z: steer.z[id] } : null,
      health: health.value[id],
      dead: hasComponent(sim.world, id, dead)
    }))
  const squads = sim.squads.map((squad): SquadState => ({
    side: squad.side,
    members: [...squad.members],
    leader: squad.leader,
    order: squad.order
  }))
  return { version: SIM_STATE_VERSION, tick: sim.tick, rngState: sim.rng.state, soldiers, squads }
}

/**
 * Rebuilds a simulation from a snapshot. Soldier ids must be 1..n in order, which holds because soldiers are never
 * removed: the fallen stay on the battlefield. If entities are ever removed, the snapshot must also carry the entity
 * index so recycled ids restore identically.
 */
export function restoreSimulation(map: BattlefieldMap, snapshot: SimulationSnapshot): Simulation {
  const sim = createSimulation({ map, seed: snapshot.rngState })
  sim.tick = snapshot.tick
  for (const soldier of snapshot.soldiers) {
    const id = spawnSoldier(sim, {
      side: soldier.side,
      x: soldier.x,
      z: soldier.z,
      speed: soldier.speed,
      facing: soldier.facing
    })
    if (id !== soldier.id) {
      throw new Error(`Snapshot soldier ids must be contiguous from 1; expected ${soldier.id}, got ${id}`)
    }
    if (soldier.moveOrder) {
      addComponent(sim.world, id, sim.soldiers.moveOrder)
      sim.soldiers.moveOrder.x[id] = soldier.moveOrder.x
      sim.soldiers.moveOrder.z[id] = soldier.moveOrder.z
    }
    if (soldier.steer) {
      addComponent(sim.world, id, sim.soldiers.steer)
      sim.soldiers.steer.x[id] = soldier.steer.x
      sim.soldiers.steer.z[id] = soldier.steer.z
    }
    sim.soldiers.health.value[id] = soldier.health
    if (soldier.dead) {
      addComponent(sim.world, id, sim.soldiers.dead)
    }
  }
  for (const [squadId, squad] of snapshot.squads.entries()) {
    sim.squads.push({
      id: squadId,
      side: squad.side,
      members: [...squad.members],
      leader: squad.leader,
      order: squad.order
    })
    for (const member of squad.members) {
      sim.soldiers.squad.id[member] = squadId
    }
  }
  return sim
}
