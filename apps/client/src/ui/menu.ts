import { allBindings, type BindingGroup } from "./bindings.ts"
import "./menu.css"

export interface Menu {
  readonly open: boolean
  show(open: boolean): void
  dispose(): void
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag)
  created.className = className
  if (text !== undefined) {
    created.textContent = text
  }
  return created
}

/** The controls list: a table per group, keys on the left and what they do on the right. */
function controlsList(groups: readonly BindingGroup[]): HTMLElement {
  const list = element("div", "menu-controls")
  for (const group of groups) {
    const section = element("section", "menu-group")
    section.append(element("h3", "menu-group-title", group.title))
    const table = element("table", "menu-bindings")
    for (const binding of group.bindings) {
      const row = element("tr", "menu-binding")
      const keys = element("th", "menu-keys", binding.keys)
      keys.scope = "row"
      row.append(keys, element("td", "menu-action", binding.action))
      table.append(row)
    }
    section.append(table)
    list.append(section)
  }
  return list
}

/**
 * The menu, opened and closed with Esc: the game's controls, every key and what it does, and a way back to the battle.
 * The battle carries on behind it, as it will online. While it's open it takes the keyboard, so keys meant for the
 * menu don't reach the game.
 */
export function createMenu(
  parent: HTMLElement,
  { development = false }: { readonly development?: boolean } = {}
): Menu {
  const hint = element("div", "menu-hint", "Esc for menu and controls")
  const backdrop = element("div", "menu-backdrop")
  backdrop.hidden = true
  const panel = element("div", "menu-panel")
  panel.setAttribute("role", "dialog")
  panel.setAttribute("aria-modal", "true")
  panel.setAttribute("aria-label", "Menu")
  const header = element("header", "menu-header")
  header.append(element("h2", "menu-title", "Controls"))
  const resume = element("button", "menu-resume", "Back to the battle")
  resume.type = "button"
  header.append(resume)
  const body = element("div", "menu-body")
  panel.append(header, body)
  backdrop.append(panel)
  parent.append(hint, backdrop)
  let open = false

  function show(next: boolean): void {
    open = next
    backdrop.hidden = !next
    hint.hidden = next
    if (next) {
      // Rebuilt on every open, so bindings other modules registered since show up.
      body.replaceChildren(controlsList(allBindings(development)))
      resume.focus()
    }
  }

  // Capture, so the menu hears keys before the game does and can keep them from it while open. Key releases still
  // reach the game, so nothing held when the menu opened stays stuck down.
  const onKey = (event: KeyboardEvent) => {
    if (event.code === "Escape" && !event.repeat) {
      event.preventDefault()
      event.stopImmediatePropagation()
      show(!open)
      return
    }
    // Tab and Enter still move focus and press buttons in the menu: that's the browser's default, which this leaves be.
    if (open) {
      event.stopImmediatePropagation()
    }
  }
  const onBackdrop = (event: MouseEvent) => {
    if (event.target === backdrop) {
      show(false)
    }
  }
  const onResume = () => show(false)
  window.addEventListener("keydown", onKey, { capture: true })
  backdrop.addEventListener("click", onBackdrop)
  resume.addEventListener("click", onResume)

  return {
    get open() {
      return open
    },
    show,
    dispose() {
      window.removeEventListener("keydown", onKey, { capture: true })
      backdrop.removeEventListener("click", onBackdrop)
      resume.removeEventListener("click", onResume)
      hint.remove()
      backdrop.remove()
    }
  }
}
