import type { BattlefieldMap } from "@verdun/map"
import { addComponent, hasComponent } from "bitecs"
import { type ArtilleryState, copyArtilleryState } from "./artillery.ts"
import { Weapon } from "./combat.ts"
import { Side, Stance } from "./components.ts"
import { capturedIds, createSimulation, fallenIds, type Simulation, soldierIds, spawnSoldier } from "./simulation.ts"
import type { SquadOrder } from "./squads.ts"

/** Bump when the snapshot shape changes, and add a migration for older saves. */
export const SIM_STATE_VERSION = 6

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
  readonly captured: boolean
  readonly weapon: Weapon
  readonly cooldown: number
  readonly target: number
  readonly suppression: number
  readonly morale: number
  readonly stance: Stance
  readonly lastShelled: number
  readonly emergeAt: number
}

export interface SquadState {
  readonly side: Side
  readonly members: readonly number[]
  readonly leader: number
  readonly order: SquadOrder
  readonly controller: "player" | "ai"
}

/** Everything needed to resume a simulation exactly: the basis of save files and crash recovery. */
export interface SimulationSnapshot {
  readonly version: typeof SIM_STATE_VERSION
  readonly tick: number
  readonly rngState: number
  readonly soldiers: readonly SoldierState[]
  /** In squad id order. */
  readonly squads: readonly SquadState[]
  /** Fire missions and shells in flight. Craters already dug are in the map, which saves separately. */
  readonly artillery: ArtilleryState
}

function toSide(value: number): Side {
  return value === Side.German ? Side.German : Side.French
}

function toStance(value: number): Stance {
  const stances: readonly Stance[] = [Stance.Standing, Stance.Prone, Stance.Sheltering]
  return stances.find((stance) => stance === value) ?? Stance.Standing
}

export function takeSnapshot(sim: Simulation): SimulationSnapshot {
  const { position, side, speed, moveOrder, facing, steer, health, dead, weapon, target, suppression, morale } =
    sim.soldiers
  const soldiers = [...Array.from(soldierIds(sim)), ...Array.from(fallenIds(sim)), ...Array.from(capturedIds(sim))]
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
      dead: hasComponent(sim.world, id, dead),
      captured: hasComponent(sim.world, id, sim.soldiers.captured),
      weapon: weapon.kind[id] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle,
      cooldown: weapon.cooldown[id],
      target: target.id[id],
      suppression: suppression.value[id],
      morale: morale.value[id],
      stance: toStance(sim.soldiers.stance.value[id]),
      lastShelled: sim.soldiers.shelter.lastShelled[id],
      emergeAt: sim.soldiers.shelter.emergeAt[id]
    }))
  const squads = sim.squads.map((squad): SquadState => ({
    side: squad.side,
    members: [...squad.members],
    leader: squad.leader,
    order: squad.order,
    controller: squad.controller
  }))
  return {
    version: SIM_STATE_VERSION,
    tick: sim.tick,
    rngState: sim.rng.state,
    soldiers,
    squads,
    artillery: copyArtilleryState(sim.artillery)
  }
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
      facing: soldier.facing,
      weapon: soldier.weapon
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
    sim.soldiers.weapon.cooldown[id] = soldier.cooldown
    sim.soldiers.target.id[id] = soldier.target
    sim.soldiers.suppression.value[id] = soldier.suppression
    sim.soldiers.morale.value[id] = soldier.morale
    sim.soldiers.stance.value[id] = soldier.stance
    sim.soldiers.shelter.lastShelled[id] = soldier.lastShelled
    sim.soldiers.shelter.emergeAt[id] = soldier.emergeAt
    if (soldier.dead) {
      addComponent(sim.world, id, sim.soldiers.dead)
    }
    if (soldier.captured) {
      addComponent(sim.world, id, sim.soldiers.captured)
    }
  }
  for (const [squadId, squad] of snapshot.squads.entries()) {
    sim.squads.push({
      id: squadId,
      side: squad.side,
      members: [...squad.members],
      leader: squad.leader,
      order: squad.order,
      controller: squad.controller
    })
    for (const member of squad.members) {
      sim.soldiers.squad.id[member] = squadId
    }
  }
  const artillery = copyArtilleryState(snapshot.artillery)
  sim.artillery.missions.push(...artillery.missions)
  sim.artillery.shells.push(...artillery.shells)
  sim.artillery.pendingSightRebuild = artillery.pendingSightRebuild
  Object.assign(sim.artillery.sosCalledAt, artillery.sosCalledAt)
  return sim
}
