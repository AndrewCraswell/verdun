import { enqueueCommand, type ForecastSpec, type Simulation, typicalWeather, WeatherPattern } from "@verdun/sim"
import { debugDock } from "../debug/dock.ts"
import { registerBindings } from "../ui/bindings.ts"

const HOUR = 3_600_000
/** What N steps through: back to the cycle after each pattern held in turn, then snow. */
const HELD = [...Object.values(WeatherPattern), "snow", "cycle"] as const
const PATTERN_NAMES = Object.fromEntries(Object.entries(WeatherPattern).map(([name, value]) => [value, name]))

/**
 * French civil time in 1916: GMT, but an hour ahead from 14 June to 1 October, the first summer time. The Germans kept
 * Berlin time, an hour or two ahead of the French all year.
 */
function frenchTime(utc: number): Date {
  const summer = utc >= Date.UTC(1916, 5, 14, 23) && utc < Date.UTC(1916, 9, 1, 23)
  return new Date(utc + (summer ? HOUR : 0))
}

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
 * Dev keys for the clock and weather: [ and ] move the clock an hour back or forward, N holds each weather pattern in
 * turn and then returns to the cycle. A panel in the debug dock (F3) shows the date, time and weather.
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
      { keys: "N", action: "Next weather" }
    ]
  })

  window.addEventListener("keydown", (event) => {
    const { clock } = sim.environment
    if (event.code === "BracketRight" || event.code === "BracketLeft") {
      enqueueCommand(sim, { type: "clock", utc: clock.utc + (event.code === "BracketRight" ? HOUR : -HOUR) })
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
    const time = frenchTime(clock.utc)
    const date = time.toISOString().slice(0, 10)
    const hhmm = time.toISOString().slice(11, 16)
    const source = sim.environment.forecast.spec.kind === "cycle" ? "cycle" : "held"
    readout.textContent =
      `${date} ${hhmm} French time  (${clock.minutesPerDay} min/day)\n` +
      `${PATTERN_NAMES[weather.pattern]} (${source})  ${weather.temperature.toFixed(0)}°C  ` +
      `cloud ${(weather.cloudCover * 100).toFixed(0)}%  rain ${weather.precipitation.toFixed(1)} mm/h  ` +
      `wet ${(weather.wetness * 100).toFixed(0)}%\n` +
      `sun ${sky.sun.altitude.toFixed(0)}°  moon ${sky.moon.altitude.toFixed(0)}° ${(sky.moon.phase * 100).toFixed(0)}%  ` +
      `sight ${sightRange >= 1000 ? `${(sightRange / 1000).toFixed(1)} km` : `${sightRange.toFixed(0)} m`}  ` +
      `wind ${Math.sqrt(sim.wind.x ** 2 + sim.wind.z ** 2).toFixed(1)} m/s`
  }, 250)
}
