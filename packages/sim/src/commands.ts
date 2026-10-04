import { addComponent, type EntityId, entityExists, hasComponent } from "bitecs"
import { clampToMap, type Simulation } from "./simulation.ts"

/** Orders a soldier to walk to a ground position. */
export interface MoveToCommand {
  readonly type: "move-to"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
}

/** Everything that can change the simulation from outside. Grows as mechanics land. */
export type Command = MoveToCommand

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
  }
}
