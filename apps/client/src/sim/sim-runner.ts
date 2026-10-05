import { decodeElevation, generateFleurySector } from "@verdun/map"
import {
  createSimulation,
  createSyncSource,
  enqueueCommand,
  isAlive,
  loadWeatherRegion,
  planOperation,
  PLAYTEST_OPERATION,
  setupSkirmish,
  type Simulation,
  type Squad,
  stepSimulation,
  type SyncSource
} from "@verdun/sim"
import { createLineOfSight } from "@verdun/sim/physics"
import { createSightModel, type SightModel } from "../fog/sight-model.ts"
import type { BattleSetup, FromWorker, SightLook, ToWorker } from "./sim-protocol.ts"

/** The squad's sight is looked at again every this many steps (a quarter of a second), and whenever orders come. */
const STEPS_PER_LOOK = 5
/** How far the squad can see by day, in metres, as the fog of war draws it. */
const SIGHT_RANGE = 300

/** Sends a message to the page, handing over the buffers listed. */
export type PostToPage = (message: FromWorker, transfer: Transferable[]) => void

/** The buffers a message carries, handed over rather than copied. */
function transferables(message: FromWorker): Transferable[] {
  if (message.type === "failed") {
    return []
  }
  const { arrays, wire, ground, members, gas, smoke } = message.sync
  const sight = message.type === "stepped" ? message.sight : null
  return [
    ...(sight ? [sight.ground.buffer, sight.enemies.buffer] : []),
    arrays,
    ...(wire ? [wire.density.buffer] : []),
    ...ground.flatMap((patch) => [patch.heights.buffer, patch.surfaces.buffer]),
    ...Object.values(members).map((ids) => ids.buffer),
    ...[gas, smoke].flatMap((cloud) => [
      ...(cloud.concentration ? [cloud.concentration.buffer] : []),
      ...(cloud.ground ? [cloud.ground.floor.buffer, cloud.ground.ground.buffer, cloud.ground.hollow.buffer] : [])
    ])
  ]
}

/**
 * The simulation's side of the worker (sim-worker.ts): sets the battle up when asked, then takes the commands and the
 * steps the page asks for and sends back what changed. Returns the handler for the page's messages; plain code, so it
 * runs in a test as well as in a worker.
 */
export function createSimRunner(post: PostToPage): (message: ToWorker) => void {
  let sim: Simulation | null = null
  let source: SyncSource | null = null
  let sight: SightModel | null = null
  let sinceLook = STEPS_PER_LOOK
  let squad: Squad | null = null
  // Who the squad's sight was last looked at for: its leader, and how many of it were still in the fight.
  let lookedFor = { leader: -1, living: -1 }
  const send = (message: FromWorker) => post(message, transferables(message))

  async function start(setup: BattleSetup): Promise<void> {
    const map = generateFleurySector({ seed: setup.mapSeed, elevation: decodeElevation(setup.elevation) })
    await loadWeatherRegion(setup.region)
    const battle = createSimulation({
      map,
      seed: setup.simSeed,
      environment: { forecast: { kind: "records", seed: setup.weatherSeed, region: setup.region } }
    })
    const { playerSquad } = setupSkirmish(battle, undefined, undefined, undefined, setup.side)
    if (!setup.free) {
      planOperation(battle, PLAYTEST_OPERATION)
    }
    const lineOfSight = await createLineOfSight(map)
    battle.lineOfSight = lineOfSight
    sight = createSightModel(battle, lineOfSight, playerSquad, SIGHT_RANGE)
    squad = playerSquad
    sim = battle
    source = createSyncSource(battle)
    send({ type: "started", playerSquad: playerSquad.id, sync: source.take() })
  }

  /**
   * The squad's sight, looked at whole when it's due: every few steps, at once when the player takes another soldier or
   * the squad loses a man, and whenever asked. Plain code off the page, so there's no need to spread it out. Never while
   * the page isn't showing the fog of war: a look costs a few milliseconds.
   */
  function look(battle: Simulation, wanted: boolean, now: boolean): SightLook | null {
    if (!sight || !squad || !wanted) {
      return null
    }
    const viewer = { leader: squad.leader, living: squad.members.filter((member) => isAlive(battle, member)).length }
    const changed = viewer.leader !== lookedFor.leader || viewer.living !== lookedFor.living
    if (sinceLook < STEPS_PER_LOOK && !changed && !now) {
      return null
    }
    sinceLook = 0
    lookedFor = viewer
    sight.begin()
    sight.advance(1)
    return { ground: sight.grid.values.slice(), enemies: Int32Array.from(sight.visibleEnemies) }
  }

  return (message) => {
    if (message.type === "start") {
      start(message.setup).catch((error: unknown) => {
        send({ type: "failed", message: error instanceof Error ? error.message : String(error) })
      })
      return
    }
    if (!sim || !source) {
      return
    }
    for (const command of message.commands) {
      enqueueCommand(sim, command)
    }
    for (let index = 0; index < message.steps; index++) {
      stepSimulation(sim)
      source.stepped()
    }
    sinceLook += message.steps
    // Looked at after the steps, so after the commands took effect: a soldier just taken over sees with his own eyes.
    send({ type: "stepped", sync: source.take(), sight: look(sim, message.look, message.lookNow === true) })
  }
}
