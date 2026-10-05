import { Worker } from "node:worker_threads"
import type { GroundMovement, Recipient, SideSight } from "@verdun/net"
import type { SimSync, WarSchedule } from "@verdun/sim"
import { type Encoding, type EncodingShape, gridOf, type Messages } from "./encoding.ts"

/** What the room asks of the encoding's worker (encoding-worker.ts). */
export type EncodingJob =
  | {
      readonly kind: "encode"
      readonly id: number
      readonly sync: SimSync
      readonly sight: SideSight | null
      readonly recipients: ReadonlyMap<string, Recipient>
    }
  | {
      readonly kind: "welcome"
      readonly id: number
      readonly playerSquad: number
      readonly side: number
      readonly schedule: WarSchedule
      readonly ground: GroundMovement | null
    }
  | { readonly kind: "forget"; readonly player: string }

/** The worker's answers, to the job of the same id. */
type Answer =
  | { readonly id: number; readonly messages: Messages; readonly encodeMs: number }
  | { readonly id: number; readonly welcome: Uint8Array }

/**
 * Encoding in a worker thread, so making every player's message doesn't hold up the battle's steps: each sync goes to
 * the worker as it's taken, and each player's message comes back a few milliseconds later, in order. If the worker
 * fails, `failed` is told: every player's battle builds on what it had, so there's no carrying on without it.
 */
export function createEncodingThread(shape: EncodingShape, failed: (error: Error) => void): Encoding {
  const worker = new Worker(new URL("./encoding-worker.ts", import.meta.url), { workerData: shape })
  worker.unref()
  const waiting = new Map<number, (answer: Answer) => void>()
  let next = 0
  worker.on("message", (answer: Answer) => {
    const answered = waiting.get(answer.id)
    waiting.delete(answer.id)
    answered?.(answer)
  })
  worker.on("error", failed)
  return {
    grid: gridOf(shape),
    encode(sync, sight, recipients, deliver) {
      const id = next++
      waiting.set(id, (answer) => {
        if ("messages" in answer) {
          deliver(answer.messages, answer.encodeMs)
        }
      })
      const job: EncodingJob = { kind: "encode", id, sync, sight, recipients }
      // The soldiers' arrays go over rather than being copied: the sync is the worker's now.
      worker.postMessage(job, [sync.arrays])
    },
    welcome(playerSquad, side, schedule, ground, deliver) {
      const id = next++
      waiting.set(id, (answer) => {
        if ("welcome" in answer) {
          deliver(answer.welcome)
        }
      })
      const job: EncodingJob = { kind: "welcome", id, playerSquad, side, schedule, ground }
      worker.postMessage(job)
    },
    forget(player) {
      const job: EncodingJob = { kind: "forget", player }
      worker.postMessage(job)
    },
    close() {
      void worker.terminate()
    }
  }
}
