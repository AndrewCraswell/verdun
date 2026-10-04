import type { Scene } from "@babylonjs/core/scene"
import type { InspectorToken } from "@babylonjs/inspector"

/** Backquote toggles the Babylon Inspector in dev builds. `code` is layout-independent; `key` covers synthetic events. */
function isToggleKey(event: KeyboardEvent): boolean {
  return event.code === "Backquote" || event.key === "`"
}

/**
 * Toggles Babylon's Inspector with the backquote key. Dev builds only: the Inspector and its peers (React, Fluent UI,
 * the node editors) load on first use and never reach the production bundle.
 */
export function installInspectorToggle(scene: Scene): void {
  let inspector: InspectorToken | undefined

  window.addEventListener("keydown", (event) => {
    if (!isToggleKey(event) || event.repeat) {
      return
    }
    if (inspector && !inspector.isDisposed) {
      void inspector.dispose()
      inspector = undefined
      return
    }
    import("@babylonjs/inspector")
      .then(({ ShowInspector }) => {
        inspector = ShowInspector(scene)
      })
      .catch((error: unknown) => {
        console.error("Babylon Inspector failed to load", error)
      })
  })
}
