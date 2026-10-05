import { VOLUME_CHANNELS, type VolumeChannel, playerVolume } from "../audio/volume.ts"
import { browserStore } from "../environment/war-schedule.ts"
import { h } from "../hud/dom.ts"
import { resetHints } from "../hud/hints.ts"
import { type ColourVision, interfaceSettings } from "../hud/interface-settings.ts"
import { displaySettings } from "../settings/display.ts"
import { type GraphicsQuality, graphicsQuality, saveGraphicsQuality } from "../settings/graphics.ts"
import { button, percent, segmented, settingRow, slider, toggle } from "./fields.ts"
import type { MenuPage } from "./page.ts"

export interface OptionsContext {
  /** The renderer drawing the battle now, "WebGPU" or "WebGL", once there is one. */
  readonly renderer: () => string | null
  /** Reloads the game, for settings that take a reload. */
  readonly reload: () => void
}

const VOLUME_LABELS: Readonly<Record<VolumeChannel, { readonly label: string; readonly note: string | null }>> = {
  master: { label: "Master", note: null },
  effects: { label: "Battle", note: "Rifles, machine guns, shells and grenades" },
  voices: { label: "Voices", note: "Shouted orders and alarms" },
  ambience: { label: "Ambience", note: "Wind, rain and the distant guns" },
  music: { label: "Music", note: null }
}

const VISIONS: readonly { readonly value: ColourVision; readonly label: string }[] = [
  { value: "default", label: "Default" },
  { value: "deuteranopia", label: "Deuteranopia" },
  { value: "protanopia", label: "Protanopia" },
  { value: "tritanopia", label: "Tritanopia" }
]

/** How far left and right move along a row of tabs. */
const ARROW_STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 }

type Tab = "display" | "sound" | "interface" | "accessibility"

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: "display", label: "Display" },
  { id: "sound", label: "Sound" },
  { id: "interface", label: "Interface" },
  { id: "accessibility", label: "Accessibility" }
]

function section(title: string, ...rows: HTMLElement[]): HTMLElement {
  return h("section", "ui-settings-section", h("h3", "ui-settings-heading", title), ...rows)
}

/** The display settings: graphics, renderer, scale, full screen. Those that need a reload offer one. */
function displayTab({ renderer, reload }: OptionsContext): { root: HTMLElement; opened(): void; dispose(): void } {
  const store = browserStore()
  const loadedQuality = graphicsQuality(store)
  const display = displaySettings()
  const loadedRenderer = display.current.renderer
  const pending = h("div", "ui-pending")
  pending.setAttribute("role", "status")
  const reloadButton = button("Reload now", reload, "ui-button ui-button--primary")
  const pendingText = h("span", "ui-pending-text")
  pending.append(pendingText, reloadButton)
  const showPending = () => {
    const changed: string[] = []
    if (graphicsQuality(store) !== loadedQuality) {
      changed.push("graphics")
    }
    if (display.current.renderer !== loadedRenderer) {
      changed.push("the renderer")
    }
    pending.hidden = changed.length === 0
    pendingText.textContent = `The change to ${changed.join(" and ")} takes effect when the game reloads.`
  }

  const quality = segmented<GraphicsQuality>(
    [
      { value: "low", label: "Low" },
      { value: "high", label: "High" }
    ],
    loadedQuality,
    (value) => {
      saveGraphicsQuality(store, value)
      showPending()
    }
  )
  const drawing = h("span", "ui-setting-now")
  const rendererChoice = segmented(
    [
      { value: "automatic", label: "Automatic" },
      { value: "webgl", label: "WebGL" }
    ],
    loadedRenderer,
    (value) => {
      display.change({ renderer: value })
      showPending()
    }
  )
  const scale = slider({ min: 0.5, max: 1, step: 0.05 }, display.current.renderScale, percent, (value) =>
    display.change({ renderScale: value })
  )
  const fullScreen = toggle(document.fullscreenElement !== null, (on) => {
    const request = on ? document.documentElement.requestFullscreen?.() : document.exitFullscreen?.()
    request?.catch(() => fullScreen.set(document.fullscreenElement !== null))
  })
  const onFullScreen = () => fullScreen.set(document.fullscreenElement !== null)
  document.addEventListener("fullscreenchange", onFullScreen)

  const rendererRow = settingRow(
    "Renderer",
    "Automatic draws with WebGPU where the browser has it. WebGL is older, and steadier on some cards.",
    rendererChoice.root
  )
  rendererRow.querySelector(".ui-setting-text")?.append(drawing)
  const root = h(
    "div",
    "ui-settings",
    pending,
    section(
      "Picture",
      settingRow(
        "Graphics",
        "Low leaves out the costliest weather and battle effects, for modest graphics cards.",
        quality.root
      ),
      rendererRow,
      settingRow(
        "Render scale",
        "Draw the battle at less than the screen's resolution: faster, and softer.",
        scale.root
      ),
      settingRow("Full screen", null, fullScreen.root)
    )
  )
  return {
    root,
    opened() {
      const now = renderer()
      drawing.textContent = now ? `Drawing with ${now} now.` : ""
      onFullScreen()
      showPending()
    },
    dispose() {
      document.removeEventListener("fullscreenchange", onFullScreen)
    }
  }
}

function soundTab(): HTMLElement {
  const volume = playerVolume()
  const rows = VOLUME_CHANNELS.map((channel) => {
    const { label, note } = VOLUME_LABELS[channel]
    const control = slider({ min: 0, max: 1, step: 0.05 }, volume.level(channel), percent, (value) =>
      volume.set(channel, value)
    )
    return settingRow(label, note, control.root)
  })
  return h("div", "ui-settings", section("Volume", ...rows))
}

function interfaceTab(): { root: HTMLElement; sync(): void } {
  const hub = interfaceSettings()
  const scale = slider({ min: 0.75, max: 2, step: 0.05 }, hub.current.scale, percent, (value) =>
    hub.change({ scale: value })
  )
  const backing = slider({ min: 0.5, max: 1.5, step: 0.05 }, hub.current.backing, percent, (value) =>
    hub.change({ backing: value })
  )
  const hints = toggle(hub.current.hints, (on) => hub.change({ hints: on }))
  const again = button("Show the prompts again", () => {
    resetHints()
    hub.change({ hints: true })
    again.textContent = "Prompts start over"
  })
  return {
    root: h(
      "div",
      "ui-settings",
      section(
        "Heads-up display",
        settingRow("Interface scale", "The size of everything on the battle's screen.", scale.root),
        settingRow(
          "Backing",
          "How dark the plates behind the text are, for reading over snow and flares.",
          backing.root
        )
      ),
      section(
        "Prompts",
        settingRow("First-session prompts", "Short lines that teach the controls as you play.", hints.root),
        settingRow("Start them over", "From the first prompt, as on your first visit.", again)
      )
    ),
    sync() {
      scale.set(hub.current.scale)
      backing.set(hub.current.backing)
      hints.set(hub.current.hints)
      again.textContent = "Show the prompts again"
    }
  }
}

function accessibilityTab(): { root: HTMLElement; sync(): void } {
  const hub = interfaceSettings()
  const vision = segmented(VISIONS, hub.current.vision, (value) => hub.change({ vision: value }))
  const contrast = toggle(hub.current.highContrast, (on) => hub.change({ highContrast: on }))
  const effects = slider(
    { min: 0, max: 1, step: 0.05 },
    hub.current.effects,
    (value) => (value === 0 ? "Off" : percent(value)),
    (value) => hub.change({ effects: value })
  )
  return {
    root: h(
      "div",
      "ui-settings",
      section(
        "Colour and contrast",
        settingRow(
          "Colour vision",
          "Moves the colours of the sides and of danger apart from those your eyes confuse. Every state has a shape and a word as well.",
          vision.root
        ),
        settingRow("High contrast", "Solid plates, brighter text, stronger lines.", contrast.root)
      ),
      section(
        "Screen effects",
        settingRow(
          "Strength",
          "The darkening under fire, the gas mask's lenses, the blur of a close burst.",
          effects.root
        )
      )
    ),
    sync() {
      vision.set(hub.current.vision)
      contrast.set(hub.current.highContrast)
      effects.set(hub.current.effects)
    }
  }
}

/** The options screen (S3): display, sound, interface and accessibility, each applied at once and kept. */
export function createOptionsPage(context: OptionsContext): MenuPage {
  const display = displayTab(context)
  const interfacePane = interfaceTab()
  const accessibilityPane = accessibilityTab()
  const panes: Readonly<Record<Tab, HTMLElement>> = {
    display: display.root,
    sound: soundTab(),
    interface: interfacePane.root,
    accessibility: accessibilityPane.root
  }

  const tabList = h("div", "ui-tabs")
  tabList.setAttribute("role", "tablist")
  const body = h("div", "ui-tab-panel")
  body.setAttribute("role", "tabpanel")
  let current: Tab = "display"
  const tabs = TABS.map(({ id, label }) => {
    const tab = button(label, () => select(id), "ui-tab")
    tab.setAttribute("role", "tab")
    tab.id = `options-tab-${id}`
    tabList.append(tab)
    return { id, tab }
  })
  function select(id: Tab): void {
    current = id
    for (const each of tabs) {
      each.tab.setAttribute("aria-selected", String(each.id === id))
      each.tab.tabIndex = each.id === id ? 0 : -1
    }
    body.setAttribute("aria-labelledby", `options-tab-${id}`)
    body.replaceChildren(panes[id])
    if (id === "display") {
      display.opened()
    }
  }
  // Left and right move between the tabs, as a tab list does.
  tabList.addEventListener("keydown", (event) => {
    const step = ARROW_STEPS[event.key] ?? 0
    if (step !== 0) {
      const index = TABS.findIndex((tab) => tab.id === current)
      const next = TABS[(index + step + TABS.length) % TABS.length]!
      select(next.id)
      tabs.find((each) => each.id === next.id)?.tab.focus()
      event.preventDefault()
    }
  })
  select("display")

  return {
    id: "options",
    title: "Options",
    root: h("div", "ui-options", tabList, body),
    opened() {
      interfacePane.sync()
      accessibilityPane.sync()
      select(current)
    },
    dispose: display.dispose
  }
}
