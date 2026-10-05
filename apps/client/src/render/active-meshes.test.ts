import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
import { selectEnabledMeshes } from "./active-meshes.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function scene() {
  const engine = new NullEngine()
  engines.push(engine)
  return new Scene(engine)
}

const offeredNames = (target: Scene) =>
  Array.from(
    target.getActiveMeshCandidates().data.slice(0, target.getActiveMeshCandidates().length),
    (mesh) => mesh.name
  )

describe("offering Babylon only the enabled meshes", () => {
  it("leaves out meshes switched off, and follows them as they're switched on and off", () => {
    const target = scene()
    const shown = CreateBox("shown", {}, target)
    const source = CreateBox("kit-source", {}, target)
    source.setEnabled(false)
    const selection = selectEnabledMeshes(target)

    expect(offeredNames(target)).toEqual(["shown"])
    source.setEnabled(true)
    expect(offeredNames(target)).toEqual(["shown", "kit-source"])
    shown.setEnabled(false)
    expect(offeredNames(target)).toEqual(["kit-source"])
    expect(selection.offered).toBe(1)
  })

  it("follows an ancestor switched off, and meshes added and removed", () => {
    const target = scene()
    const parent = new TransformNode("far", target)
    const child = CreateBox("far-piece", {}, target)
    child.parent = parent
    selectEnabledMeshes(target)
    expect(offeredNames(target)).toEqual(["far-piece"])

    parent.setEnabled(false)
    expect(offeredNames(target)).toEqual([])
    parent.setEnabled(true)
    const late = CreateBox("late", {}, target)
    expect(offeredNames(target)).toEqual(["far-piece", "late"])
    late.dispose()
    expect(offeredNames(target)).toEqual(["far-piece"])
  })

  it("hands back Babylon's own choice when done, and the scene still renders", () => {
    const target = scene()
    const camera = new FreeCamera("eye", new Vector3(0, 0, -10), target)
    camera.setTarget(Vector3.Zero())
    CreateBox("box", {}, target)
    CreateBox("source", {}, target).setEnabled(false)
    const babylons = target.getActiveMeshCandidates
    const selection = selectEnabledMeshes(target)
    target.render()

    expect(
      Array.from(target.getActiveMeshes().data.slice(0, target.getActiveMeshes().length), (mesh) => mesh.name)
    ).toEqual(["box"])
    selection.dispose()

    expect(target.getActiveMeshCandidates).toBe(babylons)
  })
})
