import { Side } from "@verdun/sim"
import { h, replay, setData, setText, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import { metres } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName, setIcon } from "../icons.ts"
import type { RosterSlot, SlotMark, SlotStatus } from "../soldier-state.ts"
import type { Role } from "../squad-names.ts"
import "./roster-strip.css"

/**
 * H5: the squad at a glance, and the way to choose who to be. Eight tiles in slot order; each shows the man's job, the
 * one state that matters most about him, small marks, and how far off he is. Click a tile to take him, as 1-8 do.
 */

const STATUS: Readonly<Record<SlotStatus, readonly [IconName | null, string]>> = {
  steady: [null, "Steady"],
  shaken: ["shaken", "Shaken"],
  broken: ["broken", "Broken: won't advance"],
  "under-fire": ["under-fire", "Under fire"],
  pinned: ["pinned", "Pinned down"],
  masking: ["mask", "Pulling his mask on"],
  gassed: ["gas", "Gassed: choking"],
  spent: ["breath", "Spent: out of breath"],
  wounded: ["wound", "Wounded, still fighting"],
  down: ["stretcher", "Down, waiting for the bearers"],
  carried: ["carried", "Being carried back"],
  "aid-post": ["aid-post", "At the aid post"],
  returned: ["returned", "Patched up, back in the reserves"],
  hospital: ["hospital", "Sent back to hospital"],
  killed: ["killed", "Killed"],
  captured: ["captured", "Taken prisoner"]
}

const MARKS: Readonly<Record<SlotMark, readonly [IconName, string]>> = {
  wounded: ["wound", "wounded"],
  masked: ["mask", "masked"],
  "no-grenades": ["grenade", "no grenades left"],
  spent: ["breath", "spent"]
}

const ROLE_WORDS: Readonly<Record<Role, string>> = {
  leader: "Squad leader",
  rifleman: "Rifleman",
  gunner: "Machine gunner"
}

/** What clicking a man's tile would do. */
function actionOf(slot: RosterSlot): string {
  if (slot.controlled) {
    return "Under your command"
  }
  return slot.fighting ? `Click or press ${slot.slot} to take him` : "Out of the fight"
}

/** Beyond this, in metres, a man is away from the leader's steadying hand (docs/design/morale-and-stamina.md). */
const FAR = 30

function roleIcon(role: Role, side: Side): IconName {
  if (role === "leader") {
    return "leader"
  }
  if (role === "gunner") {
    return "machine-gun"
  }
  return side === Side.German ? "helmet-german" : "helmet-french"
}

interface Tile {
  readonly root: HTMLButtonElement
  readonly key: HTMLElement
  readonly role: SVGSVGElement
  readonly badge: HTMLElement
  readonly badgeIcon: SVGSVGElement
  readonly name: HTMLElement
  readonly distance: HTMLElement
  readonly marks: HTMLElement
  id: number
  status: SlotStatus | null
  slot: RosterSlot | null
}

export const rosterStrip: HudElementFactory = (context) => {
  const tiles: Tile[] = []
  const tipRank = h("div", "rs-tip__rank")
  const tipName = h("div", "rs-tip__name")
  const tipRole = h("div", "rs-tip__role")
  const tipStatus = h("div", "rs-tip__status")
  const tipMarks = h("div", "rs-tip__marks")
  const tipAction = h("div", "rs-tip__action")
  const tip = h("div", "rs-tip hud-plate", tipRank, tipName, tipRole, tipStatus, tipMarks, tipAction)
  tip.hidden = true
  const strip = h("div", "rs-tiles")
  const root = h("nav", "roster-strip", tip, strip)
  root.setAttribute("aria-label", "Your squad")
  let hovered: Tile | null = null
  let side: Side = context.squad.side

  function fillTip(tile: Tile): void {
    const slot = tile.slot
    if (!slot) {
      return
    }
    setText(tipRank, `${slot.name.rank} · slot ${slot.slot}`)
    setText(tipName, `${slot.name.given} ${slot.name.surname}`)
    setText(tipRole, ROLE_WORDS[slot.role])
    setText(tipStatus, STATUS[slot.status][1])
    setData(tipStatus, "severity", slot.severity)
    const notes = slot.marks.map((mark) => MARKS[mark][1])
    if (slot.distance !== null) {
      notes.push(`${metres(slot.distance)} from you`)
    }
    setText(tipMarks, notes.join(" · "))
    show(tipMarks, notes.length > 0)
    setText(tipAction, actionOf(slot))
    tip.style.setProperty("--x", `${tile.root.offsetLeft + tile.root.offsetWidth / 2}px`)
  }

  function makeTile(): Tile {
    const key = h("span", "rs-tile__key")
    const role = icon("helmet-french", "rs-tile__role")
    const badgeIcon = icon("pinned")
    const badge = h("span", "rs-tile__badge", badgeIcon)
    const name = h("span", "rs-tile__name")
    const distance = h("span", "rs-tile__distance")
    const marks = h("span", "rs-tile__marks")
    const button = h("button", "rs-tile", key, role, badge, marks, distance, name, h("span", "rs-tile__bar"))
    button.type = "button"
    button.tabIndex = -1
    const tile: Tile = {
      root: button,
      key,
      role,
      badge,
      badgeIcon,
      name,
      distance,
      marks,
      id: -1,
      status: null,
      slot: null
    }
    button.addEventListener("click", () => {
      button.blur()
      if (tile.slot?.fighting && !tile.slot.controlled) {
        context.takeSoldier(tile.id)
      } else if (tile.slot && !tile.slot.fighting) {
        replay(button, "is-refused")
      }
    })
    button.addEventListener("pointerenter", () => {
      hovered = tile
      fillTip(tile)
      show(tip, true)
    })
    button.addEventListener("pointerleave", () => {
      if (hovered === tile) {
        hovered = null
        show(tip, false)
      }
    })
    return tile
  }

  function draw(tile: Tile, slot: RosterSlot): void {
    const newMan = tile.id !== slot.id
    tile.id = slot.id
    tile.slot = slot
    setText(tile.key, String(slot.slot))
    setText(tile.name, slot.name.surname)
    setData(tile.root, "severity", slot.severity)
    setData(tile.root, "status", slot.status)
    setData(tile.root, "controlled", slot.controlled)
    setData(tile.root, "out", !slot.fighting)
    tile.root.setAttribute(
      "aria-label",
      `${slot.slot}: ${slot.name.rank} ${slot.name.surname}, ${STATUS[slot.status][1]}`
    )
    const [statusIcon] = STATUS[slot.status]
    setIcon(tile.role, slot.fighting ? roleIcon(slot.role, side) : (statusIcon ?? "killed"))
    show(tile.badge, slot.fighting && statusIcon !== null)
    if (statusIcon) {
      setIcon(tile.badgeIcon, statusIcon)
    }
    const far = slot.fighting && slot.distance !== null && slot.distance >= FAR
    setText(tile.distance, far && slot.distance !== null ? metres(slot.distance) : "")
    const marks = slot.marks.slice(0, 2).map((mark) => MARKS[mark][0])
    if (tile.marks.dataset.marks !== marks.join()) {
      tile.marks.dataset.marks = marks.join()
      tile.marks.replaceChildren(...marks.map((mark) => icon(mark, "rs-tile__mark")))
    }
    // A man going down, breaking or being taken: his tile flashes once.
    const worse = !newMan && tile.status !== slot.status && (slot.severity === "danger" || !slot.fighting)
    if (worse) {
      replay(tile.root, "is-struck")
    }
    if (newMan && tile.status !== null) {
      replay(tile.root, "is-joined")
    }
    tile.status = slot.status
  }

  return {
    id: "roster-strip",
    zone: "bottom-left",
    root,
    update(state: HudState) {
      side = state.side
      while (tiles.length < state.roster.length) {
        const tile = makeTile()
        tiles.push(tile)
        strip.append(tile.root)
      }
      while (tiles.length > state.roster.length) {
        tiles.pop()?.root.remove()
      }
      state.roster.forEach((slot, index) => {
        const tile = tiles[index]
        if (tile) {
          draw(tile, slot)
        }
      })
      if (hovered) {
        fillTip(hovered)
      }
    }
  }
}
