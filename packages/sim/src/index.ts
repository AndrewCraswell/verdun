export type { EntityId } from "bitecs"
export type { Command, FaceCommand, MoveToCommand, SteerCommand } from "./commands.ts"
export { Side } from "./components.ts"
export {
  createSimulation,
  enqueueCommand,
  type Simulation,
  type SimulationOptions,
  soldierIds,
  type SoldierSpawn,
  spawnSoldier,
  STEP_SECONDS,
  stepSimulation,
  TICK_RATE,
  WALKING_SPEED
} from "./simulation.ts"
export {
  restoreSimulation,
  SIM_STATE_VERSION,
  type SimulationSnapshot,
  type SoldierState,
  takeSnapshot
} from "./snapshot.ts"
export { createFixedStepper, type FixedStepper } from "./stepper.ts"
export { createLineOfSight, EYE_HEIGHT, eyeAt, type LineOfSight, type WorldPoint } from "./line-of-sight.ts"
