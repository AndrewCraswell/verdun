import { describe, expect, it } from "vitest"
import { createCameraRigModel } from "../control/camera-rig-model.ts"
import { lookAt } from "./look-at.ts"

describe("looking at a point from the sector map", () => {
  it("slides the view there at any bearing, and lets go of the soldier", () => {
    for (const yaw of [0, 1, -2.4, Math.PI / 2]) {
      const rig = createCameraRigModel(
        { width: 600, depth: 400 },
        { focusX: 100, focusY: 0, focusZ: 100, distance: 60, yaw, pitch: 1 }
      )
      lookAt(rig, 420, 250)
      for (let frame = 0; frame < 300; frame++) {
        rig.step(1 / 60, () => 0)
      }
      expect(rig.following).toBe(false)
      expect(rig.view.focusX).toBeCloseTo(420, 0)
      expect(rig.view.focusZ).toBeCloseTo(250, 0)
    }
  })
})
