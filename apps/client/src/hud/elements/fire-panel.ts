import { Shell } from "@verdun/sim"
import { h, keyCap, setData, setText, setVar, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import { type CallId, type CallView, countdownWord, type MissionKind, type MissionView } from "../fire-support.ts"
import { clockSeconds } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName, setIcon } from "../icons.ts"
import "./fire-panel.css"

/**
 * H10: the guns. The four calls on their keys, each with the shells it draws on and whether it would fire now; the
 * missions in progress above them, each counting down to its first rounds, its end or the barrage's next lift; and the
 * side's shells left by kind. Bottom right.
 */

const CALL_ICONS: Readonly<Record<CallId, IconName>> = {
  bombard: "bombard",
  fire: "fire-mission",
  gas: "gas",
  whistle: "whistle"
}

/** Each call's word on its tile; the panel's note gives it in full. */
const CALL_WORDS: Readonly<Record<CallId, string>> = {
  bombard: "Bombard",
  fire: "Fire",
  gas: "Gas",
  whistle: "Whistle"
}

/** The shell each call's count shows: what runs out first for it. */
const CALL_SHELLS: Readonly<Record<CallId, Shell>> = {
  bombard: Shell.HeavyHighExplosive,
  fire: Shell.FieldHighExplosive,
  gas: Shell.FieldGas,
  whistle: Shell.FieldHighExplosive
}

const MISSION_ICONS: Readonly<Record<MissionKind, IconName>> = {
  bombardment: "bombard",
  creeping: "creep",
  gas: "gas-shoot",
  fire: "fire-mission"
}

/** "7,420" up to ten thousand, "12k" past it. */
function rounds(count: number): string {
  return count >= 10_000 ? `${Math.round(count / 1000)}k` : count.toLocaleString("en-GB")
}

interface Tile {
  readonly root: HTMLElement
  readonly stock: HTMLElement
  call: CallView | null
}

interface Row {
  readonly root: HTMLLIElement
  readonly icon: SVGSVGElement
  readonly label: HTMLElement
  readonly place: HTMLElement
  readonly when: HTMLElement
  readonly time: HTMLElement
  readonly bar: HTMLElement
}

export const firePanel: HudElementFactory = () => {
  const missions = h("ol", "fp-missions")
  const sos = h("span", "fp-sos", icon("rocket", "fp-sos__icon"), "SOS barrage called")
  const calls = h("div", "fp-calls")
  const note = h("div", "fp-note")
  const shells = h("div", "fp-shells")
  const board = h(
    "div",
    "fp-board hud-plate",
    h("header", "fp-head", h("span", "hud-label hud-label--brass", "Artillery"), sos),
    calls,
    note,
    shells
  )
  const root = h("section", "fire-panel", missions, board)
  root.setAttribute("aria-label", "Artillery")
  const tiles = new Map<CallId, Tile>()
  const rows = new Map<number, Row>()
  const stocks = new Map<Shell, { readonly root: HTMLElement; readonly left: HTMLElement; readonly bar: HTMLElement }>()
  let hovered: CallId | null = null
  let fallbackNote = ""

  function tileFor(call: CallView): Tile {
    const existing = tiles.get(call.id)
    if (existing) {
      return existing
    }
    const stock = h("span", "fp-call__stock")
    const root = h(
      "div",
      "fp-call",
      keyCap(call.key),
      icon(CALL_ICONS[call.id], "fp-call__icon"),
      h("span", "fp-call__label", CALL_WORDS[call.id]),
      stock
    )
    const tile: Tile = { root, stock, call: null }
    root.addEventListener("pointerenter", () => {
      hovered = call.id
      showNote()
    })
    root.addEventListener("pointerleave", () => {
      hovered = null
      showNote()
    })
    tiles.set(call.id, tile)
    calls.append(root)
    return tile
  }

  function showNote(): void {
    const call = hovered ? tiles.get(hovered)?.call : null
    const text = call ? `${call.label}: ${call.reason ?? call.detail}` : fallbackNote
    setText(note, text)
    show(note, text !== "")
  }

  function rowFor(mission: MissionView): Row {
    const existing = rows.get(mission.id)
    if (existing) {
      return existing
    }
    const glyph = icon(MISSION_ICONS[mission.kind], "fp-mission__icon")
    const label = h("strong", "fp-mission__label")
    const place = h("span", "fp-mission__place")
    const when = h("span", "hud-label")
    const time = h("strong", "fp-mission__time")
    const bar = h("div", "hud-bar fp-mission__bar", h("div", "hud-bar__fill"))
    const root = h(
      "li",
      "fp-mission hud-plate",
      glyph,
      h("div", "fp-mission__text", label, place),
      h("div", "fp-mission__clock", when, time),
      bar
    )
    const row = { root, icon: glyph, label, place, when, time, bar }
    rows.set(mission.id, row)
    missions.append(root)
    return row
  }

  return {
    id: "fire-panel",
    zone: "bottom-right",
    root,
    update(state: HudState) {
      const { fire } = state
      show(board, state.view.overview || state.view.tactical > 0.5 || state.attention.fire)
      show(sos, fire.sos)
      const stockOf = new Map(fire.shells.map((stock) => [stock.shell, stock.left]))
      for (const call of fire.calls) {
        const tile = tileFor(call)
        tile.call = call
        setData(tile.root, "available", call.available)
        setData(tile.root, "active", call.active)
        const left = stockOf.get(CALL_SHELLS[call.id])
        setText(tile.stock, left === undefined ? "" : rounds(left))
      }
      fallbackNote = fire.calls.find((call) => call.active)?.reason ?? ""
      showNote()

      const live = new Set(fire.missions.map((mission) => mission.id))
      for (const [id, row] of rows) {
        if (!live.has(id)) {
          rows.delete(id)
          row.root.classList.add("is-leaving")
          window.setTimeout(() => row.root.remove(), 300)
        }
      }
      for (const mission of fire.missions) {
        const row = rowFor(mission)
        setIcon(row.icon, MISSION_ICONS[mission.kind])
        setText(row.label, mission.label)
        setText(row.place, mission.place)
        setText(row.when, countdownWord(mission))
        setText(row.time, clockSeconds(mission.seconds))
        setData(row.root, "phase", mission.phase)
        setData(row.root, "kind", mission.kind)
        setVar(row.bar, "--share", mission.progress)
      }

      for (const stock of fire.shells) {
        let entry = stocks.get(stock.shell)
        if (!entry) {
          const left = h("strong", "fp-shell__left")
          const bar = h("div", "hud-bar fp-shell__bar", h("div", "hud-bar__fill"))
          entry = { root: h("div", "fp-shell", h("span", "hud-label", stock.label), left, bar), left, bar }
          stocks.set(stock.shell, entry)
          shells.append(entry.root)
        }
        setText(entry.left, rounds(stock.left))
        setVar(entry.bar, "--share", stock.share)
        setData(entry.root, "low", stock.share < 0.2)
        setData(entry.root, "empty", stock.left === 0)
      }
      show(shells, fire.shells.length > 0)
    }
  }
}
