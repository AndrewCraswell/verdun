import { describe, expect, it } from "vitest"
import { browserSettingsStore, createSettingsHub, DEFAULT_SETTINGS, readSettings } from "./interface-settings.ts"

describe("interface settings", () => {
  it("keeps each setting within its range and anything missing or broken at its default", () => {
    expect(readSettings(null)).toBe(DEFAULT_SETTINGS)
    expect(readSettings("big")).toBe(DEFAULT_SETTINGS)
    expect(
      readSettings({
        scale: 5,
        effects: -1,
        backing: Number.NaN,
        vision: "tritanopia",
        highContrast: true,
        hints: "no"
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      scale: 2,
      effects: 0,
      backing: 1,
      vision: "tritanopia",
      highContrast: true,
      hints: true
    })
    expect(readSettings({ vision: "sepia" }).vision).toBe("default")
  })

  it("keeps each zone's showing, the clock, the markers' size and each key's hold or toggle", () => {
    const read = readSettings({
      zones: { log: "hidden", sector: "always", fire: "sometimes" },
      clock: "12",
      markers: 9,
      presses: { run: "toggle", grenade: "toggle", prone: 3 }
    })
    expect(read.zones).toEqual({ ...DEFAULT_SETTINGS.zones, log: "hidden", sector: "always" })
    expect(read.clock).toBe("12")
    expect(read.markers).toBe(2)
    expect(read.presses).toEqual({ run: "toggle", crouch: "toggle", prone: "toggle", grenade: "toggle" })
    expect(readSettings({ clock: 12, zones: "none" })).toMatchObject({ clock: "24", zones: DEFAULT_SETTINGS.zones })
    expect(readSettings({ hitChance: false }).hitChance).toBe(false)
    expect(readSettings({ hitChance: "no" }).hitChance).toBe(true)
  })

  it("shares one live value: a change is kept and every listener hears it", () => {
    let saved = DEFAULT_SETTINGS
    const hub = createSettingsHub({ load: () => saved, save: (next) => (saved = next) })
    const heard: number[] = []
    const stop = hub.listen((settings) => heard.push(settings.markers))
    hub.change({ markers: 1.5 })
    stop()
    hub.change({ markers: 1.25 })
    expect(heard).toEqual([1, 1.5])
    expect(saved.markers).toBe(1.25)
    expect(hub.current.markers).toBe(1.25)
  })

  it("falls back to the defaults where the browser's storage is out of reach", () => {
    const store = browserSettingsStore("test.interface")
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
    expect(() => store.save({ ...DEFAULT_SETTINGS, scale: 1.25 })).not.toThrow()
  })
})
