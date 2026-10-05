import type { BattlefieldMap } from "@verdun/map"
import type { SimSync } from "@verdun/sim"
import type { Decoding, Welcome } from "./decoding.ts"

/** What the page asks of the decoding's worker (decode-worker.ts). */
export type ToDecoder =
  | { readonly kind: "map"; readonly map: BattlefieldMap }
  | { readonly kind: "welcome" | "sync"; readonly bytes: Uint8Array }

/** What it answers, each to the message before it, in order. */
export type FromDecoder =
  | { readonly kind: "welcome"; readonly welcome: Welcome }
  | { readonly kind: "sync"; readonly sync: SimSync; readonly seen: Int32Array | null }
  | { readonly kind: "failed"; readonly message: string }

/**
 * Reading in a worker: the page hands it each message's bytes and takes the sync back a moment later, its soldier
 * arrays handed over rather than copied. A message it can't read is thrown on the page, as reading inline would.
 */
export function createDecodingWorker(map: BattlefieldMap): Decoding {
  const worker = new Worker(new URL("./decode-worker.ts", import.meta.url), { type: "module" })
  const waiting: ((answer: FromDecoder) => void)[] = []
  let welcomed = false
  let seen: ReadonlySet<number> | null = null
  worker.addEventListener("message", (event: MessageEvent<FromDecoder>) => {
    const answer = event.data
    const answered = waiting.shift()
    if (answer.kind === "failed") {
      throw new TypeError(answer.message)
    }
    answered?.(answer)
  })
  const ask: (message: ToDecoder, transfer?: Transferable[]) => void = (message, transfer = []) =>
    worker.postMessage(message, transfer)
  ask({ kind: "map", map })
  return {
    welcome(bytes, taken) {
      welcomed = true
      waiting.push((answer) => {
        if (answer.kind === "welcome") {
          taken(answer.welcome)
        }
      })
      ask({ kind: "welcome", bytes })
    },
    decode(bytes, taken) {
      if (!welcomed) {
        return false
      }
      waiting.push((answer) => {
        if (answer.kind === "sync") {
          seen = answer.seen ? new Set(answer.seen) : null
          taken(answer.sync)
        }
      })
      ask({ kind: "sync", bytes })
      return true
    },
    get seen() {
      return seen
    },
    dispose() {
      worker.terminate()
    }
  }
}
