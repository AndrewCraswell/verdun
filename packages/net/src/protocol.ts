import { Side } from "@verdun/sim"

/** The sector's room: one for each sector, made when the server starts and never closed. */
export const SECTOR_ROOM = "sector"

/** Messages, by type. */
export const MESSAGE = {
  /** Player to server: the player is listening, and wants the battle. */
  ready: "ready",
  /** Server to player, as bytes (`SyncEncoder.welcome`): their squad, the war's calendar and the whole battle. */
  joined: "joined",
  /** Server to every player, as bytes (`SyncEncoder.encode`): what changed in the battle since the last. */
  sync: "sync",
  /** Player to server: commands for the player's squad, in Colyseus's own encoding (`CommandBatch`). */
  commands: "commands",
  /** Server to player: the player's commands have been applied (`Acknowledgement`), for client-side prediction. */
  ack: "ack"
} as const

/** A player's commands, with the player's own step they were given at, which the server acknowledges. */
export interface CommandBatch {
  readonly step: number
  readonly commands: readonly unknown[]
}

/** The server applied a player's commands of their step `step` at its own tick `tick`. */
export interface Acknowledgement {
  readonly step: number
  readonly tick: number
}

/** What a player asks for in joining a sector. */
export interface JoinOptions {
  readonly side: Side
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** An acknowledgement from the server, or null for anything else. */
export function acknowledgement(value: unknown): Acknowledgement | null {
  return isRecord(value) && Number.isFinite(value["step"]) && Number.isFinite(value["tick"])
    ? { step: Number(value["step"]), tick: Number(value["tick"]) }
    : null
}

/** The side a joining player asked for: French unless they asked for Germany. */
export function joinSide(options: unknown): Side {
  return isRecord(options) && options["side"] === Side.German ? Side.German : Side.French
}
