/// <reference lib="webworker" />
/**
 * The simulation, off the page's thread: it steps here, so a step that takes long (sight lines rebuilt after craters, a
 * burst of route searches when big orders land) costs the battle a moment, not the picture a frame. The page keeps a
 * mirror of it (sim-host.ts); the work is in sim-runner.ts, and this only carries the messages.
 */
import type { ToWorker } from "./sim-protocol.ts"
import { createSimRunner } from "./sim-runner.ts"

const handle = createSimRunner((message, transfer) => self.postMessage(message, transfer))
self.addEventListener("message", (event: MessageEvent<ToWorker>) => handle(event.data))
