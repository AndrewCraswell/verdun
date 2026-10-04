import { Matrix } from "@babylonjs/core/Maths/math.vector"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"

/**
 * Instances are drawn in buckets of this many: a mesh drawing 37 draws 64, the last 27 collapsed to nothing. The
 * number drawn then changes only now and then, which keeps a recorded frame (snapshot rendering) valid for longer,
 * for the cost of a few empty instances.
 */
export const INSTANCE_BUCKET = 32

/** How many instances to draw for this many live ones: rounded up to a whole bucket, no more than there's room for. */
export function drawnCount(count: number, capacity: number): number {
  return Math.min(capacity, Math.ceil(count / INSTANCE_BUCKET) * INSTANCE_BUCKET)
}

/**
 * A mesh's thin-instance matrices, given to Babylon once and rewritten in place: setting a new buffer every frame
 * remakes it on the GPU, which costs more than drawing what's in it. It grows, by setting a bigger buffer, when more
 * instances are wanted than it has room for.
 */
export interface InstanceBuffer {
  /** The matrices, 16 numbers each. Write the first `count`, then `commit(count)`. */
  readonly data: Float32Array
  /** Makes room for at least this many instances, keeping those written. */
  reserve(count: number): void
  /** Draws the first `count` instances as they now stand in `data`. */
  commit(count: number): void
  /** The live instances, as matrices. Babylon's own getter keeps a copy from when the buffer was set, so read this. */
  matrices(): Matrix[]
}

export function instanceBuffer(mesh: Mesh, capacity: number): InstanceBuffer {
  let data = new Float32Array(Math.max(1, capacity) * 16)
  let live = 0
  mesh.thinInstanceSetBuffer("matrix", data, 16, false)
  mesh.thinInstanceCount = 0
  return {
    get data() {
      return data
    },
    reserve(count) {
      if (count * 16 <= data.length) {
        return
      }
      const grown = new Float32Array(Math.max(count, (data.length / 16) * 2) * 16)
      grown.set(data)
      data = grown
      mesh.thinInstanceSetBuffer("matrix", data, 16, false)
    },
    commit(count) {
      const drawn = drawnCount(count, data.length / 16)
      if (drawn === 0 && mesh.thinInstanceCount === 0) {
        live = 0
        return
      }
      // Collapse the bucket's spare instances, and any left over from before, to nothing.
      data.fill(0, count * 16, Math.max(drawn, live) * 16)
      live = count
      if (mesh.thinInstanceCount !== drawn) {
        mesh.thinInstanceCount = drawn
      }
      mesh.thinInstanceBufferUpdated("matrix")
    },
    matrices() {
      return Array.from({ length: live }, (_, index) => Matrix.FromArray(data, index * 16))
    }
  }
}
