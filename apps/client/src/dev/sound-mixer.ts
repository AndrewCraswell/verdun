import { SOUND_CUES } from "../audio/battle-sound-model.ts"
import type { Mixer } from "../audio/mixer.ts"
import { AMBIENCE_FILES } from "../level/ambience.ts"

const WEATHER_AND_LEVEL: readonly string[] = [
  "rain",
  "rain-trench",
  "wind",
  "wire-wind",
  "thunder",
  "night-warm",
  "night-cold",
  "front-roar",
  "fire",
  "crow"
]

/** The panel's groups: what each slider sets, under a heading. */
const GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ["Buses", ["bus:master", "bus:battle", "bus:ambience", "bus:ears", "bus:music"]],
  [
    "Ambience",
    [
      ...AMBIENCE_FILES.filter((name) => !name.startsWith("guns-far")).map((name) => `ambience:${name}`),
      "ambience:guns-far"
    ]
  ],
  [
    "Weather, night and front",
    ["rain", "rain-trench", "wind", "wire-wind", "thunder", "night-warm", "night-cold", "front-roar"]
  ],
  ["Battle", SOUND_CUES.filter((cue) => !WEATHER_AND_LEVEL.includes(cue))],
  ["Level", ["fire", "crow"]]
]
/** Sliders run from silent to four times as loud (+12 dB). */
const TOP = 4

function decibels(level: number): string {
  return level === 0 ? "-inf" : `${level >= 1 ? "+" : ""}${(20 * Math.log10(level)).toFixed(1)} dB`
}

/**
 * Dev builds only: M opens a panel with a slider for every bus, battle sound and ambience bed, and a readout of what
 * is playing. Changes are heard at once and kept between reloads; Copy puts the changed levels on the clipboard (and in
 * a box to select) as the TUNING table in audio/tuning.ts, to ship them.
 */
export function installSoundMixer(mixer: Mixer): void {
  const panel = document.createElement("div")
  panel.style.cssText =
    "position:fixed;top:8px;right:8px;width:320px;max-height:calc(100vh - 16px);overflow:auto;z-index:20;" +
    "background:rgba(20,22,20,0.92);color:#ddd;font:12px system-ui,sans-serif;padding:10px;border-radius:6px;" +
    "display:none"
  const readout = document.createElement("pre")
  readout.style.cssText = "margin:6px 0 0;font:11px ui-monospace,monospace;white-space:pre-wrap;color:#aeb"
  const title = document.createElement("div")
  title.textContent = "Sound mixer (M)"
  title.style.cssText = "font-weight:600;margin-bottom:6px"
  panel.append(title)

  const buttons = document.createElement("div")
  buttons.style.cssText = "display:flex;gap:6px;margin-bottom:8px"
  const copy = document.createElement("button")
  copy.textContent = "Copy settings"
  copy.onclick = () => {
    const text = `const TUNING: Readonly<Record<string, number>> = ${JSON.stringify(mixer.tuning.changed(), null, 2)}`
    exported.value = text
    exported.style.display = "block"
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    copy.textContent = "Copied"
    setTimeout(() => (copy.textContent = "Copy settings"), 1200)
  }
  const reset = document.createElement("button")
  reset.textContent = "Reset all"
  buttons.append(copy, reset)
  // The copied settings, to select by hand where the clipboard is refused.
  const exported = document.createElement("textarea")
  exported.readOnly = true
  exported.style.cssText = "display:none;width:100%;height:80px;font:11px ui-monospace,monospace;margin-bottom:6px"
  panel.append(buttons, exported)

  const sliders = new Map<string, { input: HTMLInputElement; value: HTMLSpanElement }>()
  for (const [heading, names] of GROUPS) {
    const header = document.createElement("div")
    header.textContent = heading
    header.style.cssText = "margin:8px 0 2px;color:#9a9;text-transform:uppercase;font-size:10px;letter-spacing:0.05em"
    panel.append(header)
    for (const name of names) {
      const row = document.createElement("label")
      row.style.cssText = "display:grid;grid-template-columns:110px 1fr 62px;gap:6px;align-items:center"
      const label = document.createElement("span")
      label.textContent = name.replace(/^(bus|ambience):/, "")
      const input = document.createElement("input")
      input.type = "range"
      input.min = "0"
      input.max = String(TOP)
      input.step = "0.01"
      const value = document.createElement("span")
      value.style.textAlign = "right"
      input.oninput = () => mixer.tuning.set(name, Number(input.value))
      row.append(label, input, value)
      panel.append(row)
      sliders.set(name, { input, value })
    }
  }
  reset.onclick = () => {
    for (const name of sliders.keys()) {
      mixer.tuning.set(name, 1)
    }
  }
  const show = (name: string) => {
    const slider = sliders.get(name)
    if (slider) {
      const level = mixer.tuning.level(name)
      slider.input.value = String(level)
      slider.value.textContent = decibels(level)
    }
  }
  for (const name of sliders.keys()) {
    show(name)
  }
  mixer.tuning.onChange(show)
  panel.append(readout)
  document.body.append(panel)

  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyM" && !event.repeat && !(event.target instanceof HTMLInputElement)) {
      panel.style.display = panel.style.display === "none" ? "block" : "none"
    }
  })
  setInterval(() => {
    if (panel.style.display === "none") {
      return
    }
    const now = mixer.context.currentTime
    const lines = mixer.recent
      .filter((played) => played.at <= now)
      .slice(-14)
      .reverse()
      .map(
        (played) =>
          `${(now - played.at).toFixed(1).padStart(5)}s ago  ${played.name.padEnd(15)} ${decibels(played.volume)}`
      )
    readout.textContent = `${mixer.sounding} battle sounds playing, audio ${mixer.context.state}\n${lines.join("\n")}`
  }, 250)
}
