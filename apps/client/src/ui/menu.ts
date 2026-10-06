import type { WarDay } from "@verdun/sim"
import { warDayAt } from "@verdun/sim/war-calendar"
import { getMixer } from "../audio/mixer.ts"
import { turnLabel, weekLabel } from "../environment/war-labels.ts"
import { BATTLE_WEEK, browserStore, localSchedule } from "../environment/war-schedule.ts"
import { h, setText } from "../hud/dom.ts"
import { type InterfaceSettings, interfaceSettings } from "../hud/interface-settings.ts"
import { modeSettings, multiplayerServer, type PlayMode, serverPlace } from "../settings/mode.ts"
import { type PlayerSide, sideSettings } from "../settings/side.ts"
import type { BattlePages } from "./battle-pages.ts"
import type { BattleParts } from "./battle.ts"
import { createCreditsPage } from "./credits.ts"
import { segmented } from "./fields.ts"
import { createFrontMapPage } from "./front/front-map.ts"
import { OPEN_SECTOR } from "./front/front.ts"
import { weekAtVerdun } from "./front/verdun-1916.ts"
import { keymap } from "./keymap.ts"
import { createLoadingScreen, verdunSketch } from "./loading.ts"
import { createOptionsPage } from "./options.ts"
import type { MenuPage } from "./page.ts"
// The menus share the HUD's type: Archivo for reading, Bodoni Moda for headings.
import "@fontsource-variable/archivo/wdth.css"
import "@fontsource-variable/bodoni-moda/opsz.css"
import "@fontsource-variable/bodoni-moda/opsz-italic.css"
import "./menu.css"

export interface Menu {
  /** Whether a menu is up: the front door, or the menu over the battle. Not the sector map or squad book alone. */
  readonly open: boolean
  /**
   * Whether the battle should stand still: at the front door, while the menu is open, or after P. Single-player only;
   * online, the battle carries on regardless. It runs under the loading screen, as the player goes up the line, and
   * the sector map and the squad book, opened by their keys, don't stop it.
   */
  readonly paused: boolean
  /** Whether the front door is up, before the player has gone into the line. */
  readonly atFrontDoor: boolean
  /** Opens or closes the menu over the battle. */
  show(open: boolean): void
  /** What the battle's loading is doing now, and how far along it is, 0 to 1. */
  progress(step: string, share: number): void
  /** The battle is ready and drawing: the loading screen gives way to it. */
  ready(): void
  /** Parts of the game the menus show once they exist: the war's calendar, the renderer, the battle. */
  attach(parts: {
    readonly war?: { readonly day: WarDay }
    readonly renderer?: string
    readonly battle?: BattleParts
  }): void
  /**
   * Settles when the player asks to join the battle, from the front door or the war map; at once without the front
   * door. Nothing of the battle loads before: until then, which battle they'll join isn't known.
   */
  readonly joining: Promise<void>
  /** Settles when the player is in the line and the battle shows, once the loading screen has given way to it. */
  readonly entered: Promise<void>
  /** Opens the menu over the battle at one of its pages: "options", "front", "sector"... */
  showPage(id: string): void
  /** The battle couldn't be brought up: says why, plainly, in place of everything else (S23). */
  fail(error: unknown): void
  dispose(): void
}

export interface MenuOptions {
  readonly development?: boolean
  /** Whether the game opens on the front door, or goes straight into the line. */
  readonly frontDoor?: boolean
  /** The build, for the footer: a commit, or "dev". */
  readonly build?: string
}

/** Where the player is: at the front door, waiting for the battle to come up, or in it. */
type Screen = "front-door" | "loading" | "battle"

/** The loading screen stays at least this long after the player goes in, in milliseconds: a beat to go up the line. */
const GOING_UP = 1100

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
 * The war as it stands now, from its calendar alone, for the front door before any battle has loaded: the same
 * schedule the battle's clock keeps to once it's up (environment/war-schedule.ts).
 */
function calendarWar(development: boolean): { readonly day: WarDay } {
  const schedule = localSchedule({
    week: BATTLE_WEEK,
    now: Date.now(),
    store: browserStore(),
    ...(development ? { search: new URLSearchParams(location.search) } : {})
  })
  return {
    get day() {
      return warDayAt(schedule, Date.now())
    }
  }
}

/**
 * The game's menus: the front door the game opens on (S13), the loading screen as the battle comes up (S6), and the
 * menu Esc opens over the battle (S1), with one list down the left and the pages it opens beside it: the war map, the
 * sector map, the squad book, the battle log, the options, the controls and the credits. The sector map (S4) and the
 * squad book (S5) also open on their own keys, full width, while the battle goes on.
 *
 * While a menu or page is up it takes the keyboard, so keys meant for it don't reach the game; key releases still do,
 * so nothing held when it opened stays stuck down.
 */
export function createMenu(
  parent: HTMLElement,
  { development = false, frontDoor = true, build = "dev" }: MenuOptions = {}
): Menu {
  // The war's date at the front door from its calendar, then from the battle's own clock once it's attached.
  let war: { readonly day: WarDay } | null = frontDoor ? calendarWar(development) : null
  let renderer: string | null = null
  let battle: BattleParts | null = null
  // The front door, or straight to the loading screen (?play, ?debug): nothing of the battle shows until it's drawing.
  let screen: Screen = frontDoor ? "front-door" : "loading"
  let open = frontDoor
  /** A page shown on its own over the running battle, by its key. */
  let alone = false
  let held = false
  let loaded = false
  let loadingSince = 0
  // Whether the player has asked to join, and so the battle is loading or loaded; whether they're waiting on it, under
  // the loading screen, for the map to choose a squad on.
  let requested = !frontDoor
  let waiting = false
  let requestJoin: () => void = () => undefined
  const joining = new Promise<void>((resolve) => {
    requestJoin = resolve
  })
  if (requested) {
    requestJoin()
  }
  let entering: () => void = () => undefined
  const entered = new Promise<void>((resolve) => {
    entering = resolve
  })

  // Browsers keep sound off until the player clicks or presses a key: say so, quietly, until they have (S23).
  const soundHint = h("div", "menu-sound", "Click or press a key for sound")
  soundHint.hidden = true
  const pausedBanner = h("div", "menu-paused", "Paused. P to carry on")
  pausedBanner.hidden = true
  const loading = createLoadingScreen(parent)

  // The list down the left.
  const kicker = h("div", "ui-kicker")
  const title = h("h1", "ui-title")
  const week = h("div", "ui-week")
  const history = h("p", "ui-history")
  const nav = h("nav", "ui-nav-list")
  nav.setAttribute("aria-label", "Menu")
  const footer = h("footer", "ui-footer", `Prototype, build ${build}`)
  // How to play, at the front door: multiplayer on the sector's server, or alone. Offered only where the game knows a
  // server; the battle comes up for the mode chosen, so a change once it's loading starts it again.
  const modeChoice = segmented<PlayMode>(
    [
      { value: "multiplayer", label: "Multiplayer" },
      { value: "single", label: "Single player" }
    ],
    modeSettings().current.mode,
    (mode) => {
      modeSettings().change({ mode })
      if (requested) {
        location.reload()
      } else {
        entry()
      }
    }
  )
  modeChoice.root.classList.add("ui-mode-choice")
  const modePicker = h("div", "ui-side", h("span", "ui-side-label", "Play"), modeChoice.root)
  const canPlayOnline = multiplayerServer(serverPlace()) !== null
  // The side to fight for, at the front door. The battle comes up for the side chosen, so a change once it's loading
  // starts it again.
  const sideChoice = segmented<PlayerSide>(
    [
      { value: "french", label: "French" },
      { value: "german", label: "German" }
    ],
    sideSettings().current.side,
    (side) => {
      sideSettings().change({ side })
      document.documentElement.dataset.army = side
      if (requested) {
        location.reload()
      } else {
        entry()
      }
    }
  )
  sideChoice.root.classList.add("ui-side-choice")
  const sidePicker = h("div", "ui-side", h("span", "ui-side-label", "Fight for"), sideChoice.root)
  const column = h(
    "div",
    "ui-column",
    h("header", "ui-masthead", kicker, title),
    h("div", "ui-date", week, history),
    modePicker,
    sidePicker,
    nav,
    footer
  )

  // The page beside it.
  const pageTitle = h("h2", "ui-page-title")
  const pageClose = h("button", "ui-page-close", "Back")
  pageClose.type = "button"
  const pageBody = h("div", "ui-page-body")
  const pagePanel = h("section", "ui-page", h("header", "ui-page-header", pageTitle, pageClose), pageBody)
  pagePanel.hidden = true

  // At the front door nothing of the battle has loaded: the front at Verdun is drawn behind the list instead.
  const backdrop = h("div", "ui-backdrop")
  backdrop.append(verdunSketch())
  const root = h("div", "ui", h("div", "ui-veil"), backdrop, column, pagePanel)
  root.setAttribute("role", "dialog")
  root.setAttribute("aria-modal", "true")
  root.setAttribute("aria-label", "Menu")
  parent.append(root, pausedBanner, soundHint)

  // The pages and acts that need the battle (the sector map, the squad book, the log's history, the join screen's
  // choices), loaded once the battle is up so the simulation stays out of the menus' own bundle.
  let made: BattlePages | null = null
  function observe(): void {
    const day = war?.day
    // The operation's report comes up by itself the moment it ends, over the battle.
    if (made?.observe(day?.phase === "turn" ? day.week : null) && screen === "battle") {
      if (alone) {
        closeAlone()
      }
      if (!open) {
        show(true)
      }
      openPage(made.report)
    }
  }

  // The pages, made once and kept.
  const reload = (play: boolean) => location.assign(reloadAddress(play))
  const putAway = () => (alone ? closeAlone() : show(false))
  const front = createFrontMapPage({
    war: () => war?.day ?? null,
    entry: () =>
      screen === "front-door"
        ? { label: `Join the battle at ${OPEN_SECTOR.name}`, enabled: true }
        : { label: "Resume", enabled: true },
    enter: () => (screen === "front-door" ? openJoin() : show(false))
  })
  /**
   * Asks to join: the battle starts loading now, under the loading screen, and the map to choose a squad on comes up
   * once it's ready and its squads are mustered.
   */
  function openJoin(): void {
    if (!requested) {
      requested = true
      requestJoin()
      entry()
    }
    if (made && loaded) {
      openPage(made.join)
    } else if (!waiting) {
      waiting = true
      loading.show()
    }
  }

  /** The battle is up and mustered: the loading screen gives way to the join map, for a player waiting on it. */
  function mustered(): void {
    if (!waiting || !made || !loaded) {
      return
    }
    waiting = false
    const join = made.join
    void loading.finish().then(() => openPage(join))
  }
  const options = createOptionsPage({
    development,
    renderer: () => renderer,
    reload: () => reload(screen !== "front-door")
  })
  const credits = createCreditsPage()
  const pages: MenuPage[] = [front, options, credits]
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
      pageClose.setAttribute("aria-label", alone ? "Back to the battle (Esc)" : "Back to the menu (Esc)")
      pageBody.replaceChildren(next.root)
      next.opened?.()
      pageClose.focus()
    } else {
      pageBody.replaceChildren()
      opener?.focus()
    }
  }

  // The way in at the front door, or back to the battle from the menu, with the loading under it while it comes up.
  const enterButton = h("button", "ui-nav-item ui-nav-item--primary")
  enterButton.type = "button"
  const enterLabel = h("span", "ui-nav-label")
  const enterNote = h("span", "ui-nav-note")
  const enterBar = h("span", "ui-progress", h("span", "ui-progress-fill"))
  enterButton.append(enterLabel, enterNote, enterBar)
  enterButton.dataset.page = "join"
  enterButton.addEventListener("click", () => {
    if (screen !== "front-door") {
      show(false)
    } else if (page?.id === "join") {
      openPage(null)
    } else {
      openJoin()
    }
  })

  function navItem(label: string, onClick: () => void, pageId?: string): HTMLButtonElement {
    const item = h("button", "ui-nav-item", h("span", "ui-nav-label", label))
    item.type = "button"
    if (pageId) {
      item.dataset.page = pageId
    }
    item.addEventListener("click", onClick)
    return item
  }

  const items = new Map<MenuPage, HTMLButtonElement>()
  /** A page's entry in the list, made the first time it's needed. */
  function itemOf(each: MenuPage): HTMLButtonElement {
    let item = items.get(each)
    if (!item) {
      item = navItem(each.title, () => openPage(page === each ? null : each), each.id)
      items.set(each, item)
    }
    return item
  }
  const restart = navItem("Restart", () => reload(true))
  const leave = navItem("Leave the battle", () => reload(false))

  function layout(): void {
    const door = screen === "front-door"
    root.dataset.mode = alone ? "alone" : screen
    document.body.dataset.screen = screen
    setText(kicker, door ? "The Western Front, 1914–1918" : "The battle waits")
    setText(title, door ? "Verdun" : OPEN_SECTOR.name)
    setText(enterLabel, door ? "Join the battle" : "Resume")
    sidePicker.hidden = !door
    modePicker.hidden = !door || !canPlayOnline
    // At the front door: join, the war map, the options, the credits. In battle: the battle's own pages first, then
    // the war map and the options; the credits stay at the front door.
    const shown = door
      ? [front, options, credits]
      : [...(made ? [made.sector, made.squad, made.log] : []), front, options]
    nav.replaceChildren(enterButton, ...shown.map(itemOf), ...(door ? [] : [restart, leave]))
    entry()
  }

  function entry(): void {
    const coming = screen === "front-door" && requested && !loaded
    enterButton.dataset.loading = String(coming)
    if (screen !== "front-door") {
      setText(enterNote, "Esc")
    } else if (!coming) {
      const side = sideSettings().current.side === "german" ? "the German line" : "the French line"
      setText(enterNote, `${OPEN_SECTOR.name}, ${side}`)
    }
  }

  /** The date block: the week, the turn and the next communiqué, where the year stands and what happened that week. */
  function date(): void {
    const day = war?.day
    if (!day) {
      return
    }
    // The week, and at the front door one line of what happened at Verdun that week: no more.
    setText(week, day.phase === "turn" ? weekLabel(day.week) : turnLabel(day))
    setText(history, day.phase === "turn" && screen === "front-door" ? (weekAtVerdun(day.week) ?? "") : "")
    loading.date(day)
  }

  function applySettings(settings: InterfaceSettings): void {
    root.dataset.vision = settings.vision
    root.dataset.contrast = settings.highContrast ? "high" : "normal"
  }
  const stopSettings = interfaceSettings().listen(applySettings)

  /**
   * Going into the line leading `squad`: the loading screen until the battle is ready, then the battle. Another squad
   * than the one held for the player is taken in its place; the battle steps under the loading screen, so it's theirs
   * by the time the screen gives way.
   */
  function enter(squad: number): void {
    if (screen !== "front-door") {
      return
    }
    made?.enlist(squad)
    openPage(null)
    open = false
    root.hidden = true
    screen = "loading"
    loadingSince = performance.now()
    layout()
    loading.show()
    if (loaded) {
      arrive()
    }
  }

  let arriving = false
  /** The loading screen gives way to the battle, after a beat if the player has only just gone in. */
  function arrive(): void {
    if (arriving) {
      return
    }
    arriving = true
    const wait = Math.max(0, GOING_UP - (performance.now() - loadingSince))
    setTimeout(() => {
      void loading.finish().then(() => {
        screen = "battle"
        layout()
        entering()
        document.querySelector<HTMLElement>("canvas")?.focus()
      })
    }, wait)
  }

  function show(next: boolean): void {
    if (screen !== "battle") {
      return
    }
    if (alone) {
      closeAlone()
    }
    open = next
    root.hidden = !next
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

  /** Shows a page on its own, full width, over the running battle: the sector map or the squad book, by its key. */
  function openAlone(next: MenuPage): void {
    if (screen !== "battle" || open) {
      return
    }
    alone = true
    root.hidden = false
    layout()
    openPage(next)
  }

  function closeAlone(): void {
    alone = false
    openPage(null)
    root.hidden = true
    layout()
    document.querySelector<HTMLElement>("canvas")?.focus()
  }

  /** The pages with keys of their own, once the battle's pages are loaded. */
  function pageForKey(action: string | null): MenuPage | undefined {
    if (action === "sector-map") {
      return made?.sector
    }
    return action === "squad-book" ? made?.squad : undefined
  }

  // Capture, so the menu hears keys before the game does and can keep them from it while open.
  const onKey = (event: KeyboardEvent) => {
    if (screen === "loading" || waiting) {
      event.stopImmediatePropagation()
      return
    }
    if ((open || alone) && page?.key?.(event)) {
      event.stopImmediatePropagation()
      return
    }
    const action = keymap().actionOf(event.code)
    const keyed = pageForKey(action)
    if (keyed && !event.repeat && screen === "battle" && !open) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (alone && page === keyed) {
        closeAlone()
      } else if (alone) {
        openPage(keyed)
      } else {
        openAlone(keyed)
      }
      return
    }
    if (event.code === "Escape" && !event.repeat) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (alone) {
        closeAlone()
      } else if (page) {
        openPage(null)
      } else if (screen === "battle") {
        show(!open)
      }
      return
    }
    if (action === "pause" && !event.repeat && !open && !alone) {
      event.preventDefault()
      event.stopImmediatePropagation()
      held = !held
      pausedBanner.hidden = !held
      return
    }
    if (open || alone) {
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
  const onClose = () => (alone ? closeAlone() : openPage(null))
  window.addEventListener("keydown", onKey, { capture: true })
  pageClose.addEventListener("click", onClose)
  const clock = setInterval(() => {
    soundHint.hidden = getMixer().context.state !== "suspended" || screen === "loading" || waiting
    if (screen === "battle") {
      observe()
    }
    if (open || alone) {
      date()
      page?.tick?.()
    }
  }, 1000)

  root.hidden = !open
  layout()
  date()
  if (screen === "loading") {
    loadingSince = performance.now() - GOING_UP
    loading.show()
  }
  if (open) {
    enterButton.focus()
  }

  return {
    get open() {
      return open
    },
    get paused() {
      return screen === "front-door" || open || held
    },
    get atFrontDoor() {
      return screen === "front-door"
    },
    show,
    progress(step, share) {
      if (!loaded) {
        setText(enterNote, step)
        enterBar.style.setProperty("--progress", Math.min(1, Math.max(0, share)).toFixed(3))
        loading.progress(step, share)
      }
    },
    ready() {
      loaded = true
      loading.progress("Ready", 1)
      entry()
      page?.tick?.()
      if (screen === "loading") {
        arrive()
      }
      mustered()
    },
    attach(parts) {
      war = parts.war ?? war
      renderer = parts.renderer ?? renderer
      if (parts.battle && parts.battle !== battle) {
        const up = parts.battle
        battle = up
        void import("./battle-pages.ts").then(({ createBattlePages }) => {
          made = createBattlePages(up, putAway, {
            start: (squad) => enter(squad),
            again: () => reload(true),
            frontDoor: () => reload(false)
          })
          if (open && screen !== "front-door") {
            layout()
          }
          mustered()
          page?.tick?.()
        })
      }
      loading.renderer(renderer)
      date()
    },
    joining,
    entered,
    showPage(id) {
      const wanted = [...pages, ...(made ? [made.sector, made.squad, made.log, made.report] : [])].find(
        (each) => each.id === id
      )
      if (!wanted) {
        return
      }
      if (alone) {
        closeAlone()
      }
      if (screen === "battle" && !open) {
        show(true)
      }
      openPage(wanted)
    },
    fail(error) {
      const unsupported = error instanceof Error && error.name === "UnsupportedBrowser"
      const failure = h(
        "div",
        "ui-failure",
        h("div", "ui-kicker", unsupported ? "This browser can't draw the battle" : "The battle couldn't be brought up"),
        h(
          "p",
          "ui-failure-text",
          unsupported
            ? "Verdun draws with WebGPU, or WebGL 2 where there's no WebGPU, and this browser offers neither. A recent Chrome, Edge, Firefox or Safari will do, with hardware acceleration switched on in its settings."
            : "Something went wrong while the battle was coming up. Reloading usually puts it right; if it happens again, the browser's console says what."
        ),
        h("p", "ui-failure-detail", error instanceof Error ? error.message : String(error)),
        h("button", "ui-button ui-button--primary ui-failure-reload", "Reload")
      )
      failure.setAttribute("role", "alert")
      failure.querySelector("button")?.addEventListener("click", () => location.reload())
      void loading.finish()
      open = true
      root.hidden = false
      root.dataset.mode = "failed"
      pagePanel.hidden = true
      column.replaceChildren(h("header", "ui-masthead", kicker, title), failure)
      setText(kicker, "The Western Front, 1914–1918")
      setText(title, "Verdun")
      document.body.dataset.screen = "failed"
    },
    dispose() {
      window.removeEventListener("keydown", onKey, { capture: true })
      pageClose.removeEventListener("click", onClose)
      clearInterval(clock)
      stopSettings()
      for (const each of pages) {
        each.dispose?.()
      }
      delete document.body.dataset.screen
      loading.dispose()
      root.remove()
      pausedBanner.remove()
      soundHint.remove()
    }
  }
}
