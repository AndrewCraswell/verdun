import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { quietMaterialGrade } from "./material-grade.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** A scene graded by a pipeline, as post-process.ts has it, with a box in view under a material of its own. */
function graded() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  new FreeCamera("camera", new Vector3(0, 0, -5), scene).setTarget(Vector3.Zero())
  scene.imageProcessingConfiguration.applyByPostProcess = true
  const box = CreateBox("box", {}, scene)
  box.material = new StandardMaterial("box", scene)
  return { scene, box, grade: scene.imageProcessingConfiguration }
}

/** Draws until the box's material is ready, and returns its shader defines. */
async function drawn(scene: Scene, box: ReturnType<typeof graded>["box"]) {
  await vi.waitFor(() => {
    scene.render()
    expect(box.subMeshes[0]?.materialDefines?.isDirty).toBe(false)
  })
  return box.subMeshes[0]?.materialDefines
}

describe("keeping the grade's changes from every material", () => {
  it("leaves the materials as they were when the exposure changes, as the night's does each frame", async () => {
    const { scene, box, grade } = graded()
    const unquiet = graded()
    quietMaterialGrade(scene)
    const defines = await drawn(scene, box)
    const unquietDefines = await drawn(unquiet.scene, unquiet.box)

    grade.exposure = 1.3
    unquiet.grade.exposure = 1.3

    // Babylon marks a material on the scene's grade for checking again; the shader is the same either way.
    expect(unquietDefines?.isDirty).toBe(true)
    expect(defines?.isDirty).toBe(false)
    expect(defines?.IMAGEPROCESSINGPOSTPROCESS).toBe(true)
    expect(defines?.EXPOSURE).toBe(false)
  })

  it("takes in a material made later, once Babylon tells of it", async () => {
    const { scene, grade } = graded()
    quietMaterialGrade(scene)
    const later = new StandardMaterial("later", scene)
    const gone = new StandardMaterial("gone", scene)
    gone.dispose()

    expect(later.imageProcessingConfiguration).toBe(grade)
    await vi.waitFor(() => expect(later.imageProcessingConfiguration).not.toBe(grade))
    expect(later.imageProcessingConfiguration.applyByPostProcess).toBe(true)
    // One disposed by then is left alone, rather than tied to a configuration that would keep it.
    expect(gone.imageProcessingConfiguration).toBe(grade)
  })

  it("follows the grade being switched off, and puts the materials back on it once the pipeline stops applying it", () => {
    const { scene, box, grade } = graded()
    const quiet = quietMaterialGrade(scene)
    const material = box.material
    if (!(material instanceof StandardMaterial)) {
      throw new Error("the box should have a standard material")
    }

    grade.isEnabled = false
    expect(material.imageProcessingConfiguration.isEnabled).toBe(false)
    grade.isEnabled = true
    // Without the pipeline, a material applies the grade itself, so it needs the scene's.
    grade.applyByPostProcess = false
    expect(material.imageProcessingConfiguration).toBe(grade)
    grade.applyByPostProcess = true
    expect(material.imageProcessingConfiguration).not.toBe(grade)
    quiet.dispose()
    expect(material.imageProcessingConfiguration).toBe(grade)
  })
})
