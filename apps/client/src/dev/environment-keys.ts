import {
  clockMoment,
  enqueueCommand,
  type ForecastSpec,
  type Simulation,
  typicalWeather,
  WEEK,
  WeatherPattern
} from "@verdun/sim"
import { debugDock } from "../debug/dock.ts"
import { battleHour, weekLabel } from "../environment/calendar.ts"
import { registerBindings } from "../ui/bindings.ts"

const HOUR = 3_600_000
/** What N steps through: back to the cycle after each pattern held in turn, then snow. */
const HELD = [...Object.values(WeatherPattern), "snow", "cycle"] as const
const PATTERN_NAMES = Object.fromEntries(Object.entries(WeatherPattern).map(([name, value]) => [value, name]))

function heldForecast(
  choice: (typeof HELD)[number],
  wind: { readonly x: number; readonly z: number },
  cycleSeed: number
): ForecastSpec {
  if (choice === "cycle") {
    return { kind: "cycle", seed: cycleSeed }
  }
  if (choice === "snow") {
    const rain = typicalWeather(WeatherPattern.Rain, wind)
    return { kind: "steady", weather: { ...rain, temperature: -2, snowFraction: 1, visibility: 1500 } }
  }
  return { kind: "steady", weather: typicalWeather(choice, wind) }
}

/**
 * Dev keys for the clock and weather: [ and ] move the hour back or forward, Shift with them the week (as the campaign's
 * daily turn will), and N holds each weather pattern in turn and then returns to the cycle. A panel in the debug dock
 * (F3) shows the week, the hour, the date the sky shows, and the weather.
 */
export function installEnvironmentKeys(sim: Simulation, cycleSeed: number): void {
  let held = HELD.length - 1
  const readout = document.createElement("div")
  readout.style.cssText =
    "font:12px/1.4 ui-monospace,monospace;color:#e8e2d0;background:rgba(20,18,14,.6);padding:4px 8px;white-space:pre"
  const dock = debugDock()
  dock.element.append(readout)
  registerBindings({
    title: "Time and weather",
    devOnly: true,
    bindings: [
      { keys: "[ ]", action: "Hour back or forward" },
      { keys: "Shift + [ ]", action: "Week back or forward" },
      { keys: "N", action: "Next weather" }
    ]
  })

  window.addEventListener("keydown", (event) => {
    const { clock } = sim.environment
    if (event.code === "BracketRight" || event.code === "BracketLeft") {
      const step = event.code === "BracketRight" ? 1 : -1
      enqueueCommand(
        sim,
        event.shiftKey ? { type: "clock", week: clock.week + step * WEEK } : { type: "clock", shift: step * HOUR }
      )
    } else if (event.code === "KeyN" && !event.repeat) {
      held = (held + 1) % HELD.length
      enqueueCommand(sim, { type: "forecast", forecast: heldForecast(HELD[held]!, sim.wind, cycleSeed) })
    }
  })

  window.setInterval(() => {
    if (!dock.visible) {
      return
    }
    const { clock, weather, sky, sightRange } = sim.environment
    const skyDate = new Date(clockMoment(clock)).toISOString().slice(0, 10)
    const source = sim.environment.forecast.spec.kind === "cycle" ? "cycle" : "held"
    readout.textContent =
      `${weekLabel(clock.week)}, ${battleHour(clock)}  (sky ${skyDate}, ${clock.minutesPerDay} min/day)\n` +
      `${PATTERN_NAMES[weather.pattern]} (${source})  ${weather.temperature.toFixed(0)}°C  ` +
      `cloud ${(weather.cloudCover * 100).toFixed(0)}%  rain ${weather.precipitation.toFixed(1)} mm/h  ` +
      `wet ${(weather.wetness * 100).toFixed(0)}%\n` +
      `sun ${sky.sun.altitude.toFixed(0)}°  moon ${sky.moon.altitude.toFixed(0)}° ${(sky.moon.phase * 100).toFixed(0)}%  ` +
      `sight ${sightRange >= 1000 ? `${(sightRange / 1000).toFixed(1)} km` : `${sightRange.toFixed(0)} m`}  ` +
      `wind ${Math.sqrt(sim.wind.x ** 2 + sim.wind.z ** 2).toFixed(1)} m/s`
  }, 250)
}
