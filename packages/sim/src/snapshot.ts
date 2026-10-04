import type { BattlefieldMap } from "@verdun/map"
import { addComponent, hasComponent } from "bitecs"
import { Side } from "./components.ts"
import { createSimulation, type Simulation, soldierIds, spawnSoldier } from "./simulation.ts"

/** Bump when the snapshot shape changes, and add a migration for older saves. */
export const SIM_STATE_VERSION = 1

export interface SoldierState {
  readonly id: number
  readonly side: Side
  readonly x: number
  readonly z: number
  readonly speed: number
  readonly moveOrder: { readonly x: number; readonly z: number } | null
}

/** Everything needed to resume a simulation exactly: the basis of save files and crash recovery. */
export interface SimulationSnapshot {
  readonly version: typeof SIM_STATE_VERSION
  readonly tick: number
  readonly rngState: number
  readonly soldiers: readonly SoldierState[]
}

function toSide(value: number): Side {
  return value === Side.German ? Side.German : Side.French
}

export function takeSnapshot(sim: Simulation): SimulationSnapshot {
  const { position, side, speed, moveOrder } = sim.soldiers
  const soldiers = Array.from(soldierIds(sim))
    .sort((a, b) => a - b)
    .map((id): SoldierState => ({
      id,
      side: toSide(side.value[id]),
      x: position.x[id],
      z: position.z[id],
      speed: speed.value[id],
      moveOrder: hasComponent(sim.world, id, moveOrder) ? { x: moveOrder.x[id], z: moveOrder.z[id] } : null
    }))
  return { version: SIM_STATE_VERSION, tick: sim.tick, rngState: sim.rng.state, soldiers }
}

/**
 * Rebuilds a simulation from a snapshot. Soldier ids must be 1..n in order, which holds while soldiers are only ever
 * added. When removal lands, the snapshot must also carry the entity index so recycled ids restore identically.
 */
export function restoreSimulation(map: BattlefieldMap, snapshot: SimulationSnapshot): Simulation {
  const sim = createSimulation({ map, seed: snapshot.rngState })
  sim.tick = snapshot.tick
  for (const soldier of snapshot.soldiers) {
    const id = spawnSoldier(sim, { side: soldier.side, x: soldier.x, z: soldier.z, speed: soldier.speed })
    if (id !== soldier.id) {
      throw new Error(`Snapshot soldier ids must be contiguous from 1; expected ${soldier.id}, got ${id}`)
    }
    if (soldier.moveOrder) {
      addComponent(sim.world, id, sim.soldiers.moveOrder)
      sim.soldiers.moveOrder.x[id] = soldier.moveOrder.x
      sim.soldiers.moveOrder.z[id] = soldier.moveOrder.z
    }
  }
  return sim
}
