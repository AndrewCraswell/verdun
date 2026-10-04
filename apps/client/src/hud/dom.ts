/**
 * Small helpers the HUD's elements share for building their DOM once and touching it as little as possible after:
 * text and attributes are written only when they change, so a redraw ten times a second costs next to nothing and
 * leaves CSS transitions running.
 */

type Child = Node | string | null | false | undefined

/** An element with a class and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (className) {
    element.className = className
  }
  for (const child of children) {
    if (child !== null && child !== false && child !== undefined) {
      element.append(child)
    }
  }
  return element
}

/** Sets an element's text, if it changed. */
export function setText(element: Element, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text
  }
}

/** Sets a `data-` attribute, or removes it for null, if it changed. */
export function setData(element: HTMLElement | SVGElement, key: string, value: string | number | boolean | null): void {
  const next = value === null || value === false ? undefined : String(value)
  if (element.dataset[key] !== next) {
    if (next === undefined) {
      delete element.dataset[key]
    } else {
      element.dataset[key] = next
    }
  }
}

/** Shows or hides an element, if that changed. */
export function show(element: HTMLElement, visible: boolean): void {
  if (element.hidden === visible) {
    element.hidden = !visible
  }
}

/** Sets a CSS custom property, if it changed, to a number rounded enough not to churn the style. */
export function setVar(element: HTMLElement | SVGElement, name: string, value: number, places = 3): void {
  const next = value.toFixed(places)
  if (element.style.getPropertyValue(name) !== next) {
    element.style.setProperty(name, next)
  }
}

/** Restarts a CSS animation by toggling its class off and on again: for a pulse on change. */
export function replay(element: Element, className: string): void {
  element.classList.remove(className)
  // Reading layout flushes the removal, so adding the class back starts the animation again.
  void (element as HTMLElement).offsetWidth
  element.classList.add(className)
}

/** A key cap: "Tab", "W". */
export function keyCap(key: string): HTMLElement {
  return h("kbd", "hud-key", key)
}

/** Text with keys in square brackets drawn as key caps: "[Tab] or [1]–[8] takes another man". */
export function withKeys(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const part of text.split(/(\[[^\]]+\])/)) {
    if (part.startsWith("[") && part.endsWith("]")) {
      fragment.append(keyCap(part.slice(1, -1)))
    } else if (part) {
      fragment.append(part)
    }
  }
  return fragment
}
