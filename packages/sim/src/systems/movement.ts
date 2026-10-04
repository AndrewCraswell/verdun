import { type EntityId, query, removeComponent } from "bitecs"
import type { Simulation } from "../simulation.ts"

/** Walks every soldier with a move order straight toward its target, and clears the order on arrival. */
export function movementSystem(sim: Simulation, stepSeconds: number): void {
  const { position, speed, moveOrder } = sim.soldiers
  const arrived: EntityId[] = []

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
  }

  // Removing components while iterating a query would skip entities, so orders are cleared afterwards.
  for (const soldier of arrived) {
    removeComponent(sim.world, soldier, moveOrder)
  }
}
