import { parentPort, workerData } from "node:worker_threads"
import type { BattlefieldMap } from "@verdun/map"
import { createLineOfSight } from "@verdun/sim/physics"
import { createSightCore, type SightFrame } from "./sight.ts"

/**
 * The sector's sight of the enemy, worked out off the room's thread (sight-thread.ts): its own copy of the map and of
 * the sight lines, reshaped as each frame's craters come, answering each frame with what each side sees.
 */
const { map, shares }: { map: BattlefieldMap; shares: number } = workerData
const core = createLineOfSight(map).then((lineOfSight) => createSightCore(map, lineOfSight, shares))

parentPort?.on("message", (frame: SightFrame) => {
  void core.then((sight) => {
    const seen = [...sight.look(frame)].map(([side, soldiers]) => [side, Int32Array.from(soldiers)] as const)
    parentPort?.postMessage(seen)
  })
})
