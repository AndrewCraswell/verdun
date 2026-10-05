import { decodeElevation, generateFleurySector } from "@verdun/map"
import {
  createLineOfSight,
  createSimulation,
  createSyncSource,
  enqueueCommand,
  loadWeatherRegion,
  type Simulation,
  stepSimulation,
  type SyncSource
} from "@verdun/sim"
import { setupSkirmish } from "../skirmish.ts"
import type { BattleSetup, FromWorker, ToWorker } from "./sim-protocol.ts"

/** Sends a message to the page, handing over the buffers listed. */
export type PostToPage = (message: FromWorker, transfer: Transferable[]) => void

/** The buffers a message carries, handed over rather than copied. */
function transferables(message: FromWorker): Transferable[] {
  if (message.type === "failed") {
    return []
  }
  const { arrays, wire, ground, members, gas, smoke } = message.sync
  return [
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
  const send = (message: FromWorker) => post(message, transferables(message))

  async function start(setup: BattleSetup): Promise<void> {
    const map = generateFleurySector({ seed: setup.mapSeed, elevation: decodeElevation(setup.elevation) })
    await loadWeatherRegion(setup.region)
    const battle = createSimulation({
      map,
      seed: setup.simSeed,
      environment: { forecast: { kind: "records", seed: setup.weatherSeed, region: setup.region } }
    })
    const { playerSquad } = setupSkirmish(battle)
    battle.lineOfSight = await createLineOfSight(map)
    sim = battle
    source = createSyncSource(battle)
    send({ type: "started", playerSquad: playerSquad.id, sync: source.take() })
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
    send({ type: "stepped", sync: source.take() })
  }
}
