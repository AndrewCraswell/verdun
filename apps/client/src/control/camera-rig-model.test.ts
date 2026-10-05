import { describe, expect, it } from "vitest"
import { createCameraRigModel, pitchForDistance, type RigView, ZOOM_RANGE } from "./camera-rig-model.ts"

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

/** The lens the tests see through: Babylon's usual field of view on a 16:9 screen. */
const lens = { fov: 0.8, aspect: 16 / 9 }
/** How far the ground runs from the middle of the screen to its right edge, at the focus, per metre of zoom. */
const halfAcross = Math.tan(lens.fov / 2) * lens.aspect

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
    expect(settled.focusZ).toBeCloseTo(220, 1)
    expect(model.following).toBe(true)
  })

  it("leans a third of the way from the soldier to the ground under the pointer, settling rather than chasing", () => {
    const model = createCameraRigModel(bounds, start)
    model.setLens(lens)
    model.follow(300, 200)
    // Looking north (yaw -90°): the screen's right is +x. The pointer at the right edge, level with the middle.
    model.setPointer({ right: 1, up: 0 })
    const first = model.step(1 / 60, flat)
    expect(first.focusX).toBeGreaterThan(300)
    const leaning = settle(model, 6)
    // The ground under the right edge is half the screen's width of ground right of the middle; the middle sits a
    // third of the way from him to it.
    const underPointer = leaning.focusX + 60 * halfAcross
    expect(leaning.focusX - 300).toBeCloseTo((underPointer - 300) / 3, 1)
    expect(leaning.focusZ).toBeCloseTo(200, 1)
    expect(settle(model, 4)).toEqual(leaning)

    // Toward the top of the screen it leans ahead, the way the view looks.
    model.setPointer({ right: 0, up: 0.8 })
    const ahead = settle(model, 6)
    expect(ahead.focusZ).toBeGreaterThan(210)
    expect(ahead.focusX).toBeCloseTo(300, 1)

    model.setPointer(null)
    const released = settle(model, 6)
    expect(released.focusX).toBeCloseTo(300, 1)
    expect(released.focusZ).toBeCloseTo(200, 1)
  })

  it("never leans further than about a third of the ground the screen shows across", () => {
    const model = createCameraRigModel(bounds, { ...start, distance: 10, pitch: pitchForDistance(10) })
    model.setLens(lens)
    model.follow(300, 200)
    // Close in and tilted toward the horizon, the top of the screen looks far out over the ground.
    model.rotate(0, 1)
    model.setPointer({ right: 0, up: 1 })
    const view = settle(model, 6)
    const across = 2 * 10 * halfAcross
    expect(Math.hypot(view.focusX - 300, view.focusZ - 200)).toBeCloseTo(0.35 * across, 1)
  })

  it("doesn't lean, nor take the view back, once the player has panned away", () => {
    const model = createCameraRigModel(bounds, start)
    model.follow(300, 200)
    model.setPan(1, 0)
    const panned = settle(model, 1)
    model.setPan(0, 0)
    expect(model.following).toBe(false)

    model.setPointer({ right: -1, up: 0 })
    expect(model.following).toBe(false)
    const still = settle(model, 2)
    expect(still.focusX).toBeGreaterThan(panned.focusX)
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
    expect(back.focusZ).toBeCloseTo(200, 1)
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

  it("looks down at about 55° wherever a soldier is played from, tipping over toward a map far out", () => {
    for (const distance of [16, 25, 35, 60, 90]) {
      expect(pitchForDistance(distance)).toBeCloseTo(0.61, 2)
    }
    // No lower than 45° above the horizon until the zoom is under 12 m.
    expect(pitchForDistance(12)).toBeLessThanOrEqual(Math.PI / 4)
    expect(pitchForDistance(ZOOM_RANGE.min)).toBeGreaterThan(pitchForDistance(12))
    expect(pitchForDistance(150)).toBeLessThan(0.61)
    expect(pitchForDistance(ZOOM_RANGE.max)).toBeCloseTo(0.5, 2)
  })

  it("tilts within the player's range either side of the zoom's angle, and turns", () => {
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
    // A ridge 60 m high behind the camera, south of the focus.
    const ridge = (_x: number, z: number) => (z < 180 ? 60 : 0)
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
    expect(settled.focusZ).toBe(220)
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

  it("rises to look down along the gun's arc while manning a machine gun, and comes back down after", () => {
    const model = createCameraRigModel(bounds, { ...start, distance: 20, pitch: pitchForDistance(20) })
    model.follow(300, 200)
    model.setGunView(true)
    const manning = settle(model, 3)
    expect(manning.distance).toBeCloseTo(45, 0)
    expect(manning.pitch).toBeGreaterThan(pitchForDistance(20) + 0.1)

    model.setGunView(false)
    const left = settle(model, 3)
    expect(left.distance).toBeCloseTo(20, 0)
    expect(left.pitch).toBeCloseTo(pitchForDistance(20), 2)
  })
})
