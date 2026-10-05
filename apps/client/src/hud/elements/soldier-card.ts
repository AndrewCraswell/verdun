import { h, setData, setText, setVar, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName, setIcon } from "../icons.ts"
import type { MaskView, Posture, Severity, SoldierView, Spirit } from "../soldier-state.ts"
import "./soldier-card.css"

/**
 * H1, H3 and H4: the man under control. Who he is, how he is (spirit, wounds, posture, in words, never hit points),
 * his breath, and his kit. Bottom left, under the squad.
 */

const SPIRIT: Readonly<Record<Spirit, readonly [IconName, string, Severity]>> = {
  steady: ["steady", "Steady", "good"],
  shaken: ["shaken", "Shaken", "caution"],
  broken: ["broken", "Broken", "danger"]
}

const POSTURE: Readonly<Record<Posture, readonly [IconName, string]>> = {
  standing: ["standing", "Standing"],
  crouching: ["crouching", "Crouching"],
  prone: ["prone", "Lying down"],
  sheltering: ["dugout", "In a dugout"],
  "climbing-out": ["climbing-out", "Climbing out"]
}

/** Whether he can run: "ok", "winded" (can't run) or "spent" (walking slowly till he has his breath back). */
type Breath = "ok" | "winded" | "spent"

const BREATH: Readonly<Record<Breath, string>> = { ok: "", winded: "Can't run", spent: "Spent" }

function breathOf(soldier: SoldierView): Breath {
  if (soldier.stamina.spent) {
    return "spent"
  }
  return soldier.stamina.winded ? "winded" : "ok"
}

/** What working his weapon looks like between shots: a rifle's bolt, a machine gun's burst. */
const RELOADING: Readonly<Record<SoldierView["weapon"]["kind"], string>> = {
  rifle: "Working the bolt",
  "machine-gun": "Firing",
  sniper: "Working the bolt",
  "rifle-grenade": "Working the bolt"
}

/** Said only while it matters: off, the mask's dim mark is enough. */
const MASK: Readonly<Record<MaskView, string>> = { off: "", masking: "Masking", on: "Mask on" }

/** In a trench, a word on whether his head is up over the parapet; nothing out of the trenches. */
function parapetNote(overParapet: boolean | null): string {
  if (overParapet === null) {
    return ""
  }
  return overParapet ? "head up, seen" : "under cover"
}

/** The one thing happening to him right now that most needs saying, if any. */
function alertOf(soldier: SoldierView): readonly [IconName, string, string, Severity] | null {
  if (soldier.fire === "pinned") {
    return ["pinned", "Pinned", "head down, rounds landing close", "danger"]
  }
  if (soldier.mask === "masking") {
    return ["mask", "Masking", "pulling the mask on", "danger"]
  }
  if (soldier.fire === "under-fire") {
    return ["under-fire", "Under fire", "his aim is spoiled", "caution"]
  }
  if (soldier.stamina.spent) {
    return ["breath", "Spent", "walking till he has his breath back", "caution"]
  }
  return null
}

function cell(label: string): { root: HTMLElement; icon: SVGSVGElement; value: HTMLElement; note: HTMLElement } {
  const glyph = icon("steady", "sc-cell__icon")
  const value = h("span", "sc-cell__value")
  const note = h("span", "sc-cell__note")
  const root = h("div", "sc-cell", glyph, h("span", "sc-cell__text", h("span", "hud-label", label), value, note))
  return { root, icon: glyph, value, note }
}

export const soldierCard: HudElementFactory = () => {
  const slot = h("span", "sc-slot__number")
  const rank = h("span", "sc-rank")
  const given = h("span", "sc-name__given")
  const surname = h("span", "sc-name__surname")
  const role = h("span", "sc-role")
  const identity = h("div", "sc-identity", h("div", "sc-rank-row", rank), h("div", "sc-name", given, surname), role)
  const head = h("header", "sc-head", h("div", "sc-slot", h("span", "hud-label", "Slot"), slot), identity)

  const alertIcon = icon("pinned", "sc-alert__icon")
  const alertTitle = h("strong", "sc-alert__title")
  const alertDetail = h("span", "sc-alert__detail")
  const alert = h("div", "sc-alert hud-hatch", alertIcon, alertTitle, alertDetail)

  const spirit = cell("Spirit")
  const body = cell("Body")
  const posture = cell("Posture")
  const cells = h("div", "sc-cells", spirit.root, body.root, posture.root)

  const breathFill = h("div", "hud-bar__fill")
  const breathTick = h("div", "sc-breath__tick")
  const breathBar = h("div", "hud-bar sc-breath__bar", breathFill, breathTick)
  const breathState = h("span", "sc-breath__state")
  const breath = h(
    "div",
    "sc-breath",
    h("div", "sc-breath__head", h("span", "hud-label", "Breath"), breathState),
    breathBar
  )

  const weaponIcon = icon("rifle", "sc-weapon__icon")
  const weaponName = h("span", "sc-weapon__name")
  const readyRing = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  readyRing.setAttribute("class", "sc-ready__ring")
  readyRing.setAttribute("viewBox", "0 0 20 20")
  readyRing.innerHTML =
    '<circle cx="10" cy="10" r="7.5" class="sc-ready__track"/><circle cx="10" cy="10" r="7.5" class="sc-ready__arc" pathLength="1"/>'
  const readyText = h("span", "sc-ready__text")
  const weapon = h(
    "div",
    "sc-weapon",
    weaponIcon,
    h("span", "sc-weapon__text", weaponName, h("span", "sc-ready", readyRing, readyText))
  )
  const pips = h("span", "sc-grenades__pips")
  const grenades = h("div", "sc-grenades", h("span", "hud-label", "Grenades"), pips)
  const maskIcon = icon("mask", "sc-mask__icon")
  const maskText = h("span", "sc-mask__text")
  const mask = h("div", "sc-mask", maskIcon, maskText)
  // A rifle grenadier's VB grenades, by count: eight are too many to show as pips.
  const rifleCount = h("strong", "sc-rifle-grenades__count")
  const rifleGrenades = h(
    "div",
    "sc-rifle-grenades",
    h("span", "hud-label", "Rifle gr."),
    h("span", "sc-rifle-grenades__row", icon("rifle-grenade", "sc-rifle-grenades__icon"), rifleCount)
  )
  rifleGrenades.title = "Rifle grenades left"
  const kit = h("footer", "sc-kit", weapon, rifleGrenades, grenades, mask)

  const root = h("section", "soldier-card hud-plate", head, alert, cells, breath, kit)
  root.setAttribute("aria-label", "Your soldier")
  let shownId = -1
  let pipCount = -1

  function setCell(
    target: ReturnType<typeof cell>,
    glyph: IconName,
    text: string,
    severity: Severity,
    note: string
  ): void {
    setIcon(target.icon, glyph)
    setText(target.value, text)
    setText(target.note, note)
    setData(target.root, "severity", severity)
  }

  return {
    id: "soldier-card",
    zone: "bottom-left",
    root,
    update(state: HudState) {
      const soldier = state.soldier
      show(root, soldier !== null)
      if (!soldier) {
        return
      }
      if (soldier.id !== shownId) {
        if (shownId >= 0) {
          root.classList.remove("is-new")
          void root.offsetWidth
          root.classList.add("is-new")
        }
        shownId = soldier.id
      }
      setText(slot, String(soldier.slot))
      setText(rank, soldier.name.rank)
      setText(given, soldier.name.given)
      setText(surname, soldier.name.surname)
      setText(role, soldier.roleLabel)
      setData(root, "role", soldier.role)

      const warning = alertOf(soldier)
      show(alert, warning !== null)
      if (warning) {
        const [glyph, title, detail, severity] = warning
        setIcon(alertIcon, glyph)
        setText(alertTitle, title)
        setText(alertDetail, detail)
        setData(alert, "severity", severity)
      }

      const [spiritIcon, spiritText, spiritSeverity] = SPIRIT[soldier.spirit]
      setCell(spirit, spiritIcon, spiritText, spiritSeverity, "")
      setCell(body, "wound", soldier.wounded ? "Wounded" : "Unhurt", soldier.wounded ? "danger" : "good", "")
      const [postureIcon, postureText] = POSTURE[soldier.posture]
      setCell(
        posture,
        postureIcon,
        postureText,
        soldier.overParapet ? "info" : "good",
        parapetNote(soldier.overParapet)
      )

      const breathing = breathOf(soldier)
      setData(breath, "state", breathing)
      setText(breathState, BREATH[breathing])
      setVar(breathBar, "--share", soldier.stamina.share)
      setVar(breathTick, "--at", soldier.stamina.runs)

      setIcon(weaponIcon, soldier.weapon.kind)
      setText(weaponName, soldier.weapon.name)
      const ready = soldier.weapon.ready >= 1
      setData(weapon, "ready", ready)
      setVar(readyRing, "--ready", soldier.weapon.ready)
      // Ready goes without saying: the ring full says it. Only the reload is named.
      setText(readyText, ready ? "" : RELOADING[soldier.weapon.kind])

      if (soldier.grenades.carried !== pipCount) {
        pipCount = soldier.grenades.carried
        pips.replaceChildren(...Array.from({ length: pipCount }, () => icon("grenade", "sc-grenades__pip")))
      }
      pips.querySelectorAll(".sc-grenades__pip").forEach((pip, index) => {
        pip.classList.toggle("is-spent", index >= soldier.grenades.count)
      })
      setData(grenades, "empty", soldier.grenades.count === 0)
      const rifle = soldier.rifleGrenades
      show(rifleGrenades, rifle !== null)
      setData(root, "rifleGrenades", rifle !== null)
      if (rifle) {
        setText(rifleCount, `${rifle.count}/${rifle.carried}`)
        setData(rifleGrenades, "empty", rifle.count === 0)
      }

      setData(mask, "state", soldier.mask)
      setText(maskText, MASK[soldier.mask])
      setVar(mask, "--progress", soldier.maskProgress)
    }
  }
}
