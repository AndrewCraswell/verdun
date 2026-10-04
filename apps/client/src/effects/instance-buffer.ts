import { Matrix } from "@babylonjs/core/Maths/math.vector"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"

/**
 * A mesh's thin-instance matrices, given to Babylon once and rewritten in place: setting a new buffer every frame
 * remakes it on the GPU, which costs more than drawing what's in it.
 */
export interface InstanceBuffer {
  /** The matrices, 16 numbers each. Write the first `count`, then `commit(count)`. */
  readonly data: Float32Array
  /** Draws the first `count` instances as they now stand in `data`. */
  commit(count: number): void
  /** The instances drawn, as matrices. Babylon's own getter keeps a copy from when the buffer was set, so read this. */
  matrices(): Matrix[]
}

export function instanceBuffer(mesh: Mesh, capacity: number): InstanceBuffer {
  const data = new Float32Array(capacity * 16)
  mesh.thinInstanceSetBuffer("matrix", data, 16, false)
  mesh.thinInstanceCount = 0
  return {
    data,
    commit(count) {
      if (count === 0 && mesh.thinInstanceCount === 0) {
        return
      }
      mesh.thinInstanceCount = count
      mesh.thinInstanceBufferUpdated("matrix")
    },
    matrices() {
      return Array.from({ length: mesh.thinInstanceCount }, (_, index) => Matrix.FromArray(data, index * 16))
    }
  }
}
