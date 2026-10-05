import { describe, expect, it } from "vitest"
import { createCameraRigModel, lookAhead, pitchForDistance, type RigView, ZOOM_RANGE } from "./camera-rig-model.ts"

const flat = () => 0
const bounds = { width: 600, depth: 400 }
const start: RigView = {
  focusX: 300,
  focusY: 1.2,
  focusZ: 200,
  distance: 60,
  yaw: -Math.PI / 2,
  pitch: pitchForDistance(60)
}

/** Close in, the view looks this far past the soldier, north (+z) in these tests' view. */
const ahead = lookAhead(60)

function settle(
  model: ReturnType<typeof createCameraRigModel>,
  seconds: number,
  ground: (x: number, z: number) => number = flat,
  fps = 60
) {
  for (let frame = 0; frame < seconds * fps; frame++) {
    model.step(1 / fps, ground)
  }
  return model.view
}

describe("camera rig", () => {
  it("follows the soldier under control, easing after them rather than snapping", () => {
    const model = createCameraRigModel(bounds, start)
    model.follow(320, 220)
    const first = model.step(1 / 60, flat)

    expect(first.focusX).toBeGreaterThan(300)
    expect(first.focusX).toBeLessThan(310)
    const settled = settle(model, 4)
    expect(settled.focusX).toBeCloseTo(320, 1)
    expect(settled.focusZ).toBeCloseTo(220 + ahead, 1)
    expect(model.following).toBe(true)
  })

  it("leads a soldier a little the way he walks, and centres on him when he stops", () => {
    const model = createCameraRigModel(bounds, start)
    model.follow(300, 200, { x: 0, z: 1 })
    const walking = settle(model, 4)
    // 12% of the 60 m zoom ahead of him.
    expect(walking.focusX).toBeCloseTo(300, 1)
    expect(walking.focusZ).toBeCloseTo(200 + 0.12 * 60 + ahead, 0)

    model.setDistance(400)
    expect(settle(model, 4).focusZ).toBeCloseTo(200 + 20, 0)

    model.follow(300, 200)
    // Pulled back to a map view, it no longer looks past him.
    expect(settle(model, 4).focusZ).toBeCloseTo(200, 0)
  })

  it("leans toward the pointer while aiming, by where it sits on the screen, and comes back when the aim is let go", () => {
    const model = createCameraRigModel(bounds, start)
    model.follow(300, 200)
    // Looking north (yaw -90°): the screen's top is +z, its right +x. The pointer halfway to the top right corner.
    model.setAim({ right: 0.5, up: 0.5 })
    const first = model.step(1 / 60, flat)
    expect(first.focusX).toBeGreaterThan(300)
    expect(first.focusZ).toBeGreaterThan(200)
    // Settles at 45% of the zoom per unit of screen: the view moving doesn't move the lean.
    const leaning = settle(model, 4)
    expect(leaning.focusX).toBeCloseTo(300 + 0.5 * 0.45 * 60, 0)
    expect(leaning.focusZ).toBeCloseTo(200 + 0.5 * 0.45 * 60 + ahead, 0)
    expect(settle(model, 4)).toEqual(leaning)

    model.setAim({ right: 0, up: 2 })
    expect(settle(model, 4).focusZ).toBeCloseTo(200 + 0.45 * 60 + ahead, 0)

    model.setAim(null)
    const released = settle(model, 4)
    expect(released.focusX).toBeCloseTo(300, 0)
    expect(released.focusZ).toBeCloseTo(200 + ahead, 0)
  })

  it("goes back to the soldier when the player aims after panning away", () => {
    const model = createCameraRigModel(bounds, start)
    model.follow(300, 200)
    model.setPan(1, 0)
    settle(model, 1)
    model.setPan(0, 0)
    expect(model.following).toBe(false)

    model.setAim({ right: 0, up: 0 })
    expect(model.following).toBe(true)
    expect(settle(model, 3).focusX).toBeCloseTo(300, 0)
  })

  it("pans freely with held keys, letting go of the soldier, and recentring brings it back", () => {
    const model = createCameraRigModel(bounds, start)
    model.follow(300, 200)
    // Looking north (yaw -90°): forward is +z, right is +x.
    model.setPan(0, 1)
    const panned = settle(model, 1)

    expect(model.following).toBe(false)
    expect(panned.focusZ).toBeGreaterThan(215)
    expect(Math.abs(panned.focusX - 300)).toBeLessThan(0.5)
    model.setPan(1, 0)
    expect(settle(model, 0.5).focusX).toBeGreaterThan(305)

    model.setPan(0, 0)
    model.recenter()
    const back = settle(model, 4)
    expect(back.focusX).toBeCloseTo(300, 1)
    expect(back.focusZ).toBeCloseTo(200 + ahead, 1)
  })

  it("pans faster the further back it is, so it feels the same at any zoom", () => {
    const near = createCameraRigModel(bounds, start)
    const far = createCameraRigModel(bounds, { ...start, distance: 240, pitch: pitchForDistance(240) })
    for (const model of [near, far]) {
      model.setPan(0, 1)
    }

    expect(settle(far, 0.3).focusZ - 200).toBeGreaterThan(3 * (settle(near, 0.3).focusZ - 200))
  })

  it("pans at the player's speed, and back to the usual for a nonsense one", () => {
    const usual = createCameraRigModel(bounds, start)
    const quick = createCameraRigModel(bounds, start)
    quick.setPanSpeed(2)
    for (const model of [usual, quick]) {
      model.setPan(0, 1)
    }
    const gone = (model: typeof usual) => settle(model, 0.5).focusZ - 200
    expect(gone(quick)).toBeCloseTo(2 * gone(usual), 0)
    quick.setPanSpeed(Number.NaN)
    quick.setPan(0, 0)
  })

  it("drags the ground with a grab, and stays within the map", () => {
    const model = createCameraRigModel(bounds, start)
    model.drag(10, -5)
    const dragged = settle(model, 2)

    expect(dragged.focusX).toBeCloseTo(310, 1)
    expect(dragged.focusZ).toBeCloseTo(195, 1)
    model.drag(1000, 1000)
    const edge = settle(model, 3)
    expect(edge.focusX).toBeCloseTo(600, 0)
    expect(edge.focusZ).toBeCloseTo(400, 0)
  })

  it("zooms toward the point under the pointer when free, and about the soldier when following", () => {
    const free = createCameraRigModel(bounds, start)
    free.drag(0.001, 0)
    free.zoom(-4, { x: 340, z: 200 })
    const zoomed = settle(free, 2)

    expect(zoomed.distance).toBeCloseTo(60 / 1.12 ** 4, 1)
    expect(zoomed.focusX).toBeGreaterThan(310)

    const following = createCameraRigModel(bounds, start)
    following.follow(300, 200)
    following.zoom(-4, { x: 340, z: 200 })
    expect(settle(following, 2).focusX).toBeCloseTo(300, 1)

    following.zoom(100)
    expect(settle(following, 3).distance).toBeCloseTo(ZOOM_RANGE.max, 0)
    following.setDistance(1)
    expect(settle(following, 3).distance).toBeCloseTo(ZOOM_RANGE.min, 0)
  })

  it("tips toward overhead as it pulls back and toward the ground close in, within the player's tilt", () => {
    expect(pitchForDistance(ZOOM_RANGE.min)).toBeGreaterThan(pitchForDistance(ZOOM_RANGE.max) + 0.5)
    const model = createCameraRigModel(bounds, start)
    model.rotate(0.5, 10)
    const tilted = settle(model, 2)

    expect(tilted.yaw).toBeCloseTo(-Math.PI / 2 + 0.5, 2)
    expect(tilted.pitch).toBeCloseTo(pitchForDistance(60) + 0.3, 2)
    model.setTurn(1)
    expect(settle(model, 1).yaw).toBeGreaterThan(tilted.yaw + 1)
  })

  it("never puts the camera under the ground: it climbs over a hill behind it", () => {
    const model = createCameraRigModel(bounds, start)
    // A ridge 40 m high behind the camera, south of the focus.
    const ridge = (_x: number, z: number) => (z < 180 ? 40 : 0)
    const view = settle(model, 2, ridge)
    const back = view.distance * Math.sin(view.pitch)
    const cameraY = view.focusY + view.distance * Math.cos(view.pitch)

    expect(cameraY).toBeGreaterThanOrEqual(ridge(0, view.focusZ + Math.sin(view.yaw) * back) + 2.4)
    expect(view.pitch).toBeLessThan(pitchForDistance(60))
  })

  it("comes to a dead stop once it's arrived, rather than creeping on", () => {
    const model = createCameraRigModel(bounds, start)
    model.follow(320, 220)
    const settled = settle(model, 5)
    const after = model.step(1 / 60, flat)

    expect(settled.focusX).toBe(320)
    expect(settled.focusZ).toBe(220 + ahead)
    expect(after).toEqual(settled)
  })

  it("moves the same at any frame rate", () => {
    const slow = createCameraRigModel(bounds, start)
    const fast = createCameraRigModel(bounds, start)
    for (const model of [slow, fast]) {
      model.follow(350, 260)
      model.zoom(3)
    }
    const atThirty = settle(slow, 0.5, flat, 30)
    const atOneFortyFour = settle(fast, 0.5, flat, 144)

    expect(atThirty.focusX).toBeCloseTo(atOneFortyFour.focusX, 0)
    expect(atThirty.distance).toBeCloseTo(atOneFortyFour.distance, 0)
  })

  it("looks past the soldier close in, fading out as it pulls back to a map view", () => {
    expect(lookAhead(ZOOM_RANGE.min)).toBeCloseTo(0.3 * ZOOM_RANGE.min)
    expect(lookAhead(60)).toBeGreaterThan(5)
    expect(lookAhead(120)).toBe(0)
    expect(lookAhead(ZOOM_RANGE.max)).toBe(0)
  })
})
