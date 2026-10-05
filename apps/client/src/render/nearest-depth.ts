import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"

/**
 * How near the camera each mesh drawn as thin instances came this frame, in view depth: the near side of the nearest
 * instance drawn. Babylon can't tell, as all of a mesh's instances share one bounding box, so whatever culls them one
 * by one records it (the soldiers' crowd, soldiers/soldier-crowd.ts), and the sun's shadows leave a mesh out of the
 * cascades nearer the camera than its shadows fall (level/atmosphere.ts).
 */
const depths = new WeakMap<AbstractMesh, number>()

/** Records how near the camera a mesh's instances came this frame: infinitely far when none was drawn. */
export function recordNearestDepth(mesh: AbstractMesh, depth: number): void {
  depths.set(mesh, depth)
}

/** How near the camera a mesh's instances came this frame, or infinitely near when nothing has recorded it. */
export function nearestDepth(mesh: AbstractMesh): number {
  return depths.get(mesh) ?? Number.NEGATIVE_INFINITY
}
