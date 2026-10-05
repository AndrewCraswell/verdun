import {
  type ArrayLayout,
  CELL_SIZE,
  type CellGrid,
  cellGrid,
  createSyncEncoder,
  type GroundMovement,
  type Recipient,
  type SideSight
} from "@verdun/net"
import type { SimSync, WarSchedule } from "@verdun/sim"

/** Each player's message, by player. */
export type Messages = ReadonlyMap<string, Uint8Array>

/**
 * Turning the battle's syncs into each player's message: on the room's thread (`createInlineEncoding`), or in a worker
 * (encoding-thread.ts), which answers later. Either way every call is answered in the order it was made, so a welcome
 * is the battle as of the sync before it, which the sync after builds on.
 */
export interface Encoding {
  /** The map's cells, as players' near cells are counted in. */
  readonly grid: CellGrid
  /**
   * Takes the battle's next sync, with each side's `sight` of the enemy, and calls `deliver` with the message for each
   * of `recipients` (by player) and how long the encoding took, in milliseconds. Every sync must come through here,
   * sent to anyone or not: each builds on the last.
   */
  encode(
    sync: SimSync,
    sight: SideSight | null,
    recipients: ReadonlyMap<string, Recipient>,
    deliver: (messages: Messages, encodeMs: number) => void
  ): void
  /** Calls `deliver` with what a player of `side` joining to lead `playerSquad` is sent (see `SyncEncoder.welcome`). */
  welcome(
    playerSquad: number,
    side: number,
    schedule: WarSchedule,
    ground: GroundMovement | null,
    deliver: (welcome: Uint8Array) => void
  ): void
  /** A player has left. */
  forget(player: string): void
  /** Stops encoding, for good. */
  close(): void
}

/** What an encoding is made from: the battle's soldier arrays' layout, and the map's size in metres. */
export interface EncodingShape {
  readonly layout: ArrayLayout
  readonly width: number
  readonly depth: number
}

/** The map's cells for a battle of `shape`, as its encoder counts them. */
export const gridOf = (shape: EncodingShape): CellGrid => cellGrid(shape.width, shape.depth, CELL_SIZE)

/** Encoding on the calling thread, answering at once: for tests, and inside the encoding's worker. */
export function createInlineEncoding(shape: EncodingShape): Encoding {
  const encoder = createSyncEncoder(shape.layout, shape.width, shape.depth)
  return {
    grid: encoder.grid,
    encode(sync, sight, recipients, deliver) {
      const started = performance.now()
      const encoded = encoder.encode(sync, sight)
      const messages = new Map<string, Uint8Array>()
      for (const [player, recipient] of recipients) {
        // A copy of its own: MessagePack gives Node buffers out of a shared pool, which `slice` doesn't copy.
        messages.set(player, new Uint8Array(encoded.for(player, recipient)))
      }
      deliver(messages, performance.now() - started)
    },
    welcome(playerSquad, side, schedule, ground, deliver) {
      deliver(encoder.welcome(playerSquad, side, schedule, ground))
    },
    forget(player) {
      encoder.forget(player)
    },
    close() {
      // Nothing held.
    }
  }
}
