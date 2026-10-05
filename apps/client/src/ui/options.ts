import { VOLUME_CHANNELS, type VolumeChannel, playerVolume } from "../audio/volume.ts"
import { h } from "../hud/dom.ts"
import {
  type ColourVision,
  HUD_ZONES,
  type HudZoneSetting,
  interfaceSettings,
  PRESS_ACTIONS,
  type PressAction,
  type PressMode,
  type ZoneShowing
} from "../hud/interface-settings.ts"
import { cameraSettings } from "../settings/camera.ts"
import { displaySettings, FRAME_CAPS } from "../settings/display.ts"
import { type GraphicsQuality, graphicsQuality, saveGraphicsQuality } from "../settings/graphics.ts"
import { type CaptionMode, playSettings } from "../settings/play.ts"
import { browserStorage } from "../settings/store.ts"
import { createControlsPage } from "./controls.ts"
import { button, percent, segmented, settingRow, slider, toggle } from "./fields.ts"
import type { MenuPage } from "./page.ts"

export interface OptionsContext {
  /** Development builds also list the development keys. */
  readonly development: boolean
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

type Tab = "display" | "sound" | "controls" | "keys" | "interface" | "accessibility"

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: "display", label: "Display" },
  { id: "sound", label: "Sound" },
  { id: "controls", label: "Controls" },
  { id: "keys", label: "Keys" },
  { id: "interface", label: "Interface" },
  { id: "accessibility", label: "Accessibility" }
]

const ZONE_LABELS: Readonly<Record<HudZoneSetting, { readonly label: string; readonly note: string }>> = {
  soldier: { label: "Soldier card", note: "Your man, his state and what acts on him" },
  roster: { label: "Squad roster", note: "The eight men in a row" },
  sector: { label: "Sector panels", note: "The clock, the objectives and the strength" },
  log: { label: "Battle log", note: "What has just happened" },
  fire: { label: "Artillery board", note: "The calls and missions in progress" }
}

const ZONE_CHOICES: readonly { readonly value: ZoneShowing; readonly label: string }[] = [
  { value: "always", label: "Always" },
  { value: "changes", label: "On change" },
  { value: "hidden", label: "Hidden" }
]

const PRESS_LABELS: Readonly<Record<PressAction, { readonly label: string; readonly note: string }>> = {
  run: { label: "Run", note: "Hold to run, or press to start and again to stop" },
  crouch: { label: "Crouch", note: "Hold to stay down, or press to go down and again to stand" },
  prone: { label: "Lie down", note: "Hold to stay down, or press to go down and again to get up" },
  grenade: { label: "Grenade", note: "Hold to aim and let go to throw, or press to aim and again to throw" }
}

const PRESS_CHOICES: readonly { readonly value: PressMode; readonly label: string }[] = [
  { value: "hold", label: "Hold" },
  { value: "toggle", label: "Toggle" }
]

const CAP_CHOICES: readonly { readonly value: string; readonly label: string }[] = FRAME_CAPS.map((cap) => ({
  value: String(cap),
  label: cap === 0 ? "Off" : String(cap)
}))

function section(title: string, ...rows: HTMLElement[]): HTMLElement {
  return h("section", "ui-settings-section", h("h3", "ui-settings-heading", title), ...rows)
}

/** The display settings: graphics, renderer, scale, full screen. Those that need a reload offer one. */
function displayTab({ renderer, reload }: OptionsContext): { root: HTMLElement; opened(): void; dispose(): void } {
  const store = browserStorage()
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
  const cap = segmented(CAP_CHOICES, String(display.current.frameCap), (value) =>
    display.change({ frameCap: FRAME_CAPS.find((each) => String(each) === value) ?? 0 })
  )
  // A night trench to judge it by: the mark in the dark should be just visible, the sky not washed out.
  const test = h("div", "ui-brightness-test", h("span", "ui-brightness-mark"), h("span", "ui-brightness-sky"))
  test.setAttribute("aria-hidden", "true")
  const showTest = (value: number) => test.style.setProperty("--brightness", value.toFixed(2))
  showTest(display.current.brightness)
  const brightness = slider({ min: 0.6, max: 1.6, step: 0.05 }, display.current.brightness, percent, (value) => {
    display.change({ brightness: value })
    showTest(value)
  })
  const brightnessControl = h("div", "ui-brightness", test, brightness.root)
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
      settingRow(
        "Frame-rate cap",
        "Draw no more frames a second than this: cooler, quieter, and kinder to a laptop's battery.",
        cap.root
      ),
      settingRow(
        "Brightness",
        "Nights are dark. Set it so the mark in the trench is just visible, and the sky above it isn't white.",
        brightnessControl
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
  const play = playSettings()
  const captions = segmented<CaptionMode>(
    [
      { value: "off", label: "Off" },
      { value: "voices", label: "What matters" },
      { value: "all", label: "Everything" }
    ],
    play.current.captions,
    (value) => play.change({ captions: value })
  )
  return h(
    "div",
    "ui-settings",
    section("Volume", ...rows),
    section(
      "Captions",
      settingRow(
        "Captions",
        "Short lines for what's shouted, in English, with an arrow for where. What matters: gas, grenades, take cover, your squad's orders. Everything adds the rest, whistles and shells coming in.",
        captions.root
      )
    )
  )
}

/** The controls: hold or toggle for the held actions, and the camera's panning and dragging. Keys have their own page. */
function controlsTab(): { root: HTMLElement; sync(): void } {
  const hub = interfaceSettings()
  const camera = cameraSettings()
  const presses = PRESS_ACTIONS.map((action) => {
    const choice = segmented(PRESS_CHOICES, hub.current.presses[action], (value) =>
      hub.change({ presses: { ...hub.current.presses, [action]: value } })
    )
    return { action, choice, row: settingRow(PRESS_LABELS[action].label, PRESS_LABELS[action].note, choice.root) }
  })
  const edge = toggle(camera.current.edgePan, (on) => camera.change({ edgePan: on }))
  const speed = slider({ min: 0.5, max: 2, step: 0.1 }, camera.current.panSpeed, percent, (value) =>
    camera.change({ panSpeed: value })
  )
  const invert = toggle(camera.current.invertDrag, (on) => camera.change({ invertDrag: on }))
  const play = playSettings()
  const confirmFire = toggle(play.current.confirmSectorFire, (on) => play.change({ confirmSectorFire: on }))
  return {
    root: h(
      "div",
      "ui-settings",
      section("Hold or toggle", ...presses.map((each) => each.row)),
      section(
        "Camera",
        settingRow("Edge panning", "The pointer resting at a screen edge pans the view.", edge.root),
        settingRow("Pan speed", "Arrow keys and screen edges.", speed.root),
        settingRow("Invert drag", "Middle-drag turns and tilts the other way.", invert.root)
      ),
      section(
        "Orders",
        settingRow(
          "Confirm sector-wide fire",
          "The bombardment and the whistle fire along the whole front: ask for a second press, so a slip can't fire them.",
          confirmFire.root
        )
      )
    ),
    sync() {
      for (const { action, choice } of presses) {
        choice.set(hub.current.presses[action])
      }
      edge.set(camera.current.edgePan)
      confirmFire.set(play.current.confirmSectorFire)
      speed.set(camera.current.panSpeed)
      invert.set(camera.current.invertDrag)
    }
  }
}

function interfaceTab(): { root: HTMLElement; sync(): void } {
  const hub = interfaceSettings()
  const zones = HUD_ZONES.map((zone) => {
    const choice = segmented(ZONE_CHOICES, hub.current.zones[zone], (value) =>
      hub.change({ zones: { ...hub.current.zones, [zone]: value } })
    )
    return { zone, choice, row: settingRow(ZONE_LABELS[zone].label, ZONE_LABELS[zone].note, choice.root) }
  })
  const clock = segmented<"24" | "12">(
    [
      { value: "24", label: "24-hour" },
      { value: "12", label: "12-hour" }
    ],
    hub.current.clock,
    (value) => hub.change({ clock: value })
  )
  const markers = slider({ min: 0.75, max: 2, step: 0.05 }, hub.current.markers, percent, (value) =>
    hub.change({ markers: value })
  )
  const scale = slider({ min: 0.75, max: 2, step: 0.05 }, hub.current.scale, percent, (value) =>
    hub.change({ scale: value })
  )
  const backing = slider({ min: 0.5, max: 1.5, step: 0.05 }, hub.current.backing, percent, (value) =>
    hub.change({ backing: value })
  )
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
        ),
        settingRow("Marks and pointer", "The size of the marks on the ground and of the aim pointer.", markers.root),
        settingRow("Clock", "The army kept the 24-hour clock.", clock.root)
      ),
      section("Each part of the screen", ...zones.map((each) => each.row))
    ),
    sync() {
      scale.set(hub.current.scale)
      backing.set(hub.current.backing)
      markers.set(hub.current.markers)
      clock.set(hub.current.clock)
      for (const { zone, choice } of zones) {
        choice.set(hub.current.zones[zone])
      }
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

/** The options screen (S3): display, sound, controls, interface and accessibility, each applied at once and kept. */
export function createOptionsPage(context: OptionsContext): MenuPage {
  const display = displayTab(context)
  const controlsPane = controlsTab()
  // The keys, every one and where it's bound, rebindable: a tab of their own.
  const keys = createControlsPage({ development: context.development })
  const interfacePane = interfaceTab()
  const accessibilityPane = accessibilityTab()
  const panes: Readonly<Record<Tab, HTMLElement>> = {
    display: display.root,
    sound: soundTab(),
    controls: controlsPane.root,
    keys: keys.root,
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
    if (current === "keys" && id !== "keys") {
      keys.closed?.()
    }
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
    if (id === "keys") {
      keys.opened?.()
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
      controlsPane.sync()
      interfacePane.sync()
      accessibilityPane.sync()
      select(current)
    },
    closed() {
      keys.closed?.()
    },
    // A key pressed while choosing a new one for an action belongs to the keys' tab.
    key: (event) => current === "keys" && (keys.key?.(event) ?? false),
    dispose() {
      display.dispose()
      keys.dispose?.()
    }
  }
}
