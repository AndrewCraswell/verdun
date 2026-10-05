import { h } from "../hud/dom.ts"

/**
 * The options screen's controls, built plainly on native inputs so the keyboard, focus and screen readers work as the
 * browser makes them: a row with its label and note, a choice of a few values, a slider and a switch.
 */

let ids = 0
const nextId = (prefix: string) => `${prefix}-${++ids}`

/** A setting's row: what it is and a note on the left, its control on the right. */
export function settingRow(label: string, note: string | null, control: HTMLElement): HTMLElement {
  const id = nextId("setting")
  const title = h("div", "ui-setting-label", label)
  title.id = id
  // A group of choices is labelled as a whole; a slider or switch by its input.
  const labelled = control.getAttribute("role") === "radiogroup" ? control : (control.querySelector("input") ?? control)
  labelled.setAttribute("aria-labelledby", id)
  const text = h("div", "ui-setting-text", title, note ? h("div", "ui-setting-note", note) : null)
  return h("div", "ui-setting", text, h("div", "ui-setting-control", control))
}

export interface Choice<T extends string> {
  readonly value: T
  readonly label: string
}

/** A choice of a few values, side by side, as a group of radio buttons. Returns the group and a way to set it. */
export function segmented<T extends string>(
  choices: readonly Choice<T>[],
  value: T,
  onChange: (value: T) => void
): { readonly root: HTMLElement; set(value: T): void } {
  const name = nextId("choice")
  const root = h("div", "ui-segmented")
  root.setAttribute("role", "radiogroup")
  const inputs = choices.map((choice) => {
    const input = h("input", "ui-segmented-input")
    input.type = "radio"
    input.name = name
    input.value = choice.value
    input.checked = choice.value === value
    input.addEventListener("change", () => {
      if (input.checked) {
        onChange(choice.value)
      }
    })
    root.append(h("label", "ui-segmented-option", input, h("span", "ui-segmented-text", choice.label)))
    return input
  })
  return {
    root,
    set(next) {
      for (const input of inputs) {
        input.checked = input.value === next
      }
    }
  }
}

/** A slider with its value shown beside it, as `format` writes it. */
export function slider(
  { min, max, step }: { readonly min: number; readonly max: number; readonly step: number },
  value: number,
  format: (value: number) => string,
  onInput: (value: number) => void
): { readonly root: HTMLElement; set(value: number): void } {
  const input = h("input", "ui-slider-input")
  input.type = "range"
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  const readout = h("output", "ui-slider-value", format(value))
  const fill = () => {
    const share = (Number(input.value) - min) / (max - min)
    input.style.setProperty("--fill", `${(share * 100).toFixed(1)}%`)
    readout.textContent = format(Number(input.value))
    input.setAttribute("aria-valuetext", readout.textContent)
  }
  input.addEventListener("input", () => {
    fill()
    onInput(Number(input.value))
  })
  fill()
  const root = h("div", "ui-slider", input, readout)
  return {
    root,
    set(next) {
      input.value = String(next)
      fill()
    }
  }
}

/** An on-off switch: a checkbox with the role of a switch. */
export function toggle(
  value: boolean,
  onChange: (value: boolean) => void
): {
  readonly root: HTMLElement
  set(value: boolean): void
} {
  const input = h("input", "ui-toggle-input")
  input.type = "checkbox"
  input.setAttribute("role", "switch")
  input.checked = value
  const state = h("span", "ui-toggle-state", value ? "On" : "Off")
  input.addEventListener("change", () => {
    state.textContent = input.checked ? "On" : "Off"
    onChange(input.checked)
  })
  const root = h("label", "ui-toggle", input, h("span", "ui-toggle-track"), state)
  return {
    root,
    set(next) {
      input.checked = next
      state.textContent = next ? "On" : "Off"
    }
  }
}

/** A plain button in the menus' style. */
export function button(label: string, onClick: () => void, className = "ui-button"): HTMLButtonElement {
  const created = h("button", className, label)
  created.type = "button"
  created.addEventListener("click", onClick)
  return created
}

/** "75%". */
export const percent = (value: number) => `${Math.round(value * 100)}%`
