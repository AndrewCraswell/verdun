import { type EntityId, query, removeComponent } from "bitecs"
import { PINNED } from "../combat.ts"
import { MaskState, Stance } from "../components.ts"
import { clampToMap, type Simulation } from "../simulation.ts"
import { CRAWL_FACTOR } from "../stance.ts"
import { groundPace } from "../terrain.ts"

/** Walking pace in a gas mask, as a fraction of normal: every breath is drawn through the filter. */
const MASKED_PACE = 0.85
/** Running with 30 kg of kit: about twice walking pace, for a short dash. */
const RUN_FACTOR = 2

/**
 * Moves soldiers for one step. Directly steered soldiers walk where the player pushes them, or crawl if they're prone.
 * Soldiers with a move order walk straight toward the target, face where they walk, and drop the order on arrival;
 * while pinned they go to ground and wait, and men down a dugout stay there. Mud, churned ground and slopes slow
 * everyone, a trench wall most of all, and so does breathing through a gas mask.
 */
export function movementSystem(sim: Simulation, stepSeconds: number): void {
  const { position, speed, moveOrder, facing, steer, stance, suppression, mask } = sim.soldiers
  const pace = (soldier: EntityId) =>
    speed.value[soldier] * stepSeconds * (mask.state[soldier] === MaskState.On ? MASKED_PACE : 1)
  const arrived: EntityId[] = []

  for (const soldier of query(sim.world, [position, steer])) {
    const length = Math.sqrt(steer.x[soldier] ** 2 + steer.z[soldier] ** 2)
    const ground =
      length > 0
        ? groundPace(
            sim.map,
            position.x[soldier],
            position.z[soldier],
            steer.x[soldier] / length,
            steer.z[soldier] / length
          )
        : 1
    const stride = pace(soldier) * ground * (stance.value[soldier] === Stance.Prone ? CRAWL_FACTOR : 1)
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
    const running = moveOrder.run[soldier] === 1 && stance.value[soldier] === Stance.Standing
    const stride =
      distance > 0
        ? pace(soldier) *
          (running ? RUN_FACTOR : 1) *
          groundPace(sim.map, position.x[soldier], position.z[soldier], dx / distance, dz / distance)
        : 0

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
