export {
  type ArtilleryState,
  type BurstEvent,
  type Creep,
  DEFENSIVE_BARRAGE_DELAY,
  type FireMission,
  type FireMissionPlan,
  frontLineZ,
  Shell,
  SHELLS,
  type ShellInFlight
} from "./artillery.ts"
export type { EntityId } from "bitecs"
export { BROKEN_MORALE, fireAimed, hitChance, PINNED, type ShotEvent, shotEvents, Weapon, WEAPONS } from "./combat.ts"
export type {
  Command,
  BarrageAttackCommand,
  FireCommand,
  FireMissionCommand,
  FaceCommand,
  KillCommand,
  MoveToCommand,
  SquadOrderCommand,
  StanceCommand,
  SteerCommand,
  TakeCommandCommand
} from "./commands.ts"
export { Side, Stance } from "./components.ts"
export { type CaptureEvent, surrender } from "./capture.ts"
export {
  capturedIds,
  createSimulation,
  enqueueCommand,
  fallenIds,
  type Simulation,
  type SimEvent,
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
export { CRAWL_FACTOR, isInTrench, isSheltering, PRONE_EYE_HEIGHT, SHELTER_CALM, soldierEye } from "./stance.ts"
