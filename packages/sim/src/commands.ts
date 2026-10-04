import { addComponent, type EntityId, entityExists, hasComponent, removeComponent } from "bitecs"
import { clampToMap, type Simulation } from "./simulation.ts"

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

/** Everything that can change the simulation from outside. Grows as mechanics land. */
export type Command = MoveToCommand | SteerCommand | FaceCommand

function isSoldier(sim: Simulation, entity: EntityId): boolean {
  return entityExists(sim.world, entity) && hasComponent(sim.world, entity, sim.soldiers.position)
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
  }
}
