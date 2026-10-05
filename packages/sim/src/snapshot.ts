import type { BattlefieldMap } from "@verdun/map"
import { addComponent, hasComponent } from "bitecs"
import { type ArtilleryState, copyArtilleryState } from "./artillery.ts"
import { toWeapon, Weapon } from "./combat.ts"
import type { CommanderState } from "./commander.ts"
import { MaskState, Side, Stance } from "./components.ts"
import type { DefenceState } from "./defence.ts"
import { environmentOptions, type EnvironmentState, resumeEnvironment, saveEnvironment } from "./environment.ts"
import type { Flare } from "./flares.ts"
import type { GunCrewState } from "./gun-crews.ts"
import type { ReinforcementState } from "./reinforcements.ts"
import {
  capturedIds,
  createSimulation,
  evacuatedIds,
  fallenIds,
  type Simulation,
  soldierIds,
  spawnSoldier
} from "./simulation.ts"
import type { SpottingState } from "./spotting.ts"
import type { SquadOrder } from "./squads.ts"
import { wireCuts } from "./wire.ts"

/** Bump when the snapshot shape changes, and add a migration for older saves. */
export const SIM_STATE_VERSION = 21

export interface SoldierState {
  readonly id: number
  readonly side: Side
  readonly x: number
  readonly z: number
  readonly speed: number
  readonly moveOrder: { readonly x: number; readonly z: number; readonly run: boolean } | null
  readonly facing: { readonly x: number; readonly z: number }
  readonly steer: { readonly x: number; readonly z: number; readonly run: boolean } | null
  readonly health: number
  readonly dead: boolean
  readonly captured: boolean
  /** Fallen but alive, waiting for the stretcher-bearers; or carried off the field. */
  readonly wounded: boolean
  readonly evacuated: boolean
  readonly evacuateAt: number
  readonly stamina: number
  readonly spent: boolean
  readonly treatment: number
  readonly weapon: Weapon
  readonly cooldown: number
  readonly target: number
  readonly suppression: number
  readonly morale: number
  readonly stance: Stance
  readonly lastShelled: number
  readonly emergeAt: number
  readonly mask: MaskState
  readonly maskAt: number
  readonly maskClearSince: number
  readonly gasDose: number
  readonly grenades: number
  readonly rifleGrenades: number
  readonly rifleGrenadeReadyAt: number
  /** The step the soldier last fired: the muzzle flash shows at night. */
  readonly firedAt: number
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
  /** Gas concentration in each cell of the gas grid, in mg/m³, and the wind carrying it. */
  readonly gas: readonly number[]
  /** Shell smoke and dust in each cell of the same grid. */
  readonly smoke: readonly number[]
  readonly wind: { readonly x: number; readonly z: number }
  /** Each side's commander: when it lost its front line and when it counter-attacked. */
  readonly commanders: Record<Side, CommanderState>
  /** Wire cut since it was staked: [cell, density left] for each cell shells have touched. */
  readonly wireCuts: readonly (readonly [number, number])[]
  /** Who holds each of the map's objectives, in the map's order. */
  readonly objectives: readonly { readonly holder: Side | -1; readonly contested: boolean }[]
  /** The date and time, how fast days pass, where the weather comes from, and the weather and light last read. */
  readonly environment: EnvironmentState
  /** Each side's men held back to replace wiped-out squads, and replacements on their way up. */
  readonly reinforcements: ReinforcementState
  /** Machine guns that have fired lately, and which the enemy has spotted. */
  readonly spotting: SpottingState
  /** Squadmates on their way to take up fallen gunners' guns. */
  readonly gunCrews: GunCrewState
  /** When each side sent reserves up to its front line on the alarm. */
  readonly defence: DefenceState
  /** Very lights in the air. */
  readonly flares: readonly Flare[]
}

function toSide(value: number): Side {
  return value === Side.German ? Side.German : Side.French
}

function toMask(value: number): MaskState {
  const states: readonly MaskState[] = [MaskState.Off, MaskState.Donning, MaskState.On]
  return states.find((state) => state === value) ?? MaskState.Off
}

function toStance(value: number): Stance {
  const stances: readonly Stance[] = [Stance.Standing, Stance.Prone, Stance.Sheltering, Stance.Crouching]
  return stances.find((stance) => stance === value) ?? Stance.Standing
}

export function takeSnapshot(sim: Simulation): SimulationSnapshot {
  const { position, side, speed, moveOrder, facing, steer, health, dead, weapon, target, suppression, morale } =
    sim.soldiers
  const soldiers = [
    ...Array.from(soldierIds(sim)),
    ...Array.from(fallenIds(sim)),
    ...Array.from(capturedIds(sim)),
    ...Array.from(evacuatedIds(sim))
  ]
    .sort((a, b) => a - b)
    .map((id): SoldierState => ({
      id,
      side: toSide(side.value[id]),
      x: position.x[id],
      z: position.z[id],
      speed: speed.value[id],
      moveOrder: hasComponent(sim.world, id, moveOrder)
        ? { x: moveOrder.x[id], z: moveOrder.z[id], run: moveOrder.run[id] === 1 }
        : null,
      facing: { x: facing.x[id], z: facing.z[id] },
      steer: hasComponent(sim.world, id, steer) ? { x: steer.x[id], z: steer.z[id], run: steer.run[id] === 1 } : null,
      health: health.value[id],
      dead: hasComponent(sim.world, id, dead),
      captured: hasComponent(sim.world, id, sim.soldiers.captured),
      wounded: hasComponent(sim.world, id, sim.soldiers.wounded),
      evacuated: hasComponent(sim.world, id, sim.soldiers.evacuated),
      evacuateAt: sim.soldiers.casualty.evacuateAt[id],
      stamina: sim.soldiers.stamina.value[id],
      spent: sim.soldiers.stamina.spent[id] === 1,
      treatment: sim.soldiers.casualty.treatment[id],
      weapon: toWeapon(weapon.kind[id]),
      cooldown: weapon.cooldown[id],
      target: target.id[id],
      suppression: suppression.value[id],
      morale: morale.value[id],
      stance: toStance(sim.soldiers.stance.value[id]),
      lastShelled: sim.soldiers.shelter.lastShelled[id],
      emergeAt: sim.soldiers.shelter.emergeAt[id],
      mask: toMask(sim.soldiers.mask.state[id]),
      maskAt: sim.soldiers.mask.at[id],
      maskClearSince: sim.soldiers.mask.clearSince[id],
      gasDose: sim.soldiers.gasDose.value[id],
      grenades: sim.soldiers.grenades.count[id],
      rifleGrenades: sim.soldiers.rifleGrenades.count[id],
      rifleGrenadeReadyAt: sim.soldiers.rifleGrenades.readyAt[id],
      firedAt: sim.soldiers.weapon.firedAt[id]
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
    artillery: copyArtilleryState(sim.artillery),
    gas: Array.from(sim.gas.concentration),
    smoke: Array.from(sim.smoke.concentration),
    wind: { x: sim.wind.x, z: sim.wind.z },
    commanders: {
      [Side.French]: { ...sim.commanders[Side.French] },
      [Side.German]: { ...sim.commanders[Side.German] }
    },
    wireCuts: wireCuts(sim.wire),
    objectives: sim.objectives.map(({ holder, contested }) => ({ holder, contested })),
    environment: saveEnvironment(sim.environment),
    reinforcements: {
      pool: { ...sim.reinforcements.pool },
      full: { ...sim.reinforcements.full },
      arrivals: sim.reinforcements.arrivals.map((arrival) => ({ ...arrival }))
    },
    spotting: {
      sightings: sim.spotting.sightings.map((sighting) => ({ ...sighting })),
      counterFire: sim.spotting.counterFire
    },
    gunCrews: { pickups: sim.gunCrews.pickups.map((pickup) => ({ ...pickup })) },
    defence: { alarmedAt: { ...sim.defence.alarmedAt } },
    flares: sim.flares.map((flare) => ({ ...flare }))
  }
}

/**
 * Rebuilds a simulation from a snapshot. Soldier ids must be 1..n in order, which holds because soldiers are never
 * removed: the fallen stay on the battlefield. If entities are ever removed, the snapshot must also carry the entity
 * index so recycled ids restore identically.
 */
export function restoreSimulation(map: BattlefieldMap, snapshot: SimulationSnapshot): Simulation {
  const sim = createSimulation({
    map,
    seed: snapshot.rngState,
    wind: snapshot.wind,
    environment: environmentOptions(snapshot.environment)
  })
  resumeEnvironment(sim.environment, snapshot.environment)
  sim.wind.x = snapshot.wind.x
  sim.wind.z = snapshot.wind.z
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
      sim.soldiers.moveOrder.run[id] = soldier.moveOrder.run ? 1 : 0
    }
    if (soldier.steer) {
      addComponent(sim.world, id, sim.soldiers.steer)
      sim.soldiers.steer.x[id] = soldier.steer.x
      sim.soldiers.steer.z[id] = soldier.steer.z
      sim.soldiers.steer.run[id] = soldier.steer.run ? 1 : 0
    }
    sim.soldiers.health.value[id] = soldier.health
    sim.soldiers.weapon.cooldown[id] = soldier.cooldown
    sim.soldiers.target.id[id] = soldier.target
    sim.soldiers.suppression.value[id] = soldier.suppression
    sim.soldiers.morale.value[id] = soldier.morale
    sim.soldiers.stance.value[id] = soldier.stance
    sim.soldiers.shelter.lastShelled[id] = soldier.lastShelled
    sim.soldiers.shelter.emergeAt[id] = soldier.emergeAt
    sim.soldiers.mask.state[id] = soldier.mask
    sim.soldiers.mask.at[id] = soldier.maskAt
    sim.soldiers.mask.clearSince[id] = soldier.maskClearSince
    sim.soldiers.gasDose.value[id] = soldier.gasDose
    sim.soldiers.grenades.count[id] = soldier.grenades
    sim.soldiers.rifleGrenades.count[id] = soldier.rifleGrenades
    sim.soldiers.rifleGrenades.readyAt[id] = soldier.rifleGrenadeReadyAt
    sim.soldiers.weapon.firedAt[id] = soldier.firedAt
    if (soldier.dead) {
      addComponent(sim.world, id, sim.soldiers.dead)
    }
    if (soldier.captured) {
      addComponent(sim.world, id, sim.soldiers.captured)
    }
    if (soldier.wounded) {
      addComponent(sim.world, id, sim.soldiers.wounded)
    }
    if (soldier.evacuated) {
      addComponent(sim.world, id, sim.soldiers.evacuated)
    }
    sim.soldiers.casualty.evacuateAt[id] = soldier.evacuateAt
    sim.soldiers.stamina.value[id] = soldier.stamina
    sim.soldiers.stamina.spent[id] = soldier.spent ? 1 : 0
    sim.soldiers.casualty.treatment[id] = soldier.treatment
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
  Object.assign(sim.artillery.ammunition, artillery.ammunition)
  sim.gas.concentration.set(snapshot.gas)
  sim.gas.active = snapshot.gas.some((value) => value > 0)
  sim.smoke.concentration.set(snapshot.smoke)
  sim.smoke.active = snapshot.smoke.some((value) => value > 0)
  Object.assign(sim.commanders[Side.French], snapshot.commanders[Side.French])
  Object.assign(sim.commanders[Side.German], snapshot.commanders[Side.German])
  for (const [cell, density] of snapshot.wireCuts) {
    sim.wire.density[cell] = density
  }
  sim.wire.cuts = snapshot.wireCuts.length
  Object.assign(sim.reinforcements.pool, snapshot.reinforcements.pool)
  Object.assign(sim.reinforcements.full, snapshot.reinforcements.full)
  sim.reinforcements.arrivals.push(...snapshot.reinforcements.arrivals.map((arrival) => ({ ...arrival })))
  sim.spotting.sightings.push(...snapshot.spotting.sightings.map((sighting) => ({ ...sighting })))
  sim.spotting.counterFire = snapshot.spotting.counterFire
  sim.gunCrews.pickups.push(...snapshot.gunCrews.pickups.map((pickup) => ({ ...pickup })))
  Object.assign(sim.defence.alarmedAt, snapshot.defence.alarmedAt)
  sim.flares.push(...snapshot.flares.map((flare) => ({ ...flare })))
  snapshot.objectives.forEach((saved, index) => {
    const objective = sim.objectives[index]
    if (objective) {
      objective.holder = saved.holder
      objective.contested = saved.contested
    }
  })
  return sim
}
