import { Worker } from "node:worker_threads"
import type { SideSight } from "@verdun/net"
import type { GroundPatch, Simulation } from "@verdun/sim"
import { createInlineSight, type SideSightModel, sightFrame } from "./sight.ts"

/**
 * Each side's sight of the enemy, worked out in a worker thread (sight-worker.ts) so its sight lines don't hold up the
 * battle's steps: each look sends the worker where everyone is and takes its latest answer, a frame behind. A frame is
 * sent only once the last is answered, the craters kept for it meanwhile. Until the worker's first answer, or if it
 * fails, sight is worked out on the room's thread, as `createInlineSight` does, so no side is ever left blind.
 */
export function createSightThread(sim: Simulation, shares: number, log: (line: string) => void): SideSightModel {
  const inline = createInlineSight(sim, shares)
  const worker = new Worker(new URL("./sight-worker.ts", import.meta.url), { workerData: { map: sim.map, shares } })
  worker.unref()
  let latest: SideSight | null = null
  let failed = false
  let waiting = false
  let ground: GroundPatch[] = []
  worker.on("message", (seen: [number, Int32Array][]) => {
    latest = new Map(seen.map(([side, soldiers]) => [side, new Set(soldiers)]))
    waiting = false
  })
  worker.on("error", (error) => {
    failed = true
    log(`Sight's worker failed, so the room works it out itself: ${error.message}`)
  })
  return {
    look(reshaped) {
      if (failed) {
        return inline.look(reshaped)
      }
      ground.push(...reshaped)
      if (!waiting) {
        const frame = sightFrame(sim, ground)
        ground = []
        waiting = true
        worker.postMessage(frame)
      }
      return latest ?? inline.look(reshaped)
    },
    close() {
      void worker.terminate()
    }
  }
}
