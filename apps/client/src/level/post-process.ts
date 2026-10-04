import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent"
import "@babylonjs/core/Rendering/depthRendererSceneComponent"
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect"
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline"
import type { Scene } from "@babylonjs/core/scene"

/**
 * The miniature look: the battlefield seen as a model on a table, sharp where the camera looks and soft nearer and
 * further off, the way a close lens sees a diorama. At the game's oblique angle that's a tilt-shift: a sharp band
 * across the middle of the screen. The further out the camera, the stronger it gets.
 */
const MINIATURE = {
  /** The lens's f-stop at the closest zoom, and at the furthest: lower is a shallower focus. */
  fStop: { near: 4, far: 2 },
  /** Camera distances, metres, between which the f-stop eases from near to far. */
  distance: { near: 15, far: 160 },
  /**
   * Millimetres of focal length per metre of camera distance. No real lens blurs a field 60 m off; a long one scaled
   * with the distance keeps the same shallow, model-like focus at every zoom.
   */
  focalLengthPerMetre: 25
} as const

/**
 * The depth of field reads depth from a map this fraction of the screen's size, a quarter of the pixels to draw: its
 * blur needs depth only roughly.
 */
const DEPTH_MAP_SCALE = 0.5

interface PostProcessOptions {
  /**
   * What the depth map draws, out of what the camera sees. Leave out what lies flat on the ground, such as grass and
   * litter: the ground under it has the same depth, near enough.
   */
  readonly inDepth?: (mesh: AbstractMesh) => boolean
}

export interface PostProcess {
  readonly pipeline: DefaultRenderingPipeline
  /** Keeps the focus on what the camera is looking at. Call once per frame. */
  update(): void
  dispose(): void
}

/**
 * The image after the scene is drawn: multisampled edges, the miniature's depth of field, bloom so flames, flashes and
 * sparks glow, and a little film grain over it all. The scene's colour grade (see atmosphere.ts) runs in the pipeline's
 * image processing pass. Resolves null where the engine can't run it.
 */
export function createPostProcess(
  scene: Scene,
  camera: TargetCamera,
  { inDepth }: PostProcessOptions = {}
): PostProcess | null {
  // The depth renderer the depth of field will use, made first so it's made smaller: the pipeline takes it as it finds it.
  const engine = scene.getEngine()
  const depthMap = scene.enableDepthRenderer(camera).getDepthMap()
  const fit = () =>
    depthMap.resize({
      width: Math.max(1, Math.round(engine.getRenderWidth() * DEPTH_MAP_SCALE)),
      height: Math.max(1, Math.round(engine.getRenderHeight() * DEPTH_MAP_SCALE))
    })
  fit()
  const resized = engine.onResizeObservable.add(fit)
  if (inDepth) {
    const drawn: AbstractMesh[] = []
    depthMap.getCustomRenderList = (_layer, visible, count) => {
      drawn.length = 0
      for (let index = 0; index < count; index++) {
        const mesh = visible?.[index]
        if (mesh && inDepth(mesh)) {
          drawn.push(mesh)
        }
      }
      return drawn
    }
  }
  const pipeline = new DefaultRenderingPipeline("miniature", true, scene, [camera])
  if (!pipeline.isSupported) {
    pipeline.dispose()
    resized.remove()
    return null
  }
  pipeline.samples = 4
  pipeline.imageProcessingEnabled = true

  pipeline.bloomEnabled = true
  // Only what's brighter than lit chalk: flames, flashes and sparks.
  pipeline.bloomThreshold = 1.05
  pipeline.bloomWeight = 0.3
  pipeline.bloomKernel = 48
  pipeline.bloomScale = 0.5

  pipeline.depthOfFieldEnabled = true
  pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Medium

  pipeline.grainEnabled = true
  pipeline.grain.intensity = 7
  pipeline.grain.animated = true

  const { fStop, distance, focalLengthPerMetre } = MINIATURE
  return {
    pipeline,
    update() {
      // Focus for whichever camera is drawing: the player's, or one a dev tool switched to.
      const active = scene.activeCamera
      const viewer = active instanceof TargetCamera ? active : camera
      const range = viewer.position.subtract(viewer.getTarget()).length()
      const zoom = Math.min(1, Math.max(0, (range - distance.near) / (distance.far - distance.near)))
      // Millimetres, as the lens model counts them.
      pipeline.depthOfField.focusDistance = range * 1000
      pipeline.depthOfField.focalLength = range * focalLengthPerMetre
      pipeline.depthOfField.fStop = fStop.near + (fStop.far - fStop.near) * zoom
    },
    dispose() {
      resized.remove()
      pipeline.dispose()
    }
  }
}
