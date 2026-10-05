import { firstWave } from "@verdun/sim"
import { h, setText } from "../hud/dom.ts"
import { metres } from "../hud/format.ts"
import type { BattleParts } from "./battle.ts"
import { button } from "./fields.ts"
import { type JoinChoice, joinArea, joinChoices } from "./join.ts"
import { attackPlan, minutes } from "./operation-report.ts"
import type { MenuPage } from "./page.ts"
import { drawPlan, planInks } from "./sector/plan-canvas.ts"
import { type PlanFit, toPlan, trenchOwner } from "./sector/plan.ts"
import "./join-map.css"

/**
 * Joining the battle (S8 in docs/design/interface.md), on the map: every squad of the player's side pinned where it
 * stands, the one held for them first in brass. Choosing one shows what it is and where; Start goes in with it. Beside
 * the map, the attack ahead in three lines, counted from the start.
 */
export function createJoinMap({
  battle,
  start
}: {
  readonly battle: BattleParts
  /** Goes in leading `squad`. */
  readonly start: (squad: number) => void
}): MenuPage {
  const { sim, squad: held, tickRate } = battle
  const plan = h("canvas", "join-plan")
  const pins = h("div", "join-pins")
  const box = h("div", "join-map-box", plan, pins)
  const legend = h(
    "div",
    "join-legend",
    h("span", "join-key join-key--wave", "Goes over"),
    h("span", "join-key join-key--held", "Held for you"),
    h("span", "join-key join-key--free", "Can be taken"),
    h("span", "join-key join-key--reserve", "In reserve"),
    h("span", "join-key join-key--refused", "Can't be taken")
  )
  const attack = h("section", "join-attack")
  const chosenName = h("h3", "join-chosen-name")
  const chosenFacts = h("p", "join-chosen-facts")
  const chosenRefusal = h("p", "join-chosen-refusal")
  const startButton = button("Start", () => start(chosen), "ui-button ui-button--primary join-start")
  const side = h(
    "aside",
    "join-side",
    attack,
    h("section", "join-chosen", chosenName, chosenFacts, chosenRefusal, startButton)
  )
  const root = h("div", "join-page", h("div", "join-map", box, legend), side)
  let chosen = held.id
  let choices: JoinChoice[] = []
  const reserves = new Set<number>()
  /** The squads that go over in the first wave, as they stand now. */
  const wave = new Set<number>()

  function describe(): void {
    const choice = choices.find((each) => each.squad === chosen)
    for (const pin of pins.children) {
      if (pin instanceof HTMLElement) {
        pin.setAttribute("aria-pressed", String(pin.dataset.squad === String(chosen)))
      }
    }
    if (!choice) {
      return
    }
    setText(chosenName, choice.squad === held.id ? `${choice.name}, held for you` : choice.name)
    const where = reserves.has(choice.squad) ? "in reserve in the support line" : "in the front line"
    const distance = choice.fromEnemy === null ? "" : `, ${metres(choice.fromEnemy)} from the enemy`
    const operation = sim.operation
    let part = ""
    if (operation && operation.result === null) {
      const over = minutes((operation.zeroHourAt - sim.tick) / tickRate)
      if (wave.has(choice.squad)) {
        part = ` Goes over at ${over}.`
      } else {
        part = reserves.has(choice.squad) ? " May follow in the second wave." : " Not in the attack: holds the line."
      }
    }
    setText(chosenFacts, `${choice.men} men, ${where} ${choice.place}${distance}.${part}`)
    setText(chosenRefusal, choice.refusal ?? "")
    chosenRefusal.hidden = choice.refusal === null
    startButton.disabled = choice.refusal !== null
  }

  /** How a squad's pin looks: held for the player, can't be taken, in reserve, or free to take. */
  function kindOf(choice: JoinChoice): "held" | "refused" | "reserve" | "free" {
    if (choice.squad === held.id) {
      return "held"
    }
    if (choice.refusal) {
      return "refused"
    }
    return reserves.has(choice.squad) ? "reserve" : "free"
  }

  /** The stretch of their line the attack goes for, shaded on the plan, with a word over it. */
  function drawStretch(fit: PlanFit): void {
    const operation = sim.operation
    const drawing = plan.getContext("2d")
    if (!operation || operation.result !== null || !drawing) {
      return
    }
    // Their line nearest our squads, along the stretch: the one the first wave goes for.
    const ownZ = choices.find((each) => each.squad === held.id)?.at.z ?? 0
    let front: number | null = null
    for (const trench of sim.map.trenches) {
      if (trenchOwner(trench, held.side) !== "theirs") {
        continue
      }
      for (const [x, z] of trench.points) {
        if (
          x >= operation.fromX &&
          x <= operation.toX &&
          (front === null || Math.abs(z - ownZ) < Math.abs(front - ownZ))
        ) {
          front = z
        }
      }
    }
    if (front === null) {
      return
    }
    const ink = planInks(root)
    const a = toPlan(sim.map, fit, operation.fromX, front + 14)
    const b = toPlan(sim.map, fit, operation.toX, front - 14)
    drawing.fillStyle = "rgb(176 52 31 / 16%)"
    drawing.fillRect(a.x, a.y, b.x - a.x, b.y - a.y)
    drawing.setLineDash([6, 4])
    drawing.strokeStyle = ink.theirs
    drawing.lineWidth = 2
    drawing.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    drawing.setLineDash([])
    drawing.font = "700 12px 'Archivo Variable', sans-serif"
    drawing.textAlign = "center"
    drawing.textBaseline = "bottom"
    drawing.lineWidth = 3
    drawing.strokeStyle = "rgb(233 224 200 / 90%)"
    drawing.strokeText("The attack", (a.x + b.x) / 2, a.y - 4)
    drawing.fillStyle = ink.theirs
    drawing.fillText("The attack", (a.x + b.x) / 2, a.y - 4)
    drawing.textAlign = "left"
  }

  function draw(): void {
    wave.clear()
    if (sim.operation && sim.operation.result === null) {
      for (const each of firstWave(sim, sim.operation)) {
        wave.add(each.id)
      }
    }
    const all = joinChoices(sim, held)
    reserves.clear()
    for (const each of all.reserve) {
      reserves.add(each.squad)
    }
    choices = [all.held, ...all.line, ...all.reserve]
    const width = box.clientWidth
    const height = box.clientHeight
    const fit = drawPlan(plan, sim.map, held.side, width, height, planInks(root), {
      objectives: sim.objectives,
      margin: 24,
      area: joinArea(sim, held.side, choices)
    })
    drawStretch(fit)
    pins.replaceChildren(
      ...choices.map((choice) => {
        const kind = kindOf(choice)
        const pin = button(
          choice.name.replace(/^Squad /, ""),
          () => {
            chosen = choice.squad
            describe()
          },
          `join-pin join-pin--${kind}${wave.has(choice.squad) ? " join-pin--wave" : ""}`
        )
        const { x, y } = toPlan(sim.map, fit, choice.at.x, choice.at.z)
        pin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        pin.dataset.squad = String(choice.squad)
        const goes = wave.has(choice.squad) ? ", goes over" : ""
        pin.setAttribute(
          "aria-label",
          `${choice.name}, ${choice.place}${goes}${choice.refusal ? `: ${choice.refusal}` : ""}`
        )
        return pin
      })
    )
    describe()
  }

  function drawAttack(): void {
    const operation = sim.operation
    attack.hidden = !operation || operation.result !== null
    if (!operation || operation.result !== null) {
      return
    }
    const ahead = attackPlan(operation, sim.tick, tickRate)
    attack.replaceChildren(
      h("h3", "ui-settings-heading", "The attack, from when you start"),
      h("ol", "join-attack-lines", ...ahead.lines.map((line) => h("li", "", line))),
      h(
        "p",
        "join-attack-win",
        ...ahead.outcomes.flatMap((outcome, index) => [
          h("strong", `join-outcome join-outcome--${outcome.result}`, outcome.label),
          ` if ${outcome.means}${index < ahead.outcomes.length - 1 ? "; " : "."}`
        ])
      )
    )
  }

  const resize = new ResizeObserver(draw)
  return {
    id: "join",
    title: "Choose your squad",
    root,
    opened() {
      chosen = held.id
      drawAttack()
      draw()
      resize.observe(box)
      startButton.focus()
    },
    closed() {
      resize.disconnect()
    },
    dispose() {
      resize.disconnect()
    }
  }
}
