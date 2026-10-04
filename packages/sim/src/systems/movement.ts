import { type EntityId, query, removeComponent } from "bitecs"
import { clampToMap, type Simulation } from "../simulation.ts"

/**
 * Moves soldiers for one step. Directly steered soldiers walk where the player pushes them. Soldiers with a move order
 * walk straight toward the target, face where they walk, and drop the order on arrival.
 */
export function movementSystem(sim: Simulation, stepSeconds: number): void {
  const { position, speed, moveOrder, facing, steer } = sim.soldiers
  const arrived: EntityId[] = []

  for (const soldier of query(sim.world, [position, steer])) {
    const stride = speed.value[soldier] * stepSeconds
    const next = clampToMap(
      sim,
      position.x[soldier] + steer.x[soldier] * stride,
      position.z[soldier] + steer.z[soldier] * stride
    )
    position.x[soldier] = next.x
    position.z[soldier] = next.z
  }

  for (const soldier of query(sim.world, [position, moveOrder])) {
    const dx = moveOrder.x[soldier] - position.x[soldier]
    const dz = moveOrder.z[soldier] - position.z[soldier]
    // Math.sqrt is correctly rounded on every engine; Math.hypot is not, which would break determinism.
    const distance = Math.sqrt(dx * dx + dz * dz)
    const stride = speed.value[soldier] * stepSeconds

    if (distance <= stride) {
      position.x[soldier] = moveOrder.x[soldier]
      position.z[soldier] = moveOrder.z[soldier]
      arrived.push(soldier)
    } else {
      position.x[soldier] += (dx / distance) * stride
      position.z[soldier] += (dz / distance) * stride
    }
    if (distance > 0) {
      facing.x[soldier] = dx / distance
      facing.z[soldier] = dz / distance
    }
  }

  // Removing components while iterating a query would skip entities, so orders are cleared afterwards.
  for (const soldier of arrived) {
    removeComponent(sim.world, soldier, moveOrder)
  }
}
