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
  /** Player to server: commands for the player's squad, in Colyseus's own encoding. */
  commands: "commands"
} as const

/** What a player asks for in joining a sector. */
export interface JoinOptions {
  readonly side: Side
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The side a joining player asked for: French unless they asked for Germany. */
export function joinSide(options: unknown): Side {
  return isRecord(options) && options["side"] === Side.German ? Side.German : Side.French
}
