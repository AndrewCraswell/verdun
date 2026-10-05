import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import "./take-over-marks.css"

/**
 * H17 on the battlefield: with the squad lost, each squad that can be taken over carries its number from the picker
 * over its leader's head, with its name, so the player can see where each one is before choosing.
 */

const SVG = "http://www.w3.org/2000/svg"
/** Metres above the ground the mark floats, over a standing man's head. */
const LIFT = 2.6

interface Mark {
  readonly group: SVGGElement
  readonly number: SVGTextElement
  readonly name: SVGTextElement
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, className: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag)
  element.setAttribute("class", className)
  return element
}

export const takeOverMarks: HudElementFactory = (context) => {
  const root = svg("svg", "take-over-marks")
  root.setAttribute("aria-hidden", "true")
  const marks = new Map<number, Mark>()

  function markFor(squad: number): Mark {
    const existing = marks.get(squad)
    if (existing) {
      return existing
    }
    const group = svg("g", "tom-mark")
    const stem = svg("line", "tom-stem")
    stem.setAttribute("y1", "6")
    stem.setAttribute("y2", "26")
    const disc = svg("circle", "tom-disc")
    disc.setAttribute("r", "11")
    const number = svg("text", "tom-number")
    number.setAttribute("y", "4.5")
    const name = svg("text", "tom-name")
    name.setAttribute("y", "-17")
    group.append(stem, disc, number, name)
    root.append(group)
    const mark = { group, number, name }
    marks.set(squad, mark)
    return mark
  }

  return {
    id: "take-over-marks",
    zone: "world",
    root,
    update(state: HudState) {
      const choices = state.wiped?.choices ?? []
      const wanted = new Set(choices.map((choice) => choice.squad))
      for (const [squad, mark] of marks) {
        if (!wanted.has(squad)) {
          mark.group.remove()
          marks.delete(squad)
        }
      }
      choices.forEach((choice, index) => {
        const mark = markFor(choice.squad)
        mark.number.textContent = String(index + 1)
        mark.name.textContent = `${choice.name} · ${choice.men}`
      })
    },
    frame(state: HudState) {
      for (const choice of state.wiped?.choices ?? []) {
        const mark = marks.get(choice.squad)
        if (!mark) {
          continue
        }
        const { x, z } = choice.at
        const point = context.project(x, context.heightAt(x, z) + LIFT, z)
        if (point) {
          mark.group.setAttribute("transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`)
          mark.group.style.display = ""
        } else {
          mark.group.style.display = "none"
        }
      }
    }
  }
}
