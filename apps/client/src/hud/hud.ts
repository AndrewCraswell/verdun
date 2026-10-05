import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import {
  enqueueCommand,
  type EntityId,
  isAlive,
  type SimEvent,
  type Simulation,
  type Squad,
  type WarDay
} from "@verdun/sim"
import { groundUnderPointer } from "../control/ground-pick.ts"
import type { HudContext, HudElement, HudElementFactory, HudZone } from "./element.ts"
import { browserHintStore } from "./hints.ts"
import { createHudModel, type HudModel, type HudState, type HudView } from "./hud-state.ts"
import { installIcons } from "./icons.ts"
import { type InterfaceSettings, interfaceSettings } from "./interface-settings.ts"
import { isOverviewKey } from "./keys.ts"
import { projectPoint, screenAngleBetween } from "./projection.ts"
import { HUD_ELEMENTS } from "./registry.ts"
// The HUD's type: Archivo, a grotesque after the 1890s' (weight and width axes), and Bodoni Moda, the Didone of
// French print in 1916. Both under the SIL Open Font License; listed in docs/assets/register.md.
import "@fontsource-variable/archivo/wdth.css"
import "@fontsource-variable/bodoni-moda/opsz.css"
import "@fontsource-variable/bodoni-moda/opsz-italic.css"
import "./tokens.css"
import "./hud.css"

export interface Hud {
  /** Feeds the HUD one simulation step's events. Call after every step. */
  record(events: readonly SimEvent[]): void
  /** Redraws the HUD from the simulation. Call once a frame; it works out its state ten times a second. */
  update(frameSeconds: number): void
  /** The state the HUD last drew, for inspecting it. */
  readonly state: HudState | null
  /** Swaps an element for another with the same id, in place: for trying a redesign in the running game. */
  swap(id: string, factory: HudElementFactory): void
  /** Applies the player's interface settings, and keeps them for next time. */
  configure(settings: InterfaceSettings): void
  readonly settings: InterfaceSettings
  dispose(): void
}

export interface HudOptions {
  /** The war's calendar, when the battle runs on it: the turn and the next communiqué, and a banner while it waits. */
  readonly war?: { readonly day: WarDay; readonly paused: boolean }
  /** The real time, for the countdown to the next communiqué. */
  readonly now?: () => number
  /** The battlefield's scene and camera, for marks on the ground and arrows that turn with the camera. */
  readonly view?: { readonly scene: Scene; readonly camera: ArcRotateCamera }
  /** Whether the player's side can see a soldier now: the fog of war's rule, for the war map's view of the enemy. */
  readonly seen?: (soldier: EntityId) => boolean
  /** The elements to draw: the registry's, unless a test or a tool wants others. */
  readonly elements?: readonly HudElementFactory[]
}

/** State redraws per second: often enough to feel live, rarely enough to cost next to nothing. */
const REDRAWS_PER_SECOND = 10
/** The camera's distance, in metres, over which the view turns into the war map's: from in among the men to above them. */
const WAR_MAP_VIEW = { from: 150, to: 230 } as const
/** A press of the overview key shorter than this, in milliseconds, keeps the overview up until the next press. */
const TAP = 250

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

const ZONES: readonly Exclude<HudZone, "none">[] = [
  "screen",
  "world",
  "top-centre",
  "top-right",
  "bottom-left",
  "bottom-centre",
  "bottom-right",
  "centre"
]

/**
 * The heads-up display over the battlefield, built from the elements in ./registry.ts. It works out one state from the
 * simulation (./hud-state.ts) and hands it to every element; elements that follow the camera are also given each frame
 * after the battlefield is drawn, when the camera's matrices are this frame's.
 */
export function createHud(
  parent: HTMLElement,
  sim: Simulation,
  squad: Squad,
  tickRate: number,
  { war, now = Date.now, view, seen, elements = HUD_ELEMENTS }: HudOptions = {}
): Hud {
  const root = document.createElement("div")
  root.className = "hud"
  installIcons(root)
  for (const corner of ["bottom-left", "top-right", "bottom-right", "top-centre"]) {
    const shade = document.createElement("div")
    shade.className = `hud-shade hud-shade--${corner}`
    root.append(shade)
  }
  const zones = new Map<HudZone, HTMLElement>()
  for (const zone of ZONES) {
    const container = document.createElement("div")
    container.className =
      zone === "screen" || zone === "world" ? `hud-layer hud-layer--${zone}` : `hud-zone hud-zone--${zone}`
    zones.set(zone, container)
    root.append(container)
  }
  parent.append(root)

  const hub = interfaceSettings()
  let settings = hub.current
  const seconds = () => performance.now() / 1000
  const model: HudModel = createHudModel(sim, squad, tickRate, {
    ...(war ? { war } : {}),
    hintStore: browserHintStore(),
    started: seconds()
  })
  const canvas = view?.scene.getEngine().getRenderingCanvas() ?? document.querySelector("canvas")

  const project: HudContext["project"] = (x, y, z) => {
    if (!view) {
      return null
    }
    return projectPoint(view.scene.getTransformMatrix().m, x, y, z, innerWidth, innerHeight)
  }

  const context: HudContext = {
    project,
    screenAngle(x, z, towardX, towardZ) {
      const length = Math.hypot(towardX, towardZ)
      if (length < 1e-6) {
        return 0
      }
      const y = heightAt(sim.map, x, z)
      const from = project(x, y, z)
      const to = project(x + (towardX / length) * 10, y, z + (towardZ / length) * 10)
      if (from && to) {
        return screenAngleBetween(from, to)
      }
      // Without a view: north up the screen.
      return Math.atan2(towardX, towardZ)
    },
    heightAt: (x, z) => heightAt(sim.map, x, z),
    cameraDistance: () => view?.camera.radius ?? 0,
    pointerGround: () => (view ? groundUnderPointer(view.scene, sim.map) : null),
    seen: (soldier) => seen?.(soldier) ?? true,
    positionOf: (soldier) => ({ x: sim.soldiers.position.x[soldier], z: sim.soldiers.position.z[soldier] }),
    takeSoldier(soldier) {
      if (squad.members.includes(soldier) && isAlive(sim, soldier)) {
        enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier })
      }
    },
    canvas: canvas instanceof HTMLCanvasElement ? canvas : null,
    sim,
    squad
  }

  let built: HudElement[] = []

  function mount(element: HudElement, before?: Node | null): void {
    if (element.zone !== "none" && element.root) {
      element.root.dataset.hudElement = element.id
      const zone = zones.get(element.zone)
      if (before && before.parentNode === zone) {
        zone?.insertBefore(element.root, before)
      } else {
        zone?.append(element.root)
      }
    }
  }

  built = elements.map((factory) => {
    const element = factory(context)
    mount(element)
    return element
  })

  let state: HudState | null = null
  let sinceRedraw = Infinity
  // The overview: up while its key is held, or kept up by a tap until the next.
  let held = false
  let pinned = false
  let pressedAt = 0

  function looking(): HudView {
    return {
      overview: held || pinned,
      tactical: smoothstep(WAR_MAP_VIEW.from, WAR_MAP_VIEW.to, context.cameraDistance())
    }
  }

  function redraw(): void {
    const current = looking()
    if (current.overview) {
      root.dataset.overview = ""
    } else {
      delete root.dataset.overview
    }
    const next = model.read(seconds(), now(), current)
    state = next
    for (const element of built) {
      element.update(next)
    }
    // Hidden until every element has drawn once, then faded in with the battle.
    root.dataset.ready = ""
  }

  const afterRender = view?.scene.onAfterRenderObservable.add(() => {
    if (!state) {
      return
    }
    const current = state
    const time = seconds()
    for (const element of built) {
      element.frame?.(current, time)
    }
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isOverviewKey(event.code) || event.repeat) {
      return
    }
    held = true
    pressedAt = performance.now()
    redraw()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (!isOverviewKey(event.code) || !held) {
      return
    }
    held = false
    if (performance.now() - pressedAt < TAP) {
      pinned = !pinned
    }
    redraw()
  }
  const onBlur = () => {
    held = false
  }
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("blur", onBlur)
  function apply(next: InterfaceSettings): void {
    settings = next
    root.style.setProperty("--hud-scale", String(next.scale))
    root.style.setProperty("--hud-fx", String(next.effects))
    root.style.setProperty("--hud-backing", String(next.backing))
    if (next.vision === "default") {
      delete root.dataset.vision
    } else {
      root.dataset.vision = next.vision
    }
    if (next.highContrast) {
      root.dataset.contrast = "high"
    } else {
      delete root.dataset.contrast
    }
    model.hints.enabled = next.hints
  }
  // The menu changes the settings through the same hub: each change shows at once.
  const unlisten = hub.listen(apply)

  return {
    record(events) {
      model.record(events)
    },
    update(frameSeconds) {
      sinceRedraw += frameSeconds
      if (sinceRedraw >= 1 / REDRAWS_PER_SECOND) {
        sinceRedraw = 0
        redraw()
      }
    },
    get state() {
      return state
    },
    swap(id, factory) {
      const index = built.findIndex((element) => element.id === id)
      const old = built[index]
      const replacement = factory(context)
      const anchor = old?.root ?? null
      mount(replacement, anchor)
      old?.dispose?.()
      old?.root?.remove()
      if (index >= 0) {
        built[index] = replacement
      } else {
        built.push(replacement)
      }
      if (state) {
        replacement.update(state)
      }
    },
    configure(next) {
      hub.change(next)
    },
    get settings() {
      return settings
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      unlisten()
      if (afterRender) {
        view?.scene.onAfterRenderObservable.remove(afterRender)
      }
      for (const element of built) {
        element.dispose?.()
      }
      root.remove()
    }
  }
}
