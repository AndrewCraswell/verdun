import { VertexBuffer } from "@babylonjs/core/Buffers/buffer"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Geometry } from "@babylonjs/core/Meshes/geometry"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { SubMesh } from "@babylonjs/core/Meshes/subMesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"

/** A kit piece placed on the battlefield, with the world matrix it's drawn with. */
export interface PlacedPiece {
  readonly piece: string
  readonly world: Matrix
  readonly position: Vector3
}

/** One kit piece's placements in one cell of the map, drawn as thin instances of a mesh sharing the piece's geometry. */
export interface SceneryBatch {
  readonly piece: string
  /** The piece at full detail. */
  readonly mesh: Mesh
  /** The kit's far copy of the piece with the same instances, drawn instead beyond `farDistance`; null if it has none. */
  readonly far: Mesh | null
}

export interface SceneryBatches {
  readonly batches: readonly SceneryBatch[]
  /** Placed pieces within `radius` metres of (x, z), measured on the ground. */
  near(x: number, z: number, radius: number): PlacedPiece[]
  /** Stops drawing a placed piece. */
  remove(placed: PlacedPiece): void
  /** Draws a placed piece, or doesn't, keeping it in its place to draw again: the wire as it's cut and mended. */
  show(placed: PlacedPiece, shown: boolean): void
  /** Places another piece, batched with its kind nearby; null when the kit lacks the piece. */
  add(piece: string, world: Matrix): PlacedPiece | null
  /**
   * Draws each batch at the detail the camera's distance calls for, or not at all: measured to the batch's nearest
   * point, so pieces near the camera always draw. Call once a frame, before the scene picks what's visible.
   */
  update(eye: Vector3): void
  dispose(): void
}

/** A kit piece placed this many times or fewer goes in one batch for the whole map. */
const RARE = 48
/** Otherwise its batches cover square cells this many metres on a side. */
const CELL = 128
/** The index for finding pieces near a point buckets them in cells this many metres on a side. */
const INDEX_CELL = 8
/** A removed piece's matrix: scaled to nothing where it stood, so its batch's bounds stay put. */
const GONE = Matrix.Scaling(0, 0, 0)
/** Empty slots a batch of debris keeps for pieces shellfire throws down, so adding one doesn't remake its buffers. */
const SPARE = 8
/**
 * A batch switches back to the detail it left only once the camera is this much nearer than where it switched away,
 * a share of the distance and at least `HYSTERESIS.least` metres, so a near burst shaking the camera doesn't flick it
 * back and forth. Each switch changes what's drawn, which costs a recorded frame (snapshot rendering) its replay.
 */
const HYSTERESIS = { share: 0.08, least: 4 } as const

interface Slot extends PlacedPiece {
  readonly batch: Batch
  readonly index: number
}

interface Batch extends SceneryBatch {
  readonly drawDistance: number
  readonly farDistance: number
  readonly min: Vector3
  readonly max: Vector3
  /** The matrices the mesh draws, sixteen floats each; the far copy draws a copy of them. */
  matrices: Float32Array
  /** Slots holding a piece: the rest are spare, scaled to nothing. */
  used: number
  /** Spare slots the batch keeps when it grows. */
  readonly spare: number
  /** Which of mesh and far copy is drawing now: 0 neither, 1 the mesh, 2 the far copy. */
  showing: 0 | 1 | 2
}

/** Options for batching. */
interface BatchOptions {
  /** Beyond these distances from the camera, in metres, by piece, a piece isn't drawn. */
  readonly drawDistances?: Readonly<Record<string, number>>
  /** Pieces shellfire throws down as it goes (see battle-damage.ts): their batches keep spare slots for them. */
  readonly debris?: ReadonlySet<string>
}

/**
 * A mesh drawing a source's geometry and material, shared, not copied. Babylon keeps a mesh's thin instances in its
 * Geometry, so meshes sharing one would draw each other's: each gets a Geometry of its own over the source's buffers.
 */
function sharing(source: Mesh, name: string): Mesh {
  const scene = source.getScene()
  const mesh = new Mesh(name, scene)
  const shared = source.geometry
  if (shared) {
    const own = new Geometry(Geometry.RandomId(), scene)
    const vertices = shared.getTotalVertices()
    for (const kind of shared.getVerticesDataKinds()) {
      const buffer = shared.getVertexBuffer(kind)
      if (buffer && !buffer.getIsInstanced()) {
        const view = new VertexBuffer(scene.getEngine(), buffer.getWrapperBuffer(), kind, {
          stride: buffer.byteStride,
          offset: buffer.byteOffset,
          size: buffer.getSize(),
          type: buffer.type,
          normalized: buffer.normalized,
          useBytes: true
        })
        own.setVerticesBuffer(view, vertices)
      }
    }
    const indices = shared.getIndexBuffer()
    if (indices) {
      // Each geometry releases the index buffer when disposed: count this one's hold on it.
      indices.references++
      own.setIndexBuffer(indices, vertices, shared.getTotalIndices(), indices.is32Bits)
    }
    own.applyToMesh(mesh)
  }
  mesh.material = source.material
  if (source.subMeshes.length > 1) {
    mesh.subMeshes = []
    for (const sub of source.subMeshes) {
      SubMesh.AddToMesh(sub.materialIndex, sub.verticesStart, sub.verticesCount, sub.indexStart, sub.indexCount, mesh)
    }
  }
  mesh.isPickable = false
  mesh.doNotSyncBoundingInfo = true
  mesh.freezeWorldMatrix()
  return mesh
}

function instanced(mesh: Mesh, matrices: Float32Array): Mesh {
  // Not static: shellfire changes batches now and then (see remove and add).
  mesh.thinInstanceSetBuffer("matrix", matrices, 16, false)
  mesh.thinInstanceRefreshBoundingInfo(false)
  return mesh
}

/** A threshold's margin: how much nearer than it the camera must come to switch back. */
function margin(distance: number): number {
  return Math.max(HYSTERESIS.least, distance * HYSTERESIS.share)
}

/** Squared distance from a point to a box. */
function distanceSquaredToBox(point: Vector3, min: Vector3, max: Vector3): number {
  const dx = Math.max(min.x - point.x, 0, point.x - max.x)
  const dy = Math.max(min.y - point.y, 0, point.y - max.y)
  const dz = Math.max(min.z - point.z, 0, point.z - max.z)
  return dx * dx + dy * dy + dz * dz
}

/**
 * Batches the battlefield's static props: every placement of a kit piece within a 128 m cell of the map (or the whole
 * map, for pieces placed only a few dozen times) becomes a thin instance of one mesh. The scene then holds a few
 * hundred meshes instead of one per prop, which is what Babylon pays for every frame in choosing what's visible, again
 * for each shadow cascade and again for the depth pass. Batches are culled whole by their bounds and drawn in one call.
 * The kit's far copies and the draw distances work per batch, by its nearest point (see `update`).
 */
export function batchScenery(
  pieces: ReadonlyMap<string, Mesh>,
  placements: readonly { readonly piece: string; readonly world: Matrix }[],
  { drawDistances = {}, debris = new Set() }: BatchOptions = {}
): SceneryBatches {
  const counts = new Map<string, number>()
  for (const { piece } of placements) {
    counts.set(piece, (counts.get(piece) ?? 0) + 1)
  }
  const cellOf = (piece: string, position: Vector3) =>
    (counts.get(piece) ?? 0) <= RARE
      ? `${piece}@all`
      : `${piece}@${Math.floor(position.x / CELL)},${Math.floor(position.z / CELL)}`

  const index = new Map<string, Slot[]>()
  const indexKey = (x: number, z: number) => `${Math.floor(x / INDEX_CELL)},${Math.floor(z / INDEX_CELL)}`
  const indexed = (slot: Slot) => {
    const key = indexKey(slot.position.x, slot.position.z)
    const slots = index.get(key)
    if (slots) {
      slots.push(slot)
    } else {
      index.set(key, [slot])
    }
  }

  /** Matrices for these pieces and `spare` empty slots, scaled to nothing where the first piece stands. */
  function withSpare(worlds: readonly Matrix[], spare: number): Float32Array {
    const matrices = new Float32Array((worlds.length + spare) * 16)
    worlds.forEach((world, at) => world.copyToArray(matrices, at * 16))
    const empty = GONE.clone().setTranslation(worlds[0]?.getTranslation() ?? Vector3.Zero())
    for (let at = worlds.length; at < worlds.length + spare; at++) {
      empty.copyToArray(matrices, at * 16)
    }
    return matrices
  }

  function makeBatch(name: string, piece: string, source: Mesh, worlds: readonly Matrix[]): Batch {
    const spare = debris.has(piece) ? SPARE : 0
    const matrices = withSpare(worlds, spare)
    const mesh = instanced(sharing(source, name), matrices)
    const farLevel = source.getLODLevels().find((level) => level.mesh !== null)
    const far = farLevel?.mesh ? instanced(sharing(farLevel.mesh, `${name}:far`), Float32Array.from(matrices)) : null
    far?.setEnabled(false)
    const { minimum, maximum } = mesh.getBoundingInfo().boundingBox
    return {
      piece,
      mesh,
      far,
      drawDistance: drawDistances[piece] ?? Infinity,
      farDistance: farLevel?.distanceOrScreenCoverage ?? Infinity,
      min: minimum.clone(),
      max: maximum.clone(),
      matrices,
      used: worlds.length,
      spare,
      showing: 1
    }
  }

  /**
   * Adds a piece to a batch: into a spare slot where there's one, rewriting the buffers in place; otherwise, rarely,
   * remaking them with room for it and a fresh set of spare slots.
   */
  function append(batch: Batch, world: Matrix): number {
    const index = batch.used
    if ((index + 1) * 16 <= batch.matrices.length) {
      batch.mesh.thinInstanceSetMatrixAt(index, world, true)
      batch.far?.thinInstanceSetMatrixAt(index, world, true)
    } else {
      const grown = new Float32Array((index + 1 + batch.spare) * 16)
      grown.set(batch.matrices)
      world.copyToArray(grown, index * 16)
      const empty = GONE.clone().setTranslation(world.getTranslation())
      for (let at = index + 1; at < index + 1 + batch.spare; at++) {
        empty.copyToArray(grown, at * 16)
      }
      batch.matrices = grown
      instanced(batch.mesh, grown)
      if (batch.far) {
        instanced(batch.far, Float32Array.from(grown))
      }
    }
    batch.used = index + 1
    // Measure the batch again only when the piece lies outside it.
    const position = world.getTranslation()
    if (
      position.x < batch.min.x ||
      position.y < batch.min.y ||
      position.z < batch.min.z ||
      position.x > batch.max.x ||
      position.y > batch.max.y ||
      position.z > batch.max.z
    ) {
      batch.mesh.thinInstanceRefreshBoundingInfo(false)
      batch.far?.thinInstanceRefreshBoundingInfo(false)
      const { minimum, maximum } = batch.mesh.getBoundingInfo().boundingBox
      batch.min.copyFrom(minimum)
      batch.max.copyFrom(maximum)
    }
    return index
  }

  // Group the placements by piece and cell, keeping each one's place in its group.
  const groups = new Map<string, { piece: string; worlds: Matrix[] }>()
  for (const { piece, world } of placements) {
    if (!pieces.has(piece)) {
      continue
    }
    const key = cellOf(piece, world.getTranslation())
    const group = groups.get(key)
    if (group) {
      group.worlds.push(world)
    } else {
      groups.set(key, { piece, worlds: [world] })
    }
  }
  const batches = new Map<string, Batch>()
  for (const [key, { piece, worlds }] of groups) {
    const source = pieces.get(piece)
    if (!source) {
      continue
    }
    const batch = makeBatch(key, piece, source, worlds)
    batches.set(key, batch)
    worlds.forEach((world, at) => indexed({ piece, world, position: world.getTranslation(), batch, index: at }))
  }

  const isSlot = (placed: PlacedPiece): placed is Slot => "batch" in placed && "index" in placed

  return {
    get batches() {
      return [...batches.values()]
    },
    near(x, z, radius) {
      const found: PlacedPiece[] = []
      const reach = Math.ceil(radius / INDEX_CELL)
      const column = Math.floor(x / INDEX_CELL)
      const row = Math.floor(z / INDEX_CELL)
      for (let dz = -reach; dz <= reach; dz++) {
        for (let dx = -reach; dx <= reach; dx++) {
          for (const slot of index.get(`${column + dx},${row + dz}`) ?? []) {
            if (Math.hypot(slot.position.x - x, slot.position.z - z) <= radius) {
              found.push(slot)
            }
          }
        }
      }
      return found
    },
    remove(placed) {
      if (!isSlot(placed)) {
        return
      }
      const key = indexKey(placed.position.x, placed.position.z)
      index.set(
        key,
        (index.get(key) ?? []).filter((slot) => slot !== placed)
      )
      // Keep it where it was, scaled to nothing, so the batch's bounds don't need measuring again.
      const gone = GONE.clone().setTranslation(placed.position)
      placed.batch.mesh.thinInstanceSetMatrixAt(placed.index, gone, true)
      placed.batch.far?.thinInstanceSetMatrixAt(placed.index, gone, true)
    },
    show(placed, shown) {
      if (!isSlot(placed)) {
        return
      }
      const world = shown ? placed.world : GONE.clone().setTranslation(placed.position)
      placed.batch.mesh.thinInstanceSetMatrixAt(placed.index, world, true)
      placed.batch.far?.thinInstanceSetMatrixAt(placed.index, world, true)
    },
    add(piece, world) {
      const source = pieces.get(piece)
      if (!source) {
        return null
      }
      const position = world.getTranslation()
      const key = cellOf(piece, position)
      let batch = batches.get(key)
      let at = 0
      if (batch) {
        at = append(batch, world)
      } else {
        batch = makeBatch(key, piece, source, [world])
        batches.set(key, batch)
      }
      const slot: Slot = { piece, world, position, batch, index: at }
      indexed(slot)
      return slot
    },
    update(eye) {
      for (const batch of batches.values()) {
        const distance = Math.sqrt(distanceSquaredToBox(eye, batch.min, batch.max))
        // Coming back nearer, a batch switches only once well inside the threshold it crossed going away.
        const draw = batch.showing === 0 ? batch.drawDistance - margin(batch.drawDistance) : batch.drawDistance
        const far = batch.showing === 2 ? batch.farDistance - margin(batch.farDistance) : batch.farDistance
        let showing: Batch["showing"] = 1
        if (distance > draw) {
          showing = 0
        } else if (batch.far && distance > far) {
          showing = 2
        }
        if (showing !== batch.showing) {
          batch.mesh.setEnabled(showing === 1)
          batch.far?.setEnabled(showing === 2)
          batch.showing = showing
        }
      }
    },
    dispose() {
      for (const batch of batches.values()) {
        batch.mesh.dispose()
        batch.far?.dispose()
      }
      batches.clear()
      index.clear()
    }
  }
}
