import type { BattlefieldMap } from "@verdun/map"
import {
  type Acknowledgement,
  acknowledgement,
  type CommandBatch,
  type JoinOptions,
  MESSAGE,
  SECTOR_ROOM
} from "@verdun/net"
import {
  applySync,
  type Command,
  createFixedStepper,
  createSimulation,
  type Side,
  STEP_SECONDS,
  TICK_RATE,
  type WarSchedule
} from "@verdun/sim"
import { createTerrainSight } from "../fog/terrain-sight.ts"
import { createCloudEasing } from "./cloud-easing.ts"
import { createDecodingWorker } from "./decoding-thread.ts"
import { createInlineDecoding, type Decoding } from "./decoding.ts"
import { createPrediction } from "./prediction.ts"
import type { SimHost, StepTaken } from "./sim-host.ts"
import type { BattleSetup } from "./sim-protocol.ts"
import { createSmoothing } from "./smoothing.ts"

/** The little of a Colyseus room the host uses, so a test can stand in for the server. */
export interface SectorConnection {
  send(type: string, message?: unknown): void
  onMessage(type: string, callback: (payload: unknown) => void): void
  /** Calls `callback` if the server closes the connection, or it drops. */
  onLeave(callback: (code: number) => void): void
  leave(): void
}

/**
 * Steps kept to play out, at most: two seconds. A hidden tab draws no frames, so nothing takes the steps that come in
 * meanwhile; the mirror stays up to date all the same, and on coming back the page plays out the last moments, not an
 * hour's shots and shells at once.
 */
const MOST_STEPS_KEPT = 2 * TICK_RATE

/** The battle on a sector server: the host also carries the war's calendar the server keeps. */
export interface ServerHost extends SimHost {
  readonly schedule: WarSchedule
  /**
   * Hears when the server lets the page go once it's in the battle, with the close code: the connection lost, past the
   * reconnecting the client tries first. Not when the page leaves itself.
   */
  onLost(listener: (code: number) => void): void
}

/**
 * Joins the sector's battle on a server (`pnpm server`) at `address`, such as ws://localhost:2567, for `side`: the
 * server gives the player a squad of it.
 */
export async function connectToSector(address: string, side: Side): Promise<SectorConnection> {
  const { Client } = await import("@colyseus/sdk")
  const options: JoinOptions = { side }
  const room = await new Client(address).join(SECTOR_ROOM, options)
  return {
    send: (type, message) => room.send(type, message),
    onMessage: (type, callback) => {
      room.onMessage(type, callback)
    },
    onLeave: (callback) => {
      room.onLeave(callback)
    },
    leave: () => {
      void room.leave()
    }
  }
}

const bytesOf = (payload: unknown): Uint8Array => {
  if (!(payload instanceof Uint8Array)) {
    throw new TypeError("The server sent the battle as something other than bytes")
  }
  return payload
}

/**
 * The battle as the page sees it when a server runs it: `sim` is a mirror of the server's simulation, brought up to date
 * ten times a second whatever the page asks, and commands queued on it go to the server, which keeps them to what the
 * player's squad may do. The battle doesn't wait for the menu: the war goes on. What the squad can see is worked out on
 * the page, from the ground (see terrain-sight.ts). The soldier the player controls moves at once, ahead of the server's
 * word (see prediction.ts); `now` is the page's clock, in milliseconds, which counts the page's own steps for it.
 */
export async function serverHost(
  map: BattlefieldMap,
  setup: BattleSetup,
  connection: SectorConnection,
  now: () => number = () => performance.now(),
  decoding: Decoding = typeof Worker === "undefined" ? createInlineDecoding(map) : createDecodingWorker(map)
): Promise<ServerHost> {
  const mirror = createSimulation({
    map,
    seed: setup.simSeed,
    environment: { forecast: { kind: "records", seed: setup.weatherSeed, region: setup.region } }
  })
  const sightLines = createTerrainSight(map)
  mirror.lineOfSight = sightLines
  let arrived: StepTaken[] = []
  let left: number | null = null
  let leaving = false
  const lost = new Set<(code: number) => void>()
  const prediction = createPrediction(mirror)
  const smoothing = createSmoothing(mirror)
  // The smoke comes twice a second: the page shows it drifting between.
  const smoke = createCloudEasing(mirror.smoke)
  // The page's own steps, at the simulation's rate: what its commands are given at, and its prediction runs to.
  const clock = createFixedStepper(STEP_SECONDS, Number.MAX_SAFE_INTEGER)
  let step = 0
  let last = now()
  // The soldier the player controls, once the battle has come.
  let controlled = (): number => -1

  // Messages still being read, and acknowledgements waiting on them: a command is acknowledged only once the battle
  // that has it in is in the mirror.
  let reading = 0
  let acknowledgements: Acknowledgement[] = []
  const acknowledge = (applied: Acknowledgement) => prediction.acknowledged(applied.step, applied.tick)
  const joined = new Promise<{ playerSquad: number; schedule: WarSchedule }>((resolve, reject) => {
    connection.onMessage(MESSAGE.joined, (payload) => {
      decoding.welcome(bytesOf(payload), (welcome) => {
        applySync(mirror, welcome.sync)
        smoothing.synced(now(), -1)
        resolve(welcome)
      })
    })
    connection.onLeave((code) => {
      left = code
      reject(new Error(`The server closed the battle (${code})`))
      if (!leaving) {
        for (const listener of lost) {
          listener(code)
        }
      }
    })
  })
  connection.onMessage(MESSAGE.sync, (payload) => {
    reading++
    const answered = decoding.decode(bytesOf(payload), (sync) => {
      reading--
      smoke.synced(now(), sync.smoke.concentration)
      applySync(mirror, sync)
      smoke.advance(now())
      smoothing.synced(now(), controlled())
      prediction.synced(sync.tick)
      if (reading === 0) {
        acknowledgements.forEach(acknowledge)
        acknowledgements = []
      }
      prediction.predict(step, controlled())
      arrived.push(...sync.steps)
      arrived.splice(0, Math.max(0, arrived.length - MOST_STEPS_KEPT))
    })
    if (!answered) {
      reading--
    }
  })
  // A dev server says which commands it refused: whatever the page sends that the server doesn't take shows here.
  connection.onMessage(MESSAGE.refused, (payload) => {
    console.warn(`The server refused the page's ${Array.isArray(payload) ? payload.join(", ") : "commands"}`)
  })
  connection.onMessage(MESSAGE.ack, (payload) => {
    const applied = acknowledgement(payload)
    if (applied && reading > 0) {
      acknowledgements.push(applied)
    } else if (applied) {
      acknowledge(applied)
    }
  })
  // Listening now: the battle can come.
  connection.send(MESSAGE.ready)
  const { playerSquad: squadId, schedule } = await joined
  const playerSquad = mirror.squads[squadId]
  if (!playerSquad) {
    throw new Error("The server gave the player no squad")
  }
  controlled = () => playerSquad.leader
  // An empty batch, so the server's acknowledgement ties its ticks to the page's steps before the player's first move.
  const opening: CommandBatch = { step, commands: [] }
  connection.send(MESSAGE.commands, opening)

  return {
    sim: mirror,
    playerSquad,
    schedule,
    remote: true,
    sight: null,
    // Of the enemy, the page is kept up to date on only the men its side can see.
    known: (soldier) => decoding.seen?.has(soldier) ?? true,
    update() {
      // The server keeps its own time: the page takes the steps that have come, and sends what it has commanded. Its
      // own clock moves the player's soldier on meanwhile.
      const at = now()
      step += clock.advance((at - last) / 1000)
      last = at
      const commands: Command[] = mirror.pendingCommands.splice(0)
      if (commands.length > 0 && left === null) {
        const batch: CommandBatch = { step, commands }
        connection.send(MESSAGE.commands, batch)
        prediction.sent(step, commands)
      }
      prediction.predict(step, playerSquad.leader)
      smoothing.advance(at, playerSquad.leader)
      smoke.advance(at)
      const taken = arrived
      arrived = []
      return taken
    },
    sightLines,
    attachLineOfSight() {
      // The server has the physics; the page answers its own questions from the ground.
    },
    onLost(listener) {
      lost.add(listener)
    },
    dispose() {
      leaving = true
      connection.leave()
      decoding.dispose()
    }
  }
}
