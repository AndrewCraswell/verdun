import type { WarDay } from "@verdun/sim"
import { countdownLabel, turnLabel, weekLabel } from "../environment/calendar.ts"
import { h, setText } from "../hud/dom.ts"
import { type InterfaceSettings, interfaceSettings } from "../hud/interface-settings.ts"
import { createControlsPage } from "./controls.ts"
import { createCreditsPage } from "./credits.ts"
import { createFrontMapPage } from "./front/front-map.ts"
import { OPEN_SECTOR, seasonPhase } from "./front/front.ts"
import { createOptionsPage } from "./options.ts"
import type { MenuPage } from "./page.ts"
// The menus share the HUD's type: Archivo for reading, Bodoni Moda for headings.
import "@fontsource-variable/archivo/wdth.css"
import "@fontsource-variable/bodoni-moda/opsz.css"
import "@fontsource-variable/bodoni-moda/opsz-italic.css"
import "./menu.css"

export interface Menu {
  /** Whether a menu is up: the front door, or the menu over the battle. */
  readonly open: boolean
  /**
   * Whether the battle should stand still: at the front door, while the menu is open, or after P. Single-player only;
   * online, the battle carries on regardless.
   */
  readonly paused: boolean
  /** Whether the front door is up, before the player has gone into the line. */
  readonly atFrontDoor: boolean
  /** Opens or closes the menu over the battle. */
  show(open: boolean): void
  /** What the battle's loading is doing now, and how far along it is, 0 to 1, for the front door. */
  progress(step: string, share: number): void
  /** The battle is ready: the front door's way in opens. */
  ready(): void
  /** Parts of the game the menus show once they exist: the war's calendar, the renderer. */
  attach(parts: { readonly war?: { readonly day: WarDay }; readonly renderer?: string }): void
  /** Settles when the player goes into the line: at once when there is no front door. */
  readonly entered: Promise<void>
  dispose(): void
}

export interface MenuOptions {
  readonly development?: boolean
  /** Whether the game opens on the front door, or goes straight into the line. */
  readonly frontDoor?: boolean
  /** The build, for the footer: a commit, or "dev". */
  readonly build?: string
}

/** The address to reload at: without `?quality`, which would override the setting, and into the line or not. */
function reloadAddress(play: boolean): string {
  const address = new URL(location.href)
  address.searchParams.delete("quality")
  address.searchParams.delete("play")
  if (play) {
    address.searchParams.set("play", "")
  }
  return address.toString().replace(/([?&]play)=(?=&|$)/, "$1")
}

/**
 * The game's menus: the front door the game opens on (S13), and the menu Esc opens over the battle (S1), sharing one
 * list down the left and the pages it opens beside it: the war map, the options, the controls and the credits.
 *
 * The battle waits while either is up, and after P. While a menu is up it takes the keyboard, so keys meant for it
 * don't reach the game; key releases still do, so nothing held when it opened stays stuck down.
 */
export function createMenu(
  parent: HTMLElement,
  { development = false, frontDoor = true, build = "dev" }: MenuOptions = {}
): Menu {
  let war: { readonly day: WarDay } | null = null
  let renderer: string | null = null
  let atFrontDoor = frontDoor
  let open = frontDoor
  let held = false
  let loaded = false
  let entering: () => void = () => undefined
  const entered = new Promise<void>((resolve) => {
    entering = resolve
  })
  if (!frontDoor) {
    entering()
  }

  const hint = h("div", "menu-hint", "Esc for the menu")
  const pausedBanner = h("div", "menu-paused", "Paused. P to carry on")
  pausedBanner.hidden = true

  // The list down the left.
  const kicker = h("div", "ui-kicker")
  const title = h("h1", "ui-title")
  const week = h("div", "ui-week")
  const turn = h("div", "ui-turn")
  const phase = h("div", "ui-phase")
  const nav = h("nav", "ui-nav-list")
  nav.setAttribute("aria-label", "Menu")
  const footer = h("footer", "ui-footer", `Single-player prototype · build ${build}`)
  const column = h(
    "div",
    "ui-column",
    h("header", "ui-masthead", kicker, title),
    h("div", "ui-date", week, turn, phase),
    nav,
    footer
  )

  // The page beside it.
  const pageTitle = h("h2", "ui-page-title")
  const pageClose = h("button", "ui-page-close", "Back")
  pageClose.type = "button"
  pageClose.setAttribute("aria-label", "Back to the menu (Esc)")
  const pageBody = h("div", "ui-page-body")
  const pagePanel = h("section", "ui-page", h("header", "ui-page-header", pageTitle, pageClose), pageBody)
  pagePanel.hidden = true

  const root = h("div", "ui", h("div", "ui-veil"), column, pagePanel)
  root.setAttribute("role", "dialog")
  root.setAttribute("aria-modal", "true")
  root.setAttribute("aria-label", "Menu")
  parent.append(root, hint, pausedBanner)

  // The pages, made once and kept.
  const reload = (play: boolean) => location.assign(reloadAddress(play))
  const front = createFrontMapPage({
    war: () => war?.day ?? null,
    entry: () =>
      atFrontDoor
        ? { label: loaded ? `Into the line at ${OPEN_SECTOR.name}` : "The battle is still coming up", enabled: loaded }
        : { label: "Back to the battle", enabled: true },
    enter: () => (atFrontDoor ? enter() : show(false))
  })
  const pages: MenuPage[] = [
    front,
    createOptionsPage({ renderer: () => renderer, reload: () => reload(!atFrontDoor) }),
    createControlsPage({ development }),
    createCreditsPage()
  ]
  let page: MenuPage | null = null
  let opener: HTMLElement | null = null

  function openPage(next: MenuPage | null): void {
    if (page === next) {
      return
    }
    page?.closed?.()
    page = next
    root.dataset.page = next?.id ?? ""
    pagePanel.hidden = !next
    for (const item of nav.querySelectorAll<HTMLElement>("[data-page]")) {
      item.setAttribute("aria-current", String(item.dataset.page === next?.id))
    }
    if (next) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setText(pageTitle, next.title)
      pageBody.replaceChildren(next.root)
      next.opened?.()
      pageClose.focus()
    } else {
      pageBody.replaceChildren()
      opener?.focus()
    }
  }

  // The way in, at the front door: a big entry that shows the loading until the battle is ready.
  const enterButton = h("button", "ui-nav-item ui-nav-item--primary")
  enterButton.type = "button"
  const enterLabel = h("span", "ui-nav-label")
  const enterNote = h("span", "ui-nav-note")
  const enterBar = h("span", "ui-progress", h("span", "ui-progress-fill"))
  enterButton.append(enterLabel, enterNote, enterBar)
  enterButton.addEventListener("click", () => (atFrontDoor ? enter() : show(false)))

  function navItem(label: string, onClick: () => void, pageId?: string): HTMLButtonElement {
    const item = h("button", "ui-nav-item", h("span", "ui-nav-label", label))
    item.type = "button"
    if (pageId) {
      item.dataset.page = pageId
    }
    item.addEventListener("click", onClick)
    return item
  }

  const pageItems = pages.map((each) => navItem(each.title, () => openPage(page === each ? null : each), each.id))
  const restart = navItem("Restart the skirmish", () => reload(true))
  const leave = navItem("Leave for the front door", () => reload(false))

  function layout(): void {
    root.dataset.mode = atFrontDoor ? "front-door" : "battle"
    document.body.dataset.frontDoor = String(atFrontDoor)
    setText(kicker, atFrontDoor ? "The Western Front, 1914–1918" : "The battle waits")
    setText(title, atFrontDoor ? "Verdun" : OPEN_SECTOR.name)
    setText(enterLabel, atFrontDoor ? "Into the line" : "Back to the battle")
    nav.replaceChildren(enterButton, ...pageItems, ...(atFrontDoor ? [] : [restart, leave]))
    entry()
  }

  function entry(): void {
    enterButton.disabled = atFrontDoor && !loaded
    enterButton.dataset.loading = String(atFrontDoor && !loaded)
    if (!atFrontDoor) {
      setText(enterNote, "Esc")
    } else if (loaded) {
      setText(enterNote, `${OPEN_SECTOR.name}, Verdun's right bank`)
    }
  }

  /** The date block: the week, the turn and the next communiqué, and where the year stands. */
  function date(): void {
    const day = war?.day
    if (!day) {
      return
    }
    setText(week, day.phase === "turn" ? weekLabel(day.week) : turnLabel(day))
    setText(
      turn,
      day.phase === "turn" ? `${turnLabel(day)} · ${countdownLabel(day, Date.now())}` : countdownLabel(day, Date.now())
    )
    setText(phase, day.phase === "turn" ? (seasonPhase(day.season, day.turn) ?? "") : "")
  }

  function applySettings(settings: InterfaceSettings): void {
    root.dataset.vision = settings.vision
    root.dataset.contrast = settings.highContrast ? "high" : "normal"
  }
  const stopSettings = interfaceSettings().listen(applySettings)

  function enter(): void {
    if (!atFrontDoor || !loaded) {
      return
    }
    atFrontDoor = false
    openPage(null)
    layout()
    show(false)
    entering()
  }

  function show(next: boolean): void {
    if (atFrontDoor) {
      return
    }
    open = next
    root.hidden = !next
    hint.hidden = next
    pausedBanner.hidden = !held || open
    if (next) {
      layout()
      date()
      enterButton.focus()
    } else {
      openPage(null)
      document.querySelector<HTMLElement>("canvas")?.focus()
    }
  }

  // Capture, so the menu hears keys before the game does and can keep them from it while open.
  const onKey = (event: KeyboardEvent) => {
    if (open && page?.key?.(event)) {
      event.stopImmediatePropagation()
      return
    }
    if (event.code === "Escape" && !event.repeat) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (page) {
        openPage(null)
      } else if (!atFrontDoor) {
        show(!open)
      }
      return
    }
    if (event.code === "KeyP" && !event.repeat && !open) {
      event.preventDefault()
      held = !held
      pausedBanner.hidden = !held
      return
    }
    if (open) {
      // Up and down move along the list, as in a game's menu; Tab and Enter work as the browser makes them.
      const items = [...nav.querySelectorAll<HTMLButtonElement>(".ui-nav-item:not(:disabled)")]
      const at = items.findIndex((item) => item === document.activeElement)
      if (at >= 0 && (event.code === "ArrowDown" || event.code === "ArrowUp")) {
        event.preventDefault()
        items[(at + (event.code === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus()
      }
      event.stopImmediatePropagation()
    }
  }
  const onClose = () => openPage(null)
  window.addEventListener("keydown", onKey, { capture: true })
  pageClose.addEventListener("click", onClose)
  const clock = setInterval(() => {
    if (open) {
      date()
      page?.tick?.()
    }
  }, 1000)

  root.hidden = !open
  hint.hidden = open
  setText(enterNote, "Bringing up the battle")
  layout()
  if (open) {
    enterButton.focus()
  }

  return {
    get open() {
      return open
    },
    get paused() {
      return open || held
    },
    get atFrontDoor() {
      return atFrontDoor
    },
    show,
    progress(step, share) {
      if (!loaded) {
        setText(enterNote, step)
        enterBar.style.setProperty("--progress", Math.min(1, Math.max(0, share)).toFixed(3))
      }
    },
    ready() {
      loaded = true
      entry()
      page?.tick?.()
      if (atFrontDoor && document.activeElement === document.body) {
        enterButton.focus()
      }
    },
    attach(parts) {
      war = parts.war ?? war
      renderer = parts.renderer ?? renderer
      date()
    },
    entered,
    dispose() {
      window.removeEventListener("keydown", onKey, { capture: true })
      pageClose.removeEventListener("click", onClose)
      clearInterval(clock)
      stopSettings()
      for (const each of pages) {
        each.dispose?.()
      }
      delete document.body.dataset.frontDoor
      root.remove()
      hint.remove()
      pausedBanner.remove()
    }
  }
}
