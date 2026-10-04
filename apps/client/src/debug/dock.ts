/**
 * The debug dock: one column in the top left corner that every debug panel stacks into, so they never cover the HUD or
 * each other. F3 shows and hides the whole dock.
 */
export interface DebugDock {
  readonly element: HTMLElement
  readonly visible: boolean
  /** Shows or hides the dock and everything in it. */
  show(visible: boolean): void
  /** Calls back whenever the dock is shown or hidden, so panels can stop work while hidden. Returns an unsubscribe. */
  onToggle(listener: (visible: boolean) => void): () => void
}

let dock: DebugDock | null = null

/** The page's debug dock, created on first use. Debug panels append themselves to `debugDock().element`. */
export function debugDock(): DebugDock {
  if (dock) {
    return dock
  }
  const element = document.createElement("div")
  element.className = "debug-dock"
  element.hidden = true
  document.body.append(element)
  const listeners = new Set<(visible: boolean) => void>()
  const created: DebugDock = {
    element,
    get visible() {
      return !element.hidden
    },
    show(visible) {
      element.hidden = !visible
      for (const listener of listeners) {
        listener(visible)
      }
    },
    onToggle(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  window.addEventListener("keydown", (event) => {
    if (event.code === "F3" && !event.repeat) {
      event.preventDefault()
      created.show(!created.visible)
    }
  })
  dock = created
  return created
}
