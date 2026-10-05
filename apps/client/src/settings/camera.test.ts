import { describe, expect, it } from "vitest"
import { createCameraSettings, DEFAULT_CAMERA, readCamera } from "./camera.ts"

describe("camera settings", () => {
  it("keeps each within its range, and defaults anything missing or broken", () => {
    expect(readCamera(undefined)).toEqual(DEFAULT_CAMERA)
    expect(readCamera({ edgePan: false, panSpeed: 5, invertDrag: true, aimView: false })).toEqual({
      edgePan: false,
      panSpeed: 2,
      invertDrag: true,
      aimView: false
    })
    expect(readCamera({ edgePan: "no", panSpeed: null, aimView: 1 })).toEqual(DEFAULT_CAMERA)
    // Settings saved before the aim view came keep it on.
    expect(readCamera({ edgePan: false, panSpeed: 1, invertDrag: false }).aimView).toBe(true)
  })

  it("lasts the page without storage", () => {
    const settings = createCameraSettings(null)
    settings.change({ panSpeed: 1.5 })
    expect(settings.current.panSpeed).toBe(1.5)
  })
})
