import { type BattlefieldMap, type ChangedArea, mergeAreas } from "@verdun/map"
import {
  applySync,
  type Command,
  createSimulation,
  type LineOfSight,
  type SimEvent,
  type Simulation,
  type Squad,
  stepSimulation
} from "@verdun/sim"
import type { SightFeed } from "../fog/fog-of-war.ts"
import { setupSkirmish } from "../skirmish.ts"
import type { BattleSetup, FromWorker, SightLook, ToWorker } from "./sim-protocol.ts"

/** A step taken, as the page plays it out: its tick and what happened in it. */
export interface StepTaken {
  readonly tick: number
  readonly events: readonly SimEvent[]
}

/**
 * The battle's simulation as the page sees it. In a Web Worker (the default) `sim` is a mirror of the running
 * simulation, brought up to date as each batch of steps comes back; inline (`?inline`) it's the simulation itself,
 * stepped on the page as before. Either way the page reads `sim` as it always has, and queues commands on it with
 * `enqueueCommand`.
 */
export interface SimHost {
  readonly sim: Simulation
  readonly playerSquad: Squad
  /** Whether the simulation runs in a worker. */
  readonly inWorker: boolean
  /** What the player's squad can see, worked out in the worker beside the simulation; null when it runs inline. */
  readonly sight: SightFeed | null
  /**
   * Called once a frame: sends the commands queued on `sim`, asks for `steps` more steps, and returns every step taken
   * since the last call, oldest first. In a worker the steps asked for come back a frame or so later.
   */
  update(steps: number): readonly StepTaken[]
  /** The page's own sight lines, for the fog of war and the sound, kept in step with craters. */
  attachLineOfSight(lineOfSight: LineOfSight): void
  dispose(): void
}

/** A batch asks for no more steps than this: a worker falling behind catches up over a few frames. */
const MOST_STEPS = 8
/** The page's sight lines follow the craters at most this often, in seconds, as the simulation's own do. */
const SIGHT_REBUILD_SECONDS = 2

function simulationFor(map: BattlefieldMap, setup: BattleSetup): Simulation {
  return createSimulation({
    map,
    seed: setup.simSeed,
    environment: { forecast: { kind: "records", seed: setup.weatherSeed, region: setup.region } }
  })
}

/** Steps the simulation on the page, as the game always did: for debugging, and where workers can't run. */
function inlineHost(map: BattlefieldMap, setup: BattleSetup): SimHost {
  const sim = simulationFor(map, setup)
  const { playerSquad } = setupSkirmish(sim)
  return {
    sim,
    playerSquad,
    inWorker: false,
    sight: null,
    update(steps) {
      const taken: StepTaken[] = []
      for (let step = 0; step < steps; step++) {
        stepSimulation(sim)
        taken.push({ tick: sim.tick, events: [...sim.events] })
      }
      return taken
    },
    attachLineOfSight(lineOfSight) {
      sim.lineOfSight = lineOfSight
    },
    dispose() {
      // Nothing to stop: the simulation runs on the page.
    }
  }
}

async function workerHost(map: BattlefieldMap, setup: BattleSetup): Promise<SimHost> {
  const worker = new Worker(new URL("./sim-worker.ts", import.meta.url), { type: "module" })
  const mirror = simulationFor(map, setup)
  const send = (message: ToWorker, transfer: Transferable[] = []) => worker.postMessage(message, transfer)
  let arrived: StepTaken[] = []
  let inFlight = false
  let owed = 0
  let commands: Command[] = []
  let lineOfSight: LineOfSight | null = null
  let unseenGround: ChangedArea | null = null
  let sightRebuiltAt = 0
  let latestSight: SightLook | null = null

  const started = new Promise<number>((resolve, reject) => {
    worker.addEventListener("message", (event: MessageEvent<FromWorker>) => {
      const message = event.data
      if (message.type === "failed") {
        reject(new Error(`the simulation's worker failed: ${message.message}`))
        return
      }
      applySync(mirror, message.sync)
      if (message.type === "started") {
        resolve(message.playerSquad)
        return
      }
      inFlight = false
      arrived.push(...message.sync.steps)
      latestSight = message.sight ?? latestSight
      for (const step of message.sync.steps) {
        for (const event of step.events) {
          if (event.type === "burst" && event.crater) {
            unseenGround = mergeAreas(unseenGround, event.crater)
          }
        }
      }
    })
    worker.addEventListener("error", (event) => reject(new Error(`the simulation's worker failed: ${event.message}`)))
  })
  send({ type: "start", setup: { ...setup, elevation: setup.elevation.slice(0) } })
  const playerSquadId = await started
  const playerSquad = mirror.squads[playerSquadId]
  if (!playerSquad) {
    throw new Error("the simulation's worker sent no player squad")
  }

  return {
    sim: mirror,
    playerSquad,
    inWorker: true,
    sight: {
      take() {
        const look = latestSight
        latestSight = null
        return look
      }
    },
    update(steps) {
      // Commands queued on the mirror go to the simulation, in order, with the next batch.
      commands.push(...mirror.pendingCommands.splice(0))
      owed += steps
      if (!inFlight && (owed > 0 || commands.length > 0)) {
        const batch = Math.min(MOST_STEPS, owed)
        send({ type: "step", commands, steps: batch })
        owed -= batch
        commands = []
        inFlight = true
      }
      const ground = unseenGround
      const now = performance.now() / 1000
      if (lineOfSight && ground && now - sightRebuiltAt >= SIGHT_REBUILD_SECONDS) {
        lineOfSight.rebuildRegion(ground.minX, ground.minZ, ground.maxX, ground.maxZ)
        unseenGround = null
        sightRebuiltAt = now
      }
      const taken = arrived
      arrived = []
      return taken
    },
    attachLineOfSight(sightLines) {
      lineOfSight = sightLines
      mirror.lineOfSight = sightLines
    },
    dispose() {
      worker.terminate()
    }
  }
}

/** Starts the battle's simulation: in a worker unless `inline`, or the browser has no workers. */
export async function createSimHost(map: BattlefieldMap, setup: BattleSetup, inline = false): Promise<SimHost> {
  if (inline || typeof Worker === "undefined") {
    return inlineHost(map, setup)
  }
  return workerHost(map, setup)
}
