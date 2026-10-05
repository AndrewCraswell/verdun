import { Side, type SimSync, type WarSchedule } from "@verdun/sim"
import { Packr } from "msgpackr"

/** The sector's room: one for each sector, made when the server starts and never closed. */
export const SECTOR_ROOM = "sector"

/** Messages, by type. */
export const MESSAGE = {
  /** Player to server: the player is listening, and wants the battle. */
  ready: "ready",
  /** Server to player, as bytes (`encodeJoined`): their squad, the war's calendar and the whole battle. */
  joined: "joined",
  /** Server to every player, as bytes (`encodeSync`): what changed in the battle since the last. */
  sync: "sync",
  /** Player to server: commands for the player's squad, in Colyseus's own encoding. */
  commands: "commands"
} as const

/** What a player asks for in joining a sector. */
export interface JoinOptions {
  readonly side: Side
}

/** What a player is sent on joining: the squad they lead, the war's calendar the battle keeps, and the battle itself. */
export interface Joined {
  readonly playerSquad: number
  readonly schedule: WarSchedule
  readonly sync: SimSync
}

/** MessagePack that keeps typed arrays and array buffers as they are, which the sync is made of. */
const packr = new Packr({ moreTypes: true, useRecords: false })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The side a joining player asked for: French unless they asked for Germany. */
export function joinSide(options: unknown): Side {
  return isRecord(options) && options["side"] === Side.German ? Side.German : Side.French
}

function isSchedule(value: unknown): value is WarSchedule {
  return (
    isRecord(value) &&
    Number.isFinite(value["begins"]) &&
    Number.isFinite(value["breakDays"]) &&
    Number.isFinite(value["standToMinutes"])
  )
}

/** A sync from the server: its shape checked, its contents trusted. */
function isSync(value: unknown): value is SimSync {
  return (
    isRecord(value) &&
    typeof value["tick"] === "number" &&
    typeof value["soldiers"] === "number" &&
    value["arrays"] instanceof ArrayBuffer &&
    isRecord(value["members"]) &&
    isRecord(value["state"]) &&
    Array.isArray(value["steps"]) &&
    Array.isArray(value["ground"]) &&
    isRecord(value["gas"]) &&
    isRecord(value["smoke"])
  )
}

function isJoined(value: unknown): value is Joined {
  return (
    isRecord(value) &&
    typeof value["playerSquad"] === "number" &&
    isSchedule(value["schedule"]) &&
    isSync(value["sync"])
  )
}

export function encodeSync(sync: SimSync): Uint8Array {
  return packr.pack(sync)
}

export function decodeSync(bytes: Uint8Array): SimSync {
  const sync: unknown = packr.unpack(bytes)
  if (!isSync(sync)) {
    throw new TypeError("The server sent a sync this client can't read")
  }
  return sync
}

export function encodeJoined(joined: Joined): Uint8Array {
  return packr.pack(joined)
}

export function decodeJoined(bytes: Uint8Array): Joined {
  const joined: unknown = packr.unpack(bytes)
  if (!isJoined(joined)) {
    throw new TypeError("The server sent a welcome this client can't read")
  }
  return joined
}
