export type { EntityId } from "bitecs"
export { BROKEN_MORALE, fireAimed, hitChance, type ShotEvent, Weapon, WEAPONS } from "./combat.ts"
export type {
  Command,
  FireCommand,
  FaceCommand,
  KillCommand,
  MoveToCommand,
  SquadOrderCommand,
  SteerCommand,
  TakeCommandCommand
} from "./commands.ts"
export { Side } from "./components.ts"
export {
  createSimulation,
  enqueueCommand,
  fallenIds,
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
export { createSquad, isAlive, nextLivingMember, type Squad, type SquadOrder, SQUAD_THINK_INTERVAL } from "./squads.ts"
export {
  restoreSimulation,
  SIM_STATE_VERSION,
  type SimulationSnapshot,
  type SquadState,
  type SoldierState,
  takeSnapshot
} from "./snapshot.ts"
export { createFixedStepper, type FixedStepper } from "./stepper.ts"
export { createLineOfSight, EYE_HEIGHT, eyeAt, type LineOfSight, type WorldPoint } from "./line-of-sight.ts"
