import type { BattlefieldMap } from "@verdun/map"
import type { SimSync, WarSchedule } from "@verdun/sim"
import { deflateSync, inflateSync } from "fflate"
import { Packr } from "msgpackr"
import { apply, diff, isPatch, type Patch } from "./delta.ts"
import { type GroundMovement, groundFromMovement } from "./ground-movement.ts"
import {
  applyCellPatch,
  type CellGrid,
  cellGrid,
  cellOf,
  type CellPatch,
  cellPatches,
  type SoldierArray,
  soldierArray,
  type SoldierArrays
} from "./soldier-cells.ts"

/** A gas or smoke cloud as players are sent it: its concentration quantized (see `quantize`). */
interface CloudView {
  readonly active: boolean
  readonly concentration: Uint8Array | null
  readonly ground: SimSync["gas"]["ground"]
}

/** What the sync's packed soldier arrays hold, in order: see `soldierArrayLayout`. */
export type ArrayLayout = readonly { readonly name: string; readonly type: string }[]

/**
 * The battle as players have last been sent it, but for the soldiers' arrays: the sync's lasting parts, with the wire
 * and the clouds as last sent rather than null when they haven't changed. Each message sends what changed in it (see
 * delta.ts), never all of it.
 */
interface GlobalView {
  readonly tick: number
  readonly soldiers: number
  readonly members: SimSync["members"]
  readonly state: SimSync["state"]
  readonly wire: SimSync["wire"]
  readonly gas: CloudView
  readonly smoke: CloudView
}

/** The global part of a message: what changed in the global view, then each step's events and the craters since. */
interface GlobalMessage {
  readonly v: Patch | null
  readonly s: SimSync["steps"]
  readonly g: SimSync["ground"]
}

/** What a player is sent on joining: the squad they lead, the war's calendar the battle keeps, and the battle itself. */
export interface Joined {
  readonly playerSquad: number
  readonly schedule: WarSchedule
  /** The whole battle, as the next message will build on it. */
  readonly sync: SimSync
  /** Reads the messages that follow. */
  readonly decoder: SyncDecoder
}

/** One sync of the battle, encoded once, from which each player's message is made. */
export interface EncodedSync {
  /**
   * The message for `player`, whose men are in or near `near`, the cells they're to be sent every message: the rest
   * are sent `FAR_EVERY` messages apart. A player's cells change only at those messages, so every message builds on
   * exactly what the player has.
   */
  for(player: string, near: ReadonlySet<number>): Uint8Array
}

/** The server's side: one for every player at once. */
export interface SyncEncoder {
  /** The map's cells, as players' near cells are counted in. */
  readonly grid: CellGrid
  /**
   * Takes the battle's next sync. Every sync the battle makes must go through here, sent or not, as joining players are
   * welcomed to the last one.
   */
  encode(sync: SimSync): EncodedSync
  /**
   * What a player joining is sent: the battle as of the last message, so the next builds on it, and `ground`, how
   * shells have moved the ground in all (see `groundMovement`). Only once a sync has been encoded.
   */
  welcome(playerSquad: number, schedule: WarSchedule, ground: GroundMovement | null): Uint8Array
  /** A player has left: their cells are forgotten. */
  forget(player: string): void
}

/** The player's side: follows the messages after the welcome, one by one, in order. */
export interface SyncDecoder {
  decode(bytes: Uint8Array): SimSync
}

/** Cells are this many metres a side: Fleury's 600 by 400 m is 24 of them. */
export const CELL_SIZE = 100
/**
 * The cells farther from all of a player's men than this go to them every `FAR_EVERY` messages: twice a second, as the
 * server sends ten. The page eases every man between his updates (server-host.ts), so the far ones walk, not hop.
 */
export const NEAR_RADIUS = 120
export const FAR_EVERY = 5

/** MessagePack that keeps typed arrays and array buffers as they are, which the battle is made of. */
const packr = new Packr({ moreTypes: true, useRecords: false })

/**
 * Each part of a message goes deflated, once on the server for every player who's sent it, rather than by each
 * connection. The fastest level packs these as small as the default does.
 */
const pack = (value: unknown): Uint8Array => deflateSync(packr.pack(value), { level: 1 })
const unpack = (bytes: Uint8Array): unknown => packr.unpack(inflateSync(bytes))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Gas and smoke go to players as a byte a cell, on a logarithmic scale: 0 is clear air (below `CLOUD_FLOOR`, which the
 * simulation counts as negligible), and each step above is about 7% more, up past anything a barrage makes. What a
 * player does with a cloud (draw it, warn of gas, judge what the smoke hides) needs no finer, and a cloud drifting
 * changes far fewer of these steps than of its exact values.
 */
const CLOUD_FLOOR = 0.05
const CLOUD_STEP = Math.log(2e7) / 254
const CLOUD_LEVELS = Float32Array.from({ length: 256 }, (_, level) =>
  level === 0 ? 0 : CLOUD_FLOOR * Math.exp((level - 1) * CLOUD_STEP)
)

function quantize(concentration: Float32Array): Uint8Array {
  return Uint8Array.from(concentration, (value) =>
    value < CLOUD_FLOOR ? 0 : Math.min(255, 1 + Math.round(Math.log(value / CLOUD_FLOOR) / CLOUD_STEP))
  )
}

function dequantize(levels: Uint8Array): Float32Array {
  return Float32Array.from(levels, (level) => CLOUD_LEVELS[level] ?? 0)
}

/**
 * A cloud's levels as sent, which only move a step from what was last sent if the cloud has moved it two: a cell on the
 * edge between steps would otherwise flicker between them, sent every message. Clearing and filling are sent at once.
 */
function settled(levels: Uint8Array, known: Uint8Array | null): Uint8Array {
  if (!known || known.length !== levels.length) {
    return levels
  }
  return levels.map((level, cell) => {
    const last = known[cell] ?? 0
    return level !== 0 && last !== 0 && Math.abs(level - last) <= 1 ? last : level
  })
}

function cloud(sent: SimSync["gas"], known: CloudView | undefined): CloudView {
  const last = known?.concentration ?? null
  return {
    active: sent.active,
    concentration: sent.concentration ? settled(quantize(sent.concentration), last) : last,
    ground: sent.ground ?? known?.ground ?? null
  }
}

/**
 * Soldiers' values players are sent to no finer than this, as a player could see or the client use: a man's morale,
 * suppression and breath as a hundredth, where he faces to about half a degree. Morale and suppression ebb a little
 * every step; rounded, they're sent when they've changed enough to tell.
 */
const PRECISION: Readonly<Record<string, number>> = {
  "morale.value": 0.01,
  "suppression.value": 0.01,
  "stamina.value": 0.01,
  "facing.x": 0.01,
  "facing.z": 0.01
}

/**
 * Where soldiers are goes as 16 bits a coordinate, in steps of `unit` metres: a centimetre on any map up to 655 m, as
 * fine as needed on bigger ones. Half what 32-bit floats take, and positions are the most of what changes.
 */
const POSITIONS = new Set(["position.x", "position.z"])

/** The position's unit for a map `extent` metres across at its widest. */
function positionUnit(extent: number): number {
  return Math.max(0.01, extent / 65_535)
}

/** The packed soldier arrays apart, by name: rounded as `PRECISION` has it, positions in `unit` steps. */
function unpacked(sync: SimSync, layout: ArrayLayout, unit: number): Record<string, SoldierArray> {
  const arrays: Record<string, SoldierArray> = {}
  let offset = 0
  for (const { name, type } of layout) {
    const bytes = soldierArray(type, 0).BYTES_PER_ELEMENT * sync.soldiers
    const raw = soldierArray(type, sync.soldiers)
    new Uint8Array(raw.buffer).set(new Uint8Array(sync.arrays, offset, bytes))
    offset += bytes
    const precision = PRECISION[name]
    if (POSITIONS.has(name)) {
      arrays[name] = Uint16Array.from(raw, (metres) => Math.min(65_535, Math.max(0, Math.round(metres / unit))))
    } else if (precision && raw instanceof Float32Array) {
      arrays[name] = raw.map((value) => Math.round(value / precision) * precision)
    } else {
      arrays[name] = raw
    }
  }
  return arrays
}

/** The soldier arrays packed again, in the layout's order, as the mirror takes them in: positions back in metres. */
function packed(arrays: SoldierArrays, layout: ArrayLayout, unit: number, soldiers: number): ArrayBuffer {
  const parts = layout.map(({ name, type }) => {
    const array = arrays[name]
    if (!array) {
      throw new TypeError(`The battle as sent has no ${name}`)
    }
    const values = POSITIONS.has(name) ? Float32Array.from(array, (steps) => steps * unit) : array
    const sized = soldierArray(type, soldiers)
    sized.set(values.subarray(0, soldiers))
    return new Uint8Array(sized.buffer)
  })
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes.buffer
}

function globalOf(sync: SimSync, known: GlobalView | null): GlobalView {
  return {
    tick: sync.tick,
    soldiers: sync.soldiers,
    members: sync.members,
    state: sync.state,
    wire: sync.wire ?? known?.wire ?? null,
    gas: cloud(sync.gas, known?.gas),
    smoke: cloud(sync.smoke, known?.smoke)
  }
}

/** The patch for one field of whatever `patch` patches: all of it if `patch` replaces it whole, none if untouched. */
function field(patch: Patch | null | undefined, key: string): Patch | null {
  if (!patch) {
    return null
  }
  if ("f" in patch) {
    return isRecord(patch.f) && key in patch.f ? { f: patch.f[key] } : null
  }
  return "o" in patch ? (patch.o[key] ?? null) : null
}

/** How a battle is sent, which a player is told on joining. */
interface Format {
  readonly layout: ArrayLayout
  readonly unit: number
}

/** The sync for the mirror, from the views as they now stand: the wire and the clouds only where they changed. */
function syncOf(
  view: GlobalView,
  arrays: SoldierArrays,
  format: Format,
  patch: Patch | null,
  message: Pick<GlobalMessage, "s" | "g">
): SimSync {
  const clouds = (name: "gas" | "smoke") => {
    const changed = field(patch, name)
    const concentration = view[name].concentration
    return {
      active: view[name].active,
      concentration: field(changed, "concentration") && concentration ? dequantize(concentration) : null,
      ground: field(changed, "ground") ? view[name].ground : null
    }
  }
  return {
    tick: view.tick,
    soldiers: view.soldiers,
    arrays: packed(arrays, format.layout, format.unit, view.soldiers),
    members: view.members,
    state: view.state,
    wire: field(patch, "wire") ? view.wire : null,
    gas: clouds("gas"),
    smoke: clouds("smoke"),
    steps: message.s,
    ground: message.g
  }
}

function isGlobalView(value: unknown): value is GlobalView {
  return (
    isRecord(value) &&
    typeof value["tick"] === "number" &&
    typeof value["soldiers"] === "number" &&
    isRecord(value["members"]) &&
    isRecord(value["state"]) &&
    isRecord(value["gas"]) &&
    isRecord(value["smoke"])
  )
}

function isGlobalMessage(value: unknown): value is GlobalMessage {
  return (
    isRecord(value) &&
    (value["v"] === null || isPatch(value["v"])) &&
    Array.isArray(value["s"]) &&
    Array.isArray(value["g"])
  )
}

function isSchedule(value: unknown): value is WarSchedule {
  return (
    isRecord(value) &&
    Number.isFinite(value["begins"]) &&
    Number.isFinite(value["breakDays"]) &&
    Number.isFinite(value["standToMinutes"])
  )
}

function isLayout(value: unknown): value is ArrayLayout {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && typeof entry["name"] === "string" && typeof entry["type"] === "string")
  )
}

function isArrays(value: unknown): value is Record<string, SoldierArray> {
  return (
    isRecord(value) && Object.values(value).every((array) => ArrayBuffer.isView(array) && !(array instanceof DataView))
  )
}

/** Each soldier's cell, from his position in `unit` steps. */
function cellsOf(arrays: SoldierArrays, grid: CellGrid, unit: number, soldiers: number): Int32Array {
  const xs = arrays["position.x"]
  const zs = arrays["position.z"]
  return Int32Array.from({ length: soldiers }, (_, soldier) =>
    cellOf(grid, (xs?.[soldier] ?? 0) * unit, (zs?.[soldier] ?? 0) * unit)
  )
}

/**
 * `layout` is what the battle's syncs pack into `SimSync.arrays` (its `soldierArrayLayout`); `width` and `depth` are
 * the map's, in metres.
 */
export function createSyncEncoder(layout: ArrayLayout, width: number, depth: number): SyncEncoder {
  const grid = cellGrid(width, depth, CELL_SIZE)
  const unit = positionUnit(Math.max(width, depth))
  let global: GlobalView | null = null
  let arrays: SoldierArrays | null = null
  let cells: Int32Array = new Int32Array(0)
  // The soldiers as of the last message far cells were sent at, which the next builds on.
  let farBase: SoldierArrays | null = null
  let messages = 0
  // Each player's near cells, set at the last message far cells were sent at; absent for a player who joined since,
  // who is sent every cell every message until the next.
  const nearFor = new Map<string, ReadonlySet<number>>()

  return {
    grid,
    encode(sync) {
      const nextGlobal = globalOf(sync, global)
      const globalPart = pack({ v: diff(global, nextGlobal), s: sync.steps, g: sync.ground })
      global = nextGlobal
      const next = unpacked(sync, layout, unit)
      const nextCells = cellsOf(next, grid, unit, sync.soldiers)
      // A man who's crossed into another cell goes whole, for the players who follow it and didn't follow him before.
      const crossed = new Set<number>()
      nextCells.forEach((cell, soldier) => {
        if (soldier < cells.length && cells[soldier] !== cell) {
          crossed.add(soldier)
        }
      })
      const near = cellPatches(arrays, next, nextCells, crossed)
      const farTurn = messages % FAR_EVERY === 0
      const far = farTurn ? cellPatches(farBase, next, nextCells) : new Map<number, CellPatch>()
      arrays = next
      cells = nextCells
      if (farTurn) {
        farBase = next
      }
      messages++
      const nearParts = new Map<number, Uint8Array>()
      const farParts = new Map<number, Uint8Array>()
      const partOf = (store: Map<number, Uint8Array>, patches: Map<number, CellPatch>, cell: number) => {
        let part = store.get(cell)
        const patch = patches.get(cell)
        if (!part && patch) {
          part = pack(patch)
          store.set(cell, part)
        }
        return part
      }
      const changedCells = new Set([...near.keys(), ...far.keys()])
      return {
        for(player, wanted) {
          const followed = nearFor.get(player)
          const parts: [number, Uint8Array][] = []
          for (const cell of changedCells) {
            const part =
              !followed || followed.has(cell) ? partOf(nearParts, near, cell) : farTurn && partOf(farParts, far, cell)
            if (part) {
              parts.push([cell, part])
            }
          }
          if (farTurn) {
            nearFor.set(player, wanted)
          }
          return packr.pack({ g: globalPart, c: parts })
        }
      }
    },
    welcome(playerSquad, schedule, ground) {
      if (!global || !arrays) {
        throw new Error("A player can't be welcomed before the battle's first sync")
      }
      return pack({ playerSquad, schedule, layout, unit, view: global, arrays, ground })
    },
    forget(player) {
      nearFor.delete(player)
    }
  }
}

function decoderFrom(start: GlobalView, startArrays: Record<string, SoldierArray>, format: Format): SyncDecoder {
  let view = start
  const arrays = startArrays
  return {
    decode(bytes) {
      const message: unknown = packr.unpack(bytes)
      if (!isRecord(message) || !(message["g"] instanceof Uint8Array) || !Array.isArray(message["c"])) {
        throw new TypeError("The server sent a sync this client can't read")
      }
      const globalPart = unpack(message["g"])
      if (!isGlobalMessage(globalPart)) {
        throw new TypeError("The server sent a sync this client can't read")
      }
      const next: unknown = globalPart.v ? apply(view, globalPart.v) : view
      if (!isGlobalView(next)) {
        throw new TypeError("The server's sync doesn't fit the battle this client has")
      }
      view = next
      for (const part of message["c"]) {
        if (!Array.isArray(part) || !(part[1] instanceof Uint8Array)) {
          throw new TypeError("The server sent a cell this client can't read")
        }
        applyCellPatch(arrays, unpack(part[1]), view.soldiers)
      }
      return syncOf(view, arrays, format, globalPart.v, globalPart)
    }
  }
}

function isMovement(value: unknown): value is GroundMovement {
  return (
    isRecord(value) &&
    typeof value["minColumn"] === "number" &&
    typeof value["maxColumn"] === "number" &&
    typeof value["minRow"] === "number" &&
    typeof value["maxRow"] === "number" &&
    value["moved"] instanceof Int16Array &&
    value["surfaces"] instanceof Uint8Array
  )
}

/** Reads the welcome to a battle fought on `map`, which the player has generated as the server did, unshelled. */
export function decodeJoined(bytes: Uint8Array, map: BattlefieldMap): Joined {
  const welcome: unknown = unpack(bytes)
  if (
    !isRecord(welcome) ||
    typeof welcome["playerSquad"] !== "number" ||
    !isSchedule(welcome["schedule"]) ||
    !isLayout(welcome["layout"]) ||
    typeof welcome["unit"] !== "number" ||
    !isGlobalView(welcome["view"]) ||
    !isArrays(welcome["arrays"]) ||
    !(welcome["ground"] === null || isMovement(welcome["ground"]))
  ) {
    throw new TypeError("The server sent a welcome this client can't read")
  }
  const { layout, unit, view, arrays, ground } = welcome
  const format = { layout, unit }
  return {
    playerSquad: welcome["playerSquad"],
    schedule: welcome["schedule"],
    sync: syncOf(view, arrays, format, { f: view }, { s: [], g: ground ? [groundFromMovement(map, ground)] : [] }),
    decoder: decoderFrom(view, arrays, format)
  }
}
