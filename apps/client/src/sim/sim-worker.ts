/// <reference lib="webworker" />
/**
 * The simulation, off the page's thread: it steps here, so a step that takes long (sight lines rebuilt after craters, a
 * burst of route searches when big orders land) costs the battle a moment, not the picture a frame. The page keeps a
 * mirror of it (sim-host.ts), and this sends what changed after every batch of steps.
 */
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

let sim: Simulation | null = null
let source: SyncSource | null = null

function post(message: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer)
}

/** The buffers a sync carries, handed over rather than copied. */
function transferables(sync: FromWorker): Transferable[] {
  if (sync.type === "failed") {
    return []
  }
  const { arrays, wire, ground, members, gas, smoke } = sync.sync
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
  const message: FromWorker = { type: "started", playerSquad: playerSquad.id, sync: source.take() }
  post(message, transferables(message))
}

function step(commands: ToWorkerStep["commands"], steps: number): void {
  if (!sim || !source) {
    return
  }
  for (const command of commands) {
    enqueueCommand(sim, command)
  }
  for (let index = 0; index < steps; index++) {
    stepSimulation(sim)
    source.stepped()
  }
  const message: FromWorker = { type: "stepped", sync: source.take() }
  post(message, transferables(message))
}

type ToWorkerStep = Extract<ToWorker, { type: "step" }>

self.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  const message = event.data
  if (message.type === "start") {
    start(message.setup).catch((error: unknown) => {
      post({ type: "failed", message: error instanceof Error ? error.message : String(error) })
    })
  } else {
    step(message.commands, message.steps)
  }
})
