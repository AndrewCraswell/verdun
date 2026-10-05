export {
  type ArtilleryState,
  type BurstEvent,
  type Creep,
  DEFENSIVE_BARRAGE_DELAY,
  type FireMission,
  addAmmunition,
  type FireMissionPlan,
  frontLineSpan,
  frontLineZ,
  type LineSpan,
  Shell,
  SHELLS,
  type OutOfShellsEvent,
  type ShellInFlight,
  UNLIMITED
} from "./artillery.ts"
export type { EntityId } from "bitecs"
export {
  BROKEN_MORALE,
  aimedTarget,
  fireAimed,
  GRENADE_FUSE,
  hitChance,
  PINNED,
  type ShotEvent,
  shotEvents,
  throwError,
  type ThrowEvent,
  type ThrownGrenade,
  Weapon,
  WEAPONS
} from "./combat.ts"
export type {
  AmmunitionCommand,
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
  ThrowGrenadeCommand,
  WindCommand,
  ClockCommand,
  ForecastCommand,
  TakeCommandCommand,
  TakeOverSquadCommand,
  JoinSquadCommand
} from "./commands.ts"
export { MaskState, Side, Stance } from "./components.ts"
export { type CaptureEvent, surrender } from "./capture.ts"
export { COUNTER_ATTACK_DELAY, type CommanderState, type CounterAttackEvent, type Stretch } from "./commander.ts"
export {
  attackBehindBarrage,
  bombardEnemyLine,
  bombardmentAt,
  chooseStretch,
  firstWave,
  type OperationOverEvent,
  type OperationPlan,
  type OperationResult,
  type OperationState,
  type OperationTally,
  PLAYTEST_OPERATION,
  planOperation,
  type SecondWaveEvent,
  type SideTally,
  type ZeroHourEvent
} from "./operation.ts"
export {
  capturedIds,
  createSimulation,
  enqueueCommand,
  evacuatedIds,
  FULL_STAMINA,
  fallenIds,
  GRENADES_CARRIED,
  type Simulation,
  type SimEvent,
  type SimulationOptions,
  soldierIds,
  type SoldierSpawn,
  type SystemTimer,
  spawnSoldier,
  STEP_SECONDS,
  stepSimulation,
  TICK_RATE,
  WALKING_SPEED,
  woundedIds
} from "./simulation.ts"
export {
  AID_POST_PLACES,
  aidPost,
  BEARER_TEAMS,
  casualty,
  type CasualtyCause,
  type CasualtyEvent,
  type CasualtyKind,
  type FallenEvent,
  KILLED_OUTRIGHT,
  type WoundedEvent
} from "./wounds.ts"
export {
  allotReinforcements,
  arrivalOf,
  type ReinforcementEvent,
  type ReinforcementState,
  type SquadTakenOverEvent,
  TAKE_OVER_MIN_MEN,
  joinRefusal,
  joinSquad,
  takeOverCandidates,
  takeOverSquad
} from "./reinforcements.ts"
export { type GunSighting, type GunSpottedEvent, SPOTTED_SECONDS, spottedGuns } from "./spotting.ts"
export type { GunMannedEvent } from "./gun-crews.ts"
export type { CounterThrustEvent, StandToEvent } from "./defence.ts"
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
export { EYE_HEIGHT, eyeAt, type LineOfSight, type WorldPoint } from "./line-of-sight.ts"
export {
  CRAWL_FACTOR,
  isInTrench,
  isSheltering,
  PRONE_EYE_HEIGHT,
  seesOverParapet,
  SHELTER_CALM,
  soldierEye
} from "./stance.ts"
export { canRun, WINDED } from "./systems/movement.ts"
export { blockReach, insideBlock, type SightBlock, sightBlocks } from "./sight-shapes.ts"
export { climbLimit } from "./terrain.ts"
export {
  concentrationAt,
  GAS_CELL,
  GAS_DETECTED,
  GAS_INTERVAL,
  type GasField,
  gasTolerance,
  INCAPACITATING_DOSE,
  MASK_LEAK,
  releaseGas
} from "./gas.ts"
export { SMOKE_EXTINCTION, seesThroughSmoke, smokeBetween } from "./smoke.ts"
export { type ObjectiveState, type ObjectiveTakenEvent, sectorControl } from "./objectives.ts"
export { WIRE_CELL, wireAt, type WireCutEvent, type WireField, wirePace } from "./wire.ts"
export {
  clockAt,
  clockMoment,
  DAY,
  DEFAULT_MINUTES_PER_DAY,
  DEFAULT_WEEK,
  type Environment,
  type EnvironmentOptions,
  type EnvironmentState,
  timeScale,
  WEEK,
  type WorldClock
} from "./environment.ts"
export { FLEURY, type GeoLocation, type Sky, type SkyPosition, skyAt } from "./sky.ts"
export { type Forecast, type ForecastSpec, typicalWeather, type Weather, WeatherPattern } from "./weather.ts"
export {
  DARK_LUX,
  FLARE,
  type Flare,
  flareBrightness,
  type FlareEvent,
  flareLight,
  flarePosition,
  isDark
} from "./flares.ts"
export { aimInLight, canMakeOut, FLASH_REACH, FLASH_SECONDS, isFlashing, lightAt, sightReach } from "./sight.ts"
export {
  GRENADE_RANGE,
  type GrenadeFlight,
  grenadeFlight,
  type GroundPoint,
  type Lob,
  lob,
  throwReach
} from "./grenade.ts"
export { isNight, isStandTo } from "./routine.ts"
export { weatherPace } from "./ground.ts"
export {
  ARMISTICE,
  CUTOFF_HOUR,
  DEFAULT_SCHEDULE,
  lastCutoff,
  scheduleForWeek,
  type Season,
  SEASONS,
  seasonWeeks,
  WAR_BEGINS,
  type WarDay,
  warDayAt,
  warWeekOf,
  type WarSchedule
} from "./war-calendar.ts"
export { type DayOutlook, dayOutlook, type ForecastDay, forecastDay, forecastFrom, windFrom } from "./outlook.ts"
export { loadWeatherRegion, WEATHER_REGIONS, type WeatherRegion } from "./records.ts"
export { applySync, createSyncSource, type GroundPatch, type SimSync, type SyncSource } from "./sync.ts"
