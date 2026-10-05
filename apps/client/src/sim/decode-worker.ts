import type { FromDecoder, ToDecoder } from "./decoding-thread.ts"
import { createInlineDecoding, type Decoding } from "./decoding.ts"

/**
 * Reads the server's messages off the page's thread (decoding-thread.ts): each one inflated, unpacked and built on the last,
 * and its sync handed back, the soldier arrays moved rather than copied.
 */
let decoding: Decoding | null = null

const answer = (message: FromDecoder, transfer: Transferable[] = []) => self.postMessage(message, transfer)

self.addEventListener("message", (event: MessageEvent<ToDecoder>) => {
  const message = event.data
  try {
    if (message.kind === "map") {
      decoding = createInlineDecoding(message.map)
    } else if (message.kind === "welcome") {
      decoding?.welcome(message.bytes, (welcome) => answer({ kind: "welcome", welcome }, [welcome.sync.arrays]))
    } else {
      // Every message is answered, so the page's answers stay in step with what it asked.
      let read = false
      const reading = decoding
      void reading?.decode(message.bytes, (sync) => {
        read = true
        const seen = reading.seen ? Int32Array.from(reading.seen) : null
        answer({ kind: "sync", sync, seen }, [sync.arrays])
      })
      if (!read) {
        answer({ kind: "failed", message: "The battle's message came before its welcome" })
      }
    }
  } catch (error) {
    answer({ kind: "failed", message: error instanceof Error ? error.message : String(error) })
  }
})
