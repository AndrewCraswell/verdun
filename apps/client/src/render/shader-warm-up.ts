import type { Scene } from "@babylonjs/core/scene"

/**
 * What can be held, for a frame drawn behind the loading screen, as it will be later in the battle: the night's lights
 * and the flares' on, every layer of the soldiers drawing. With null, let go again.
 */
export interface Held {
  hold(on: boolean | null): void
}

/** How long the loading screen waits, at most, for the browser to finish building what the warm-up asked for. */
const LONGEST_MS = 20_000

/**
 * Builds, while the battle loads, the shaders the battle would otherwise first need in the middle of it. At dusk the
 * fires', a rifle flash's and the flares' lights all come on together, and every lit material's shader changes with
 * them, from two lights to eight: built as the first night fell, they stalled the battle for 2.5-3 s while the browser
 * compiled them. A layer of the soldiers (the Germans, the gas masks) draws only once someone in it is in view, and its
 * shaders were built then, a stall of half a second or more the first time the camera pulled back over the enemy.
 * Holds everything on until the scene is ready and a frame has drawn with it, then lets go: Babylon keeps what it built.
 *
 * On WebGPU the browser compiles a frame's new shader modules in its GPU process after the frame was handed over, and
 * the frames after wait while it does: a frame drawn is no sign they're built, and the first seconds of battle stalled
 * for 2-10 s instead. So each module made meanwhile is asked for its compilation's report, and this resolves once every
 * report has come back. (Waiting for frames to come quickly again let the battle start early: a few still came before
 * the browser held them back. Waiting for the GPU's queue took ten seconds more than the shaders did.)
 */
export async function warmUpShaders(scene: Scene, held: readonly (Held | null)[]): Promise<void> {
  const built = watchBuilding(Reflect.get(scene.getEngine(), "_device"))
  for (const each of held) {
    each?.hold(true)
  }
  try {
    await scene.whenReadyAsync()
    await new Promise<void>((resolve) => scene.onAfterRenderObservable.addOnce(() => resolve()))
  } finally {
    for (const each of held) {
      each?.hold(null)
    }
    // Babylon counts a material it found ready in a frame as ready for the rest of it, whatever changes since.
    scene.incrementRenderId()
  }
  await built()
}

/**
 * Has every shader module `device` makes from now on report when it's compiled, and returns what stops watching and
 * resolves once they all have, `LONGEST_MS` at most. On any other engine, nothing.
 */
export function watchBuilding(device: unknown): () => Promise<void> {
  if (typeof device !== "object" || device === null) {
    return () => Promise.resolve()
  }
  const reports: Promise<unknown>[] = []
  const createModule: unknown = Reflect.get(device, "createShaderModule")
  if (typeof createModule === "function") {
    Reflect.set(device, "createShaderModule", (descriptor: unknown) => {
      const module: unknown = Reflect.apply(createModule, device, [descriptor])
      const report: unknown =
        typeof module === "object" && module !== null ? Reflect.get(module, "getCompilationInfo") : undefined
      if (typeof report === "function") {
        reports.push(Promise.resolve(Reflect.apply(report, module, [])).catch(() => undefined))
      }
      return module
    })
  }
  return async () => {
    Reflect.deleteProperty(device, "createShaderModule")
    let timer: ReturnType<typeof setTimeout> | undefined
    const longest = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LONGEST_MS)
    })
    await Promise.race([Promise.all(reports), longest])
    clearTimeout(timer)
  }
}
