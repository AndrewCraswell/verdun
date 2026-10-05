import { h } from "../hud/dom.ts"
import { allBindings } from "./bindings.ts"
import { button } from "./fields.ts"
import { KEY_GROUPS, type KeyAction, keyName, keymap } from "./keymap.ts"
import type { MenuPage } from "./page.ts"

/** What an action is called in the messages: its label in the controls list. */
function labelOf(action: KeyAction): string {
  for (const group of KEY_GROUPS) {
    const info = group.actions.find((each) => each.action === action)
    if (info) {
      return info.label
    }
  }
  return action
}

/** Keys the browser keeps for itself, or that would leave the player without a way out. */
const REFUSED = new Set(["Escape", "MetaLeft", "MetaRight", "ContextMenu", "F5", "F11", "F12"])

/**
 * The controls (S2): every key and mouse binding, grouped, and the movable ones rebindable. Click a key, press the new
 * one: a key another action had is swapped onto that action, and the page says so. Esc cancels. Reset puts a group,
 * or everything, back.
 */
export function createControlsPage({ development }: { readonly development: boolean }): MenuPage {
  const keys = keymap()
  const status = h("p", "ui-controls-status")
  status.setAttribute("role", "status")
  const list = h("div", "ui-controls")
  const resetAll = button("Reset all keys", () => {
    keys.reset()
    say("Every key is back where it started.")
  })
  let waiting: { action: KeyAction; cap: HTMLButtonElement } | null = null
  let stopListening: (() => void) | null = null

  function say(text: string): void {
    status.textContent = text
  }

  function stopWaiting(): void {
    if (waiting) {
      waiting.cap.classList.remove("ui-key--waiting")
      waiting.cap.textContent = keys.label(waiting.action)
      waiting = null
    }
  }

  function build(): void {
    const focusedAction = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.action : null
    stopWaiting()
    list.replaceChildren()
    for (const group of allBindings(development)) {
      const rows = h("div", "ui-bindings")
      const movable = group.bindings.flatMap((binding) => (binding.rebind ? [binding.rebind] : []))
      for (const binding of group.bindings) {
        const action = binding.rebind
        let keysCell: HTMLElement
        if (action) {
          const cap = button(binding.keys, () => startWaiting(action, cap), "ui-key ui-key--movable")
          cap.dataset.action = action
          cap.setAttribute("aria-label", `${binding.action}: ${binding.keys}. Press to choose another key`)
          keysCell = cap
        } else {
          keysCell = h("span", "ui-key ui-key--fixed", binding.keys)
        }
        rows.append(h("div", "ui-binding", h("span", "ui-binding-action", binding.action), keysCell))
      }
      const heading = h("h3", "ui-settings-heading", group.title)
      if (movable.length > 0) {
        heading.append(
          button(
            "Reset",
            () => {
              for (const action of movable) {
                keys.reset(action)
              }
              say(`${group.title}: back to the starting keys.`)
            },
            "ui-link"
          )
        )
      }
      list.append(h("section", "ui-settings-section", heading, rows))
    }
    if (focusedAction) {
      list.querySelector<HTMLElement>(`[data-action="${focusedAction}"]`)?.focus()
    }
  }

  function startWaiting(action: KeyAction, cap: HTMLButtonElement): void {
    stopWaiting()
    waiting = { action, cap }
    cap.classList.add("ui-key--waiting")
    cap.textContent = "Press a key"
    say(`Press the key for "${labelOf(action)}". Esc to keep it as it is.`)
  }

  return {
    id: "controls",
    title: "Controls",
    root: h(
      "div",
      "ui-controls-page",
      h(
        "div",
        "ui-controls-bar",
        h(
          "p",
          "ui-controls-intro",
          "Click a key to move it. Keys are read by where they sit, whatever your keyboard's layout."
        ),
        resetAll
      ),
      status,
      list
    ),
    opened() {
      say("")
      build()
      stopListening ??= keys.listen(build)
    },
    closed() {
      stopWaiting()
      stopListening?.()
      stopListening = null
    },
    key(event) {
      if (!waiting || event.repeat) {
        return false
      }
      event.preventDefault()
      const { action, cap } = waiting
      if (event.code === "Escape") {
        stopWaiting()
        say("")
        cap.focus()
        return true
      }
      if (REFUSED.has(event.code)) {
        say(`${keyName(event.code)} is kept for the browser or the menu. Choose another key.`)
        return true
      }
      const result = keys.rebind(action, event.code)
      if (!result) {
        say(`${keyName(event.code)} can't be moved: the menu, the squad's slots 1 to 8 and the debug keys keep theirs.`)
        return true
      }
      const moved = `"${labelOf(action)}" is now on ${keys.label(action)}.`
      say(
        result.swapped
          ? `${moved} "${labelOf(result.swapped)}" had that key, and takes ${keys.label(result.swapped)} instead.`
          : moved
      )
      return true
    },
    dispose() {
      stopListening?.()
    }
  }
}
