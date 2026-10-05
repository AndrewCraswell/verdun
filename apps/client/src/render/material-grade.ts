import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration"
import type { Material } from "@babylonjs/core/Materials/material"
import type { Scene } from "@babylonjs/core/scene"

/** A material that takes an image processing configuration: Babylon's standard, PBR and node materials. */
interface Graded {
  imageProcessingConfiguration: ImageProcessingConfiguration
}

const isGraded = (material: Material): material is Material & Graded => "imageProcessingConfiguration" in material

export interface MaterialGrade {
  /** Puts every material back on the scene's image processing. */
  dispose(): void
}

/**
 * Keeps the colour grade's changes from reaching every material. While the post-processing pipeline grades the picture
 * (the scene's image processing `applyByPostProcess`), a material's shader reads only whether the grade is on and done
 * after it, and whether to clamp its colour; yet Babylon tells every material of every change to the scene's image
 * processing, and each then walks every mesh in the scene to mark its sub-meshes for checking again when next drawn. At
 * night the grade's exposure changes each frame a flare tints the fog (see `level/atmosphere.ts`): with some 90
 * materials and 1,500 meshes that came to 28 ms a frame. Here materials take a configuration of their own, which copies
 * just those flags from the scene's and so changes only when they do. Whenever the pipeline isn't grading the picture,
 * materials apply the grade themselves and go back to the scene's.
 */
export function quietMaterialGrade(scene: Scene): MaterialGrade {
  const grade = scene.imageProcessingConfiguration
  const quiet = new ImageProcessingConfiguration()
  quiet.applyByPostProcess = true
  const copy = () => {
    quiet.isEnabled = grade.isEnabled
    quiet.skipFinalColorClamp = grade.skipFinalColorClamp
  }
  let byPipeline = grade.applyByPostProcess
  const point = (material: Material) => {
    const wanted = byPipeline ? quiet : grade
    // Babylon's setter marks the material's meshes for checking even when the configuration is the one it has.
    if (isGraded(material) && material.imageProcessingConfiguration !== wanted) {
      material.imageProcessingConfiguration = wanted
    }
  }
  const pointAll = () => {
    for (const material of scene.materials) {
      point(material)
    }
  }
  copy()
  pointAll()
  // Babylon announces a new material a moment after it's made, once its constructor has tied it to the scene's
  // configuration: it's taken in then, if it's still in the scene.
  const added = scene.onNewMaterialAddedObservable.add((material) => {
    if (scene.materials.includes(material)) {
      point(material)
    }
  })
  const changed = grade.onUpdateParameters.add(() => {
    copy()
    if (grade.applyByPostProcess !== byPipeline) {
      byPipeline = grade.applyByPostProcess
      pointAll()
    }
  })
  return {
    dispose() {
      added.remove()
      changed.remove()
      byPipeline = false
      pointAll()
    }
  }
}
