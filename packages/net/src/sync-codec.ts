import type { BattlefieldMap } from "@verdun/map"
import type { SimSync, WarSchedule } from "@verdun/sim"
import { deflateSync, inflateSync } from "fflate"
import { Packr } from "msgpackr"
import { apply, diff, isPatch, type Patch } from "./delta.ts"
import { type GroundMovement, groundFromMovement } from "./ground-movement.ts"

/** A gas or smoke cloud as players are sent it: its concentration quantized (see `quantize`). */
interface CloudView {
  readonly active: boolean
  readonly concentration: Uint8Array | null
  readonly ground: SimSync["gas"]["ground"]
}

/** The kinds of typed array the soldiers' arrays are (see `soldierArrayLayout`). */
type SoldierArray = Float32Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array

/** What the sync's packed soldier arrays hold, in order: see `soldierArrayLayout`. */
export type ArrayLayout = readonly { readonly name: string; readonly type: string }[]

/**
 * The battle as players have last been sent it: the sync's lasting parts, with the soldiers' arrays apart, by name, and
 * the wire and the clouds as last sent rather than null when they haven't changed. Each message sends what changed in
 * it (see delta.ts), never all of it.
 */
interface SyncView {
  readonly tick: number
  readonly soldiers: number
  readonly arrays: Readonly<Record<string, SoldierArray>>
  readonly members: SimSync["members"]
  readonly state: SimSync["state"]
  readonly wire: SimSync["wire"]
  readonly gas: CloudView
  readonly smoke: CloudView
}

/** A sync message: what changed in the view, then each step's events and the craters since the last. */
interface SyncMessage {
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

/** The server's side: one for every player at once, as every player is sent the same. */
export interface SyncEncoder {
  /**
   * The message for every player: what changed since the last. Every sync the battle makes must go through here, sent
   * or not, as joining players are welcomed to the last one.
   */
  encode(sync: SimSync): Uint8Array
  /**
   * What a player joining is sent: the battle as of the last message, so the next builds on it, and `ground`, how
   * shells have moved the ground in all (see `groundMovement`). Only once a sync has been encoded.
   */
  welcome(playerSquad: number, schedule: WarSchedule, ground: GroundMovement | null): Uint8Array
}

/** The player's side: follows the messages after the welcome, one by one, in order. */
export interface SyncDecoder {
  decode(bytes: Uint8Array): SimSync
}

/** MessagePack that keeps typed arrays and array buffers as they are, which the battle is made of. */
const packr = new Packr({ moreTypes: true, useRecords: false })

/**
 * Messages go deflated, once on the server for every player rather than by each connection: about a third smaller,
 * for a tenth of a millisecond a message. The fastest level packs these as small as the default does.
 */
const pack = (value: unknown): Uint8Array => deflateSync(packr.pack(value), { level: 1 })
const unpack = (bytes: Uint8Array): unknown => packr.unpack(inflateSync(bytes))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Gas and smoke go to players as a byte a cell, on a logarithmic scale: 0 is clear air (below `CLOUD_FLOOR`, which the
 * simulation counts as negligible), and each step above is about 7% more, up past anything a barrage makes. What a
 * player does with a cloud (draw it, warn of gas, judge what the smoke hides) needs no finer, and a cloud drifting
 * changes far fewer of these steps than of its exact values: smoke was most of what the battle sent before.
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
 * suppression and breath as a hundredth, where he faces to about half a degree, where he is to the centimetre. Morale
 * and suppression ebb a little every step; rounded, they're sent when they've changed enough to tell.
 */
const PRECISION: Readonly<Record<string, number>> = {
  "morale.value": 0.01,
  "suppression.value": 0.01,
  "stamina.value": 0.01,
  "facing.x": 0.01,
  "facing.z": 0.01,
  "position.x": 0.01,
  "position.z": 0.01
}

/** The kinds of typed array soldiers' arrays come in, by name. */
const KINDS: Readonly<Record<string, new (buffer: ArrayBuffer) => SoldierArray>> = {
  Float32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array
}

/** A soldier array of the kind named, over `buffer`. */
function soldierArray(type: string, buffer: ArrayBuffer): SoldierArray {
  const Kind = KINDS[type]
  if (!Kind) {
    throw new TypeError(`The soldiers' arrays hold a ${type}, which can't be sent`)
  }
  return new Kind(buffer)
}

/** The packed soldier arrays apart, by name, each rounded as `PRECISION` has it. */
function unpacked(sync: SimSync, layout: ArrayLayout): Record<string, SoldierArray> {
  const arrays: Record<string, SoldierArray> = {}
  let offset = 0
  for (const { name, type } of layout) {
    const bytes = soldierArray(type, new ArrayBuffer(0)).BYTES_PER_ELEMENT * sync.soldiers
    const array = soldierArray(type, new Uint8Array(sync.arrays, offset, bytes).slice().buffer)
    const precision = PRECISION[name]
    if (precision && array instanceof Float32Array) {
      array.forEach((value, soldier) => {
        array[soldier] = Math.round(value / precision) * precision
      })
    }
    arrays[name] = array
    offset += bytes
  }
  return arrays
}

/** The soldier arrays packed again, in the layout's order, as the mirror takes them in. */
function packed(arrays: SyncView["arrays"], layout: ArrayLayout): ArrayBuffer {
  const parts = layout.map(({ name }) => {
    const array = arrays[name]
    if (!array) {
      throw new TypeError(`The battle as sent has no ${name}`)
    }
    return new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
  })
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes.buffer
}

function viewOf(sync: SimSync, known: SyncView | null, layout: ArrayLayout): SyncView {
  return {
    tick: sync.tick,
    soldiers: sync.soldiers,
    arrays: unpacked(sync, layout),
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

/** The sync for the mirror, from the view as it now stands: the wire and the clouds only where they changed. */
function syncOf(
  view: SyncView,
  layout: ArrayLayout,
  patch: Patch | null,
  message: Pick<SyncMessage, "s" | "g">
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
    arrays: packed(view.arrays, layout),
    members: view.members,
    state: view.state,
    wire: field(patch, "wire") ? view.wire : null,
    gas: clouds("gas"),
    smoke: clouds("smoke"),
    steps: message.s,
    ground: message.g
  }
}

function isView(value: unknown): value is SyncView {
  return (
    isRecord(value) &&
    typeof value["tick"] === "number" &&
    typeof value["soldiers"] === "number" &&
    isRecord(value["arrays"]) &&
    isRecord(value["members"]) &&
    isRecord(value["state"]) &&
    isRecord(value["gas"]) &&
    isRecord(value["smoke"])
  )
}

function isSyncMessage(value: unknown): value is SyncMessage {
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

/** `layout` is what the battle's syncs pack into `SimSync.arrays`: its `soldierArrayLayout`. */
export function createSyncEncoder(layout: ArrayLayout): SyncEncoder {
  let view: SyncView | null = null
  return {
    encode(sync) {
      const next = viewOf(sync, view, layout)
      const message: SyncMessage = { v: diff(view, next), s: sync.steps, g: sync.ground }
      view = next
      return pack(message)
    },
    welcome(playerSquad, schedule, ground) {
      if (!view) {
        throw new Error("A player can't be welcomed before the battle's first sync")
      }
      return pack({ playerSquad, schedule, layout, view, ground })
    }
  }
}

function decoderFrom(start: SyncView, layout: ArrayLayout): SyncDecoder {
  let view = start
  return {
    decode(bytes) {
      const message: unknown = unpack(bytes)
      if (!isSyncMessage(message)) {
        throw new TypeError("The server sent a sync this client can't read")
      }
      const next: unknown = message.v ? apply(view, message.v) : view
      if (!isView(next)) {
        throw new TypeError("The server's sync doesn't fit the battle this client has")
      }
      view = next
      return syncOf(view, layout, message.v, message)
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
    !isView(welcome["view"]) ||
    !(welcome["ground"] === null || isMovement(welcome["ground"]))
  ) {
    throw new TypeError("The server sent a welcome this client can't read")
  }
  const { layout, view, ground } = welcome
  return {
    playerSquad: welcome["playerSquad"],
    schedule: welcome["schedule"],
    sync: syncOf(view, layout, { f: view }, { s: [], g: ground ? [groundFromMovement(map, ground)] : [] }),
    decoder: decoderFrom(view, layout)
  }
}
