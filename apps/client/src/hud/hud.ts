import type { SimEvent, Simulation, Squad } from "@verdun/sim"
import { type BattleLog, createBattleLog, hudModel } from "./hud-model.ts"
import "./hud.css"

export interface Hud {
  /** Feeds the battle log one simulation step's events. Call after every step. */
  record(events: readonly SimEvent[]): void
  /** Redraws the HUD from the simulation. Call once a frame; it redraws a few times a second. */
  update(frameSeconds: number): void
  dispose(): void
}

/** Redraws per second: often enough to feel live, rarely enough to cost nothing. */
const REDRAWS_PER_SECOND = 4

function line(text: string, className?: string): HTMLDivElement {
  const element = document.createElement("div")
  element.textContent = text
  if (className) {
    element.className = className
  }
  return element
}

function panel(className: string): HTMLDivElement {
  const element = document.createElement("div")
  element.className = `hud-panel ${className}`
  return element
}

/**
 * The heads-up display, laid over the battlefield: the player's soldier and squad bottom left, the sector's objectives
 * and both sides' losses top right, and the battle log at the top.
 */
export function createHud(parent: HTMLElement, sim: Simulation, squad: Squad, tickRate: number): Hud {
  const root = document.createElement("div")
  root.className = "hud"
  const soldierPanel = panel("hud-soldier")
  const sectorPanel = panel("hud-sector")
  const logPanel = panel("hud-log")
  root.append(soldierPanel, sectorPanel, logPanel)
  parent.append(root)
  const log: BattleLog = createBattleLog(sim, squad, tickRate)
  let sinceRedraw = Infinity

  function redraw(): void {
    const model = hudModel(sim, squad)
    const { soldier } = model
    soldierPanel.replaceChildren(
      line(model.squad, "hud-title"),
      line(soldier.stance),
      ...(soldier.mask ? [line(soldier.mask, "hud-alarm")] : []),
      ...(soldier.pinned ? [line("Pinned down", "hud-alarm")] : []),
      ...(soldier.wounded ? [line("Wounded", "hud-alarm")] : []),
      ...(soldier.grenades ? [line(soldier.grenades, "hud-muted")] : [])
    )
    sectorPanel.replaceChildren(
      line("Sector", "hud-title"),
      ...model.objectives.map((objective) =>
        line(
          `${objective.name}: ${objective.holder}${objective.contested ? ", contested" : ""}`,
          objective.contested ? "hud-alarm" : undefined
        )
      ),
      ...model.losses.map((loss) => line(`${loss.side}: ${loss.killed} killed, ${loss.captured} captured`, "hud-muted"))
    )
    logPanel.replaceChildren(
      ...log.messages.map((message) => line(message.text, message.alarm ? "hud-alarm" : undefined))
    )
  }

  return {
    record(events) {
      log.record(events)
    },
    update(frameSeconds) {
      sinceRedraw += frameSeconds
      if (sinceRedraw >= 1 / REDRAWS_PER_SECOND) {
        sinceRedraw = 0
        redraw()
      }
    },
    dispose() {
      root.remove()
    }
  }
}
