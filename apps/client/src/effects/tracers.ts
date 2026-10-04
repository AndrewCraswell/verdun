import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import type { Scene } from "@babylonjs/core/scene"
import type { ShotEvent } from "@verdun/sim"

/** How long a tracer stays on screen, in seconds. */
const TRACER_SECONDS = 0.12
/** Older tracers are dropped beyond this many, so heavy machine-gun fire can't grow the buffer without bound. */
const MAX_TRACERS = 512
const TRACER_WIDTH = 0.05

interface Tracer {
  readonly shot: ShotEvent
  age: number
}

export interface Tracers {
  readonly mesh: Mesh
  /** Adds tracers for shots fired in the last simulation steps. */
  add(shots: readonly ShotEvent[]): void
  /** Ages tracers and redraws the live ones. Call once per frame. */
  update(frameSeconds: number): void
}

/**
 * Writes a matrix that stretches a unit box (1 m long on z) from one point to another: rows are the box's local axes,
 * scaled, then the midpoint.
 */
function writeSegment(matrices: Float32Array, offset: number, shot: ShotEvent): void {
  const dx = shot.to.x - shot.from.x
  const dy = shot.to.y - shot.from.y
  const dz = shot.to.z - shot.from.z
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
  const forward = [dx / length, dy / length, dz / length] as const
  // Any axis perpendicular to the shot will do for a thin box; avoid the degenerate case of a vertical shot.
  const up = Math.abs(forward[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]
  const side = [
    up[1]! * forward[2] - up[2]! * forward[1],
    up[2]! * forward[0] - up[0]! * forward[2],
    up[0]! * forward[1] - up[1]! * forward[0]
  ]
  const sideLength = Math.hypot(side[0]!, side[1]!, side[2]!)
  const right = side.map((value) => value / sideLength)
  const lift = [
    forward[1] * right[2]! - forward[2] * right[1]!,
    forward[2] * right[0]! - forward[0] * right[2]!,
    forward[0] * right[1]! - forward[1] * right[0]!
  ]
  matrices.set(
    [
      right[0]! * TRACER_WIDTH,
      right[1]! * TRACER_WIDTH,
      right[2]! * TRACER_WIDTH,
      0,
      lift[0]! * TRACER_WIDTH,
      lift[1]! * TRACER_WIDTH,
      lift[2]! * TRACER_WIDTH,
      0,
      dx,
      dy,
      dz,
      0,
      shot.from.x + dx / 2,
      shot.from.y + dy / 2,
      shot.from.z + dz / 2,
      1
    ],
    offset
  )
}

/** Brief streaks along every shot, so the player can read a firefight: who is firing, from where, at whom. */
export function createTracers(scene: Scene): Tracers {
  const mesh = CreateBox("tracers", { width: 1, height: 1, depth: 1 }, scene)
  const material = new StandardMaterial("tracer", scene)
  material.emissiveColor = new Color3(1, 0.85, 0.5)
  material.disableLighting = true
  mesh.material = material
  mesh.isPickable = false
  mesh.alwaysSelectAsActiveMesh = true
  mesh.thinInstanceCount = 0

  let live: Tracer[] = []
  const matrices = new Float32Array(MAX_TRACERS * 16)

  return {
    mesh,
    add(shots) {
      live.push(...shots.map((shot) => ({ shot, age: 0 })))
      if (live.length > MAX_TRACERS) {
        live = live.slice(-MAX_TRACERS)
      }
    },
    update(frameSeconds) {
      live = live.filter((tracer) => (tracer.age += frameSeconds) < TRACER_SECONDS)
      live.forEach((tracer, index) => writeSegment(matrices, index * 16, tracer.shot))
      mesh.thinInstanceSetBuffer("matrix", matrices, 16, false)
      mesh.thinInstanceCount = live.length
    }
  }
}
