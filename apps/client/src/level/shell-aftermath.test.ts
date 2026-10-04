import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
import { type BurstEvent, Shell } from "@verdun/sim"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createScorchMap } from "./scorch-map.ts"
import { createShellAftermath } from "./shell-aftermath.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function setup() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const map = {
    ...createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 2),
    scenery: [{ kind: "tree" as const, x: 75, z: 75, heading: 0, variant: 0, scale: 1 }]
  }
  const camera = new ArcRotateCamera("camera", 0, 1, 60, new Vector3(50, 2, 50), scene)
  const sprite = new Texture(null, scene)
  const scorch = createScorchMap(scene, 100, 100)
  vi.spyOn(scorch, "scorch")
  vi.spyOn(scorch, "update")
  const aftermath = createShellAftermath(
    scene,
    map,
    camera,
    { mist: sprite, fire: sprite, ember: sprite, scorch: sprite },
    scorch,
    () => ({ x: 2, z: 0 })
  )
  return { aftermath, camera, scorch }
}

const burst = (shell: Shell, x: number, z: number, y = 2): BurstEvent => ({
  type: "burst",
  shell,
  at: { x, y, z },
  crater: null
})

describe("createShellAftermath", () => {
  it("blackens the ground, leaves smoke hanging and throws out earth where a shell lands", () => {
    const { aftermath, scorch } = setup()

    aftermath.burst(burst(Shell.HeavyHighExplosive, 40, 40), () => 0.9)

    expect(scorch.scorch).toHaveBeenCalledWith(40, 40, expect.any(Number), expect.any(Function))
    expect(aftermath.smoke.manualEmitCount).toBeGreaterThan(5)
    expect(aftermath.clods.manualEmitCount).toBeGreaterThan(20)
    expect(aftermath.fires).toHaveLength(0)
  })

  it("leaves no scorch or thrown earth for shrapnel bursting in the air", () => {
    const { aftermath, scorch } = setup()

    aftermath.burst(burst(Shell.FieldShrapnel, 40, 40, 14), () => 0.9)

    expect(scorch.scorch).not.toHaveBeenCalled()
    expect(aftermath.clods.manualEmitCount).toBe(0)
    expect(aftermath.smoke.manualEmitCount).toBeGreaterThan(0)
  })

  it("starts fires now and then, likelier where there's timber, and lets them burn out with sparks", () => {
    const { aftermath } = setup()

    // A roll of 0.2 lights nothing in open ground but catches beside the tree.
    aftermath.burst(burst(Shell.HeavyHighExplosive, 20, 20), () => 0.2)
    expect(aftermath.fires).toHaveLength(0)
    aftermath.burst(burst(Shell.HeavyHighExplosive, 75, 75), () => 0.2)
    expect(aftermath.fires).toHaveLength(1)

    const random = vi.spyOn(Math, "random").mockReturnValue(0)
    aftermath.update(1.5)
    expect(aftermath.embers.manualEmitCount).toBeGreaterThan(0)
    random.mockRestore()
    for (let second = 0; second < 100; second++) {
      aftermath.update(1)
    }
    expect(aftermath.fires).toHaveLength(0)
  })

  it("jolts the camera for a near burst, not a far one, and settles", () => {
    const { aftermath, camera, scorch } = setup()

    aftermath.burst(burst(Shell.FieldHighExplosive, 500, 500), () => 0.9)
    aftermath.update(0.016)
    const far = camera.targetScreenOffset.length()
    aftermath.burst(burst(Shell.HeavyHighExplosive, 52, 50), () => 0.9)
    aftermath.update(0.016)

    expect(camera.targetScreenOffset.length()).toBeGreaterThan(far * 10)
    expect(scorch.update).toHaveBeenCalled()
    aftermath.update(2)
    expect(camera.targetScreenOffset.length()).toBe(0)
    aftermath.dispose()
  })
})
