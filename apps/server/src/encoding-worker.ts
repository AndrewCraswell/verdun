import { parentPort, workerData } from "node:worker_threads"
import type { EncodingJob } from "./encoding-thread.ts"
import { createInlineEncoding, type EncodingShape } from "./encoding.ts"

/**
 * The sector's encoding, off the room's thread (encoding-thread.ts): the encoder itself, answering each job in the
 * order it came.
 */
const shape: EncodingShape = workerData
const encoding = createInlineEncoding(shape)

parentPort?.on("message", (job: EncodingJob) => {
  switch (job.kind) {
    case "encode":
      encoding.encode(job.sync, job.sight, job.recipients, (messages, encodeMs) => {
        parentPort?.postMessage(
          { id: job.id, messages, encodeMs },
          [...messages.values()]
            .map((message) => message.buffer)
            .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer)
        )
      })
      break
    case "welcome":
      encoding.welcome(job.playerSquad, job.side, job.schedule, job.ground, (welcome) => {
        parentPort?.postMessage({ id: job.id, welcome })
      })
      break
    case "forget":
      encoding.forget(job.player)
      break
  }
})
