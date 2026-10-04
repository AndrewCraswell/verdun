import { type EntityId, query, removeComponent } from "bitecs"
import { PINNED } from "../combat.ts"
import { MaskState, Stance } from "../components.ts"
import { clampToMap, type Simulation } from "../simulation.ts"
import { CRAWL_FACTOR } from "../stance.ts"

/** Walking pace in a gas mask, as a fraction of normal: every breath is drawn through the filter. */
const MASKED_PACE = 0.85

/**
 * Moves soldiers for one step. Directly steered soldiers walk where the player pushes them, or crawl if they're prone.
 * Soldiers with a move order walk straight toward the target, face where they walk, and drop the order on arrival;
 * while pinned they go to ground and wait, and men down a dugout stay there. Breathing through a gas mask slows
 * everyone down.
 */
export function movementSystem(sim: Simulation, stepSeconds: number): void {
  const { position, speed, moveOrder, facing, steer, stance, suppression, mask } = sim.soldiers
  const pace = (soldier: EntityId) =>
    speed.value[soldier] * stepSeconds * (mask.state[soldier] === MaskState.On ? MASKED_PACE : 1)
  const arrived: EntityId[] = []

  for (const soldier of query(sim.world, [position, steer])) {
    const stride = pace(soldier) * (stance.value[soldier] === Stance.Prone ? CRAWL_FACTOR : 1)
    const next = clampToMap(
      sim,
      position.x[soldier] + steer.x[soldier] * stride,
      position.z[soldier] + steer.z[soldier] * stride
    )
    position.x[soldier] = next.x
    position.z[soldier] = next.z
  }

  for (const soldier of query(sim.world, [position, moveOrder])) {
    if (suppression.value[soldier] >= PINNED || stance.value[soldier] === Stance.Sheltering) {
      continue
    }
    const dx = moveOrder.x[soldier] - position.x[soldier]
    const dz = moveOrder.z[soldier] - position.z[soldier]
    // Math.sqrt is correctly rounded on every engine; Math.hypot is not, which would break determinism.
    const distance = Math.sqrt(dx * dx + dz * dz)
    const stride = pace(soldier)

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
