import { addComponent, type EntityId, entityExists, hasComponent, removeComponent } from "bitecs"
import { type FireMissionPlan, orderFireMission, Shell } from "./artillery.ts"
import { fireAimed, shakeSquad } from "./combat.ts"
import type { Side } from "./components.ts"
import { clampToMap, type Simulation } from "./simulation.ts"
import type { SquadOrder } from "./squads.ts"

/** Orders a soldier to walk to a ground position. */
export interface MoveToCommand {
  readonly type: "move-to"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
}

/**
 * Steers a directly controlled soldier: a direction on the ground plane, whose length (up to 1) is the fraction of
 * walking speed. A zero vector stops. Steering cancels any move order.
 */
export interface SteerCommand {
  readonly type: "steer"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
}

/** Turns a soldier to face, and aim, along a direction on the ground plane. */
export interface FaceCommand {
  readonly type: "face"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
}

/** Gives a squad a standing order for every member except its leader. */
export interface SquadOrderCommand {
  readonly type: "squad-order"
  readonly squad: number
  readonly order: SquadOrder
}

/**
 * Makes a squad member its leader: the player switching to another soldier. The previous leader stops walking and falls
 * in with the squad's order; the new one drops any order and waits for the player's input.
 */
export interface TakeCommandCommand {
  readonly type: "take-command"
  readonly squad: number
  readonly soldier: EntityId
}

/** Kills a soldier outright. A stand-in for weapons until combat lands, and handy for tests and debugging. */
export interface KillCommand {
  readonly type: "kill"
  readonly soldier: EntityId
}

/**
 * A player pulls the trigger: the soldier fires along their facing, at the enemy nearest the aim within a narrow cone.
 * Ignored while the weapon is still reloading.
 */
export interface FireCommand {
  readonly type: "fire"
  readonly soldier: EntityId
}

/** Orders a side's batteries to fire on a target: a bombardment, a call for fire, or any other barrage. */
export interface FireMissionCommand {
  readonly type: "fire-mission"
  readonly plan: FireMissionPlan
}

/**
 * An attack behind a creeping barrage: field guns lay a line of fire `startZ`, lifting `lift` metres every `interval`
 * seconds toward the objective and beyond it, and every squad on the side follows `standoff` metres behind it, then
 * rushes the objective when the barrage lifts past.
 */
export interface BarrageAttackCommand {
  readonly type: "barrage-attack"
  readonly side: Side
  readonly fromX: number
  readonly toX: number
  readonly startZ: number
  readonly objectiveZ: number
  readonly roundsPerMinute: number
  readonly lift: number
  readonly interval: number
  readonly standoff: number
  /** Seconds before the barrage opens. */
  readonly delay: number
}

/** Everything that can change the simulation from outside. Grows as mechanics land. */
export type Command =
  | MoveToCommand
  | SteerCommand
  | FaceCommand
  | SquadOrderCommand
  | TakeCommandCommand
  | KillCommand
  | FireCommand
  | FireMissionCommand
  | BarrageAttackCommand

/** A living soldier: fallen soldiers ignore every order. */
function isSoldier(sim: Simulation, entity: EntityId): boolean {
  return (
    entityExists(sim.world, entity) &&
    hasComponent(sim.world, entity, sim.soldiers.position) &&
    !hasComponent(sim.world, entity, sim.soldiers.dead)
  )
}

/** Applies one command. Commands that no longer make sense (a soldier who has died) are ignored. */
export function applyCommand(sim: Simulation, command: Command): void {
  switch (command.type) {
    case "move-to": {
      if (!isSoldier(sim, command.soldier)) {
        return
      }
      const target = clampToMap(sim, command.x, command.z)
      addComponent(sim.world, command.soldier, sim.soldiers.moveOrder)
      sim.soldiers.moveOrder.x[command.soldier] = target.x
      sim.soldiers.moveOrder.z[command.soldier] = target.z
      return
    }
    case "steer": {
      if (!isSoldier(sim, command.soldier)) {
        return
      }
      const length = Math.sqrt(command.x * command.x + command.z * command.z)
      if (!(length > 0)) {
        removeComponent(sim.world, command.soldier, sim.soldiers.steer)
        return
      }
      const scale = length > 1 ? 1 / length : 1
      removeComponent(sim.world, command.soldier, sim.soldiers.moveOrder)
      addComponent(sim.world, command.soldier, sim.soldiers.steer)
      sim.soldiers.steer.x[command.soldier] = command.x * scale
      sim.soldiers.steer.z[command.soldier] = command.z * scale
      return
    }
    case "face": {
      const length = Math.sqrt(command.x * command.x + command.z * command.z)
      if (!isSoldier(sim, command.soldier) || !(length > 0)) {
        return
      }
      sim.soldiers.facing.x[command.soldier] = command.x / length
      sim.soldiers.facing.z[command.soldier] = command.z / length
      return
    }
    case "squad-order": {
      const squad = sim.squads[command.squad]
      if (squad) {
        squad.order = command.order
      }
      return
    }
    case "take-command": {
      const squad = sim.squads[command.squad]
      if (!squad || !squad.members.includes(command.soldier) || !isSoldier(sim, command.soldier)) {
        return
      }
      if (squad.leader >= 0) {
        removeComponent(sim.world, squad.leader, sim.soldiers.steer)
      }
      removeComponent(sim.world, command.soldier, sim.soldiers.moveOrder)
      squad.leader = command.soldier
      return
    }
    case "kill": {
      if (!isSoldier(sim, command.soldier)) {
        return
      }
      addComponent(sim.world, command.soldier, sim.soldiers.dead)
      removeComponent(sim.world, command.soldier, sim.soldiers.steer)
      removeComponent(sim.world, command.soldier, sim.soldiers.moveOrder)
      sim.soldiers.health.value[command.soldier] = 0
      shakeSquad(sim, command.soldier)
      return
    }
    case "fire": {
      if (isSoldier(sim, command.soldier)) {
        fireAimed(sim, command.soldier)
      }
      return
    }
    case "fire-mission": {
      orderFireMission(sim, command.plan)
      return
    }
    case "barrage-attack": {
      const direction = Math.sign(command.objectiveZ - command.startZ) || 1
      const mission = orderFireMission(sim, {
        side: command.side,
        shell: Shell.FieldHighExplosive,
        fromX: command.fromX,
        toX: command.toX,
        z: command.startZ,
        band: 25,
        roundsPerMinute: command.roundsPerMinute,
        delay: command.delay,
        // Creeping barrages end when they reach their stop line; the duration is only a backstop. JSON has no Infinity.
        duration: 3600,
        // Lift on past the objective onto the support lines, so the attackers can take it.
        creep: { lift: command.lift, interval: command.interval, stopZ: command.objectiveZ + direction * 80 }
      })
      for (const squad of sim.squads) {
        if (squad.side === command.side && squad.leader >= 0) {
          squad.order = {
            kind: "creep",
            mission,
            x: sim.soldiers.position.x[squad.leader],
            standoff: command.standoff,
            objectiveZ: command.objectiveZ
          }
        }
      }
      return
    }
  }
}
