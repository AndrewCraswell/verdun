import { h, setData, setText, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import { hourText } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName, setIcon } from "../icons.ts"
import { interfaceSettings } from "../interface-settings.ts"
import type { LightPhase, Sky } from "../sector-state.ts"
import "./clock-panel.css"

/**
 * H11: the hour by a French clock, the week of the war, the light and when it changes, the weather, and a compass that
 * turns with the camera, with the wind on it: the wind carries the gas. Under them, the war's turn and the time to the
 * next communiqué. Top right.
 */

const SVG = "http://www.w3.org/2000/svg"

const LIGHT: Readonly<Record<LightPhase, readonly [IconName, string]>> = {
  day: ["sun", "Day"],
  dawn: ["horizon", "Dawn"],
  dusk: ["horizon", "Dusk"],
  night: ["moon", "Night"]
}

function skyIcon(sky: Sky, night: boolean): IconName {
  switch (sky) {
    case "clear":
      return night ? "moon" : "sun"
    case "fair":
      return night ? "moon" : "fair"
    case "snow":
      return "snowfall"
    default:
      return sky
  }
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag)
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value))
  }
  return element
}

/** The compass card: a ring of ticks, the cardinal letters and a brass north needle. */
function compassCard(): SVGGElement {
  const card = svg("g", { class: "cp-dial__card" })
  for (let tick = 0; tick < 32; tick++) {
    const angle = (tick / 32) * Math.PI * 2
    const major = tick % 8 === 0
    const outer = 43
    // Long ticks at the cardinal points, middling at the half-winds, short between.
    let inner = 40
    if (major) {
      inner = 34
    } else if (tick % 4 === 0) {
      inner = 37
    }
    card.append(
      svg("line", {
        x1: Math.sin(angle) * inner,
        y1: -Math.cos(angle) * inner,
        x2: Math.sin(angle) * outer,
        y2: -Math.cos(angle) * outer,
        class: major ? "cp-dial__tick cp-dial__tick--major" : "cp-dial__tick"
      })
    )
  }
  for (const [letter, angle] of [
    ["E", 90],
    ["S", 180],
    ["W", 270]
  ] as const) {
    const radians = (angle * Math.PI) / 180
    const text = svg("text", {
      x: Math.sin(radians) * 24,
      y: -Math.cos(radians) * 24,
      class: "cp-dial__letter"
    })
    text.textContent = letter
    card.append(text)
  }
  card.append(svg("path", { d: "M0 -31 L5.5 -17 L0 -20.5 L-5.5 -17 Z", class: "cp-dial__needle" }))
  const north = svg("text", { x: 0, y: -8, class: "cp-dial__letter cp-dial__letter--north" })
  north.textContent = "N"
  card.append(north)
  return card
}

export const clockPanel: HudElementFactory = (context) => {
  const hour = h("div", "cp-hour")
  const week = h("div", "cp-week")
  const lightIcon = icon("sun", "cp-line__icon")
  const lightPhase = h("span", "cp-light__phase")
  const lightNext = h("span", "cp-light__next")
  const standTo = h("span", "cp-standto", "Stand-to")
  const light = h("div", "cp-line cp-light", lightIcon, lightPhase, lightNext)
  const weatherIcon = icon("overcast", "cp-line__icon")
  const weatherLabel = h("span", "cp-weather__label")
  const temperature = h("span", "cp-weather__temperature")
  const visibility = h("span", "cp-weather__visibility")
  const weather = h("div", "cp-line cp-weather", weatherIcon, weatherLabel, temperature, visibility)

  const dial = svg("svg", { class: "cp-dial", viewBox: "-50 -50 100 100", "aria-hidden": "true" })
  dial.append(svg("circle", { r: 47, class: "cp-dial__bezel" }), svg("circle", { r: 43.5, class: "cp-dial__face" }))
  const card = compassCard()
  // Turned to where the wind blows each frame; its body scales with the wind's strength.
  const wind = svg("g", { class: "cp-dial__wind" })
  const windBody = svg("g", { class: "cp-dial__wind-body" })
  windBody.append(
    svg("line", { x1: 0, y1: 26, x2: 0, y2: -18, class: "cp-dial__wind-shaft" }),
    svg("path", { d: "M0 -30 L7 -16 L0 -19.5 L-7 -16 Z", class: "cp-dial__wind-head" }),
    svg("path", { d: "M-4 30 L0 24 L4 30", class: "cp-dial__wind-tail" })
  )
  wind.append(windBody)
  dial.append(card, wind, svg("circle", { r: 3, class: "cp-dial__pin" }))
  const windText = h("span", "cp-wind__text")
  const compass = h("div", "cp-compass", dial, h("div", "cp-wind", h("span", "hud-label", "Wind"), windText))

  const turn = h("span", "cp-war__turn hud-label")
  const countdown = h("span", "cp-war__countdown")
  const war = h("footer", "cp-war", turn, countdown)

  // At rest only the hour, the stand-to and the compass show; the rest folds away until the overview or a change.
  const fold = (...children: HTMLElement[]) => h("div", "cp-fold", h("div", "cp-fold__inner", ...children))
  const root = h(
    "section",
    "clock-panel hud-plate",
    h(
      "div",
      "cp-main",
      h("div", "cp-time", h("div", "cp-hour-row", standTo, hour), fold(week, light, weather)),
      compass
    ),
    fold(war)
  )
  root.setAttribute("aria-label", "Time, light and weather")
  let cardAngle = Number.NaN
  let windAngle = Number.NaN

  return {
    id: "clock-panel",
    zone: "top-right",
    root,
    update(state: HudState) {
      const { clock } = state
      const full = state.view.overview || state.attention.sky || state.view.tactical > 0.5
      setData(root, "mode", full ? "full" : "compact")
      // By the 24-hour clock, as the army kept it, unless the player reads the 12-hour.
      const { clock: reading } = interfaceSettings().current
      const time = hourText(clock.hour, reading)
      const [hours, rest] = time.split(":")
      const [minutes, half] = (rest ?? "").split(" ")
      if (hour.dataset.time !== time) {
        hour.dataset.time = time
        hour.replaceChildren(
          h("span", "cp-hour__digits", hours ?? ""),
          h("span", "cp-hour__colon", ":"),
          h("span", "cp-hour__digits", minutes ?? ""),
          ...(half ? [h("span", "cp-hour__half", half)] : [])
        )
      }
      setText(week, clock.week)
      const [phaseIcon, phaseText] = LIGHT[clock.light.phase]
      setIcon(lightIcon, phaseIcon)
      setText(lightPhase, phaseText)
      setText(lightNext, hourText(clock.light.next ?? "", reading))
      show(standTo, clock.light.standTo)
      setData(root, "phase", clock.light.phase)

      setIcon(weatherIcon, skyIcon(clock.weather.sky, clock.light.phase === "night"))
      setText(weatherLabel, clock.weather.label)
      setText(temperature, `${clock.weather.temperature} °C`)
      setText(visibility, clock.weather.visibility === null ? "" : `sight ${clock.weather.visibility} m`)
      setData(weather, "short", clock.weather.visibility !== null)

      setText(windText, clock.wind.speed < 0.5 ? "Calm" : `${clock.wind.from} ${Math.round(clock.wind.speed)} m/s`)
      setData(dial, "calm", clock.wind.speed < 0.5)
      // The arrow grows with the wind, to its full length at a gale.
      windBody.style.setProperty("--length", (0.55 + Math.min(1, clock.wind.speed / 10) * 0.45).toFixed(2))

      show(war, state.war !== null)
      if (state.war) {
        setText(turn, state.war.turn)
        setText(countdown, state.war.countdown)
        setData(war, "standto", state.war.standTo)
      }
    },
    frame(state) {
      const at = state.soldier?.position ?? { x: 300, z: 200 }
      const north = context.screenAngle(at.x, at.z, 0, 1)
      const blowing = context.screenAngle(at.x, at.z, state.clock.wind.x, state.clock.wind.z)
      if (Math.abs(north - cardAngle) > 0.002) {
        cardAngle = north
        card.setAttribute("transform", `rotate(${((north * 180) / Math.PI).toFixed(2)})`)
      }
      if (Math.abs(blowing - windAngle) > 0.002) {
        windAngle = blowing
        wind.setAttribute("transform", `rotate(${((blowing * 180) / Math.PI).toFixed(2)})`)
      }
    }
  }
}
