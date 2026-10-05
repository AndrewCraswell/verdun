import type { BattlefieldMap } from "@verdun/map"
import { decodeJoined, type SyncDecoder } from "@verdun/net"
import type { SimSync, WarSchedule } from "@verdun/sim"

/** A welcome to the battle, read. */
export interface Welcome {
  readonly playerSquad: number
  readonly schedule: WarSchedule
  readonly sync: SimSync
}

/**
 * Reading the server's messages: in a worker (decoding-thread.ts), so inflating and unpacking each one ten times a
 * second takes nothing from the page's frames, or on the page (`createInlineDecoding`), for tests and where workers
 * can't run. Either way messages are read in the order given, each after the welcome, and answered in that order.
 */
export interface Decoding {
  /** Reads the welcome, then calls `taken` with it. Messages given before it are passed over. */
  welcome(bytes: Uint8Array, taken: (welcome: Welcome) => void): void
  /**
   * Reads a message after the welcome, then calls `taken` with the sync it brings. Returns whether it will: a message
   * before the welcome is passed over.
   */
  decode(bytes: Uint8Array, taken: (sync: SimSync) => void): boolean
  /** The enemy the player's side can see, as of the last message taken: see `SyncDecoder.seen`. */
  readonly seen: ReadonlySet<number> | null
  dispose(): void
}

/** Reading on the page, answering at once. */
export function createInlineDecoding(map: BattlefieldMap): Decoding {
  let decoder: SyncDecoder | null = null
  return {
    welcome(bytes, taken) {
      const { playerSquad, schedule, sync, decoder: reading } = decodeJoined(bytes, map)
      decoder = reading
      // Only what the welcome brings, which goes from a worker to the page.
      taken({ playerSquad, schedule, sync })
    },
    decode(bytes, taken) {
      if (!decoder) {
        return false
      }
      taken(decoder.decode(bytes))
      return true
    },
    get seen() {
      return decoder?.seen ?? null
    },
    dispose() {
      decoder = null
    }
  }
}
