import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import type { Observer } from "@babylonjs/core/Misc/observable"
import type { Scene } from "@babylonjs/core/scene"

export interface EnabledMeshSelection {
  /** How many meshes Babylon is offered each frame, of the scene's. */
  readonly offered: number
  dispose(): void
}

/**
 * Offers Babylon only the scene's enabled meshes when it chooses what to draw each frame. Left to itself it looks at
 * every mesh, and for each one switched off (the level kit's source pieces, kept to copy from; the props' far versions
 * while near ones show) it still counts vertices and asks whether it's ready before finding it off: some 800 meshes of
 * 1,400, every frame. The list is kept as it is and made again only when a mesh is added, removed, or switched on or
 * off, itself or by an ancestor; Babylon still checks each mesh offered, so a list a moment stale can't show one that's
 * off.
 */
export function selectEnabledMeshes(scene: Scene): EnabledMeshSelection {
  let offered: { data: AbstractMesh[]; length: number } | null = null
  const stale = () => {
    offered = null
  }
  const watched = new Map<AbstractMesh, Observer<boolean>>()
  const watch = (mesh: AbstractMesh) => {
    if (!watched.has(mesh)) {
      watched.set(mesh, mesh.onEffectiveEnabledStateChangedObservable.add(stale))
    }
  }
  for (const mesh of scene.meshes) {
    watch(mesh)
  }
  const added = scene.onNewMeshAddedObservable.add((mesh) => {
    watch(mesh)
    stale()
  })
  const removed = scene.onMeshRemovedObservable.add((mesh) => {
    watched.get(mesh)?.remove()
    watched.delete(mesh)
    stale()
  })
  const babylons = scene.getActiveMeshCandidates
  scene.getActiveMeshCandidates = () => {
    if (!offered) {
      const data = scene.meshes.filter((mesh) => mesh.isEnabled())
      offered = { data, length: data.length }
    }
    return offered
  }
  return {
    get offered() {
      return scene.getActiveMeshCandidates().length
    },
    dispose() {
      scene.getActiveMeshCandidates = babylons
      added.remove()
      removed.remove()
      for (const observer of watched.values()) {
        observer.remove()
      }
      watched.clear()
    }
  }
}
