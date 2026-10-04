import { describe, expect, it } from "vitest"
import { browserSettingsStore, DEFAULT_SETTINGS, readSettings } from "./interface-settings.ts"

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
    ).toEqual({ scale: 2, effects: 0, backing: 1, vision: "tritanopia", highContrast: true, hints: true })
    expect(readSettings({ vision: "sepia" }).vision).toBe("default")
  })

  it("falls back to the defaults where the browser's storage is out of reach", () => {
    const store = browserSettingsStore("test.interface")
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
    expect(() => store.save({ ...DEFAULT_SETTINGS, scale: 1.25 })).not.toThrow()
  })
})
