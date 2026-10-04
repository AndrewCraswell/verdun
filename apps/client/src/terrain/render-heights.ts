import { type BattlefieldMap, sampleIndex, TRENCH_PROFILE } from "@verdun/map"

/**
 * How far from a trench centre line the drawn ground takes its neighbours' minimum: past the revetted walls by a little
 * more than one sample, so terrain triangles rising to the lip start behind the kit's walls instead of poking through.
 */
const LOWERED_REACH = TRENCH_PROFILE.wallHalfWidth + 0.75
/** The trench floor is drawn this much lower, under the drainage troughs in the kit's floor. */
const FLOOR_SINK = 0.3
/**
 * Under the spoil lips the ground is drawn this much lower, so the kit's lips always cover it and the seams between
 * kit pieces show dark earth rather than ground poking through. It fades out over `LIP_FADE` past the lips' edge.
 */
const LIP_SINK = 0.3
const LIP_FADE = { from: TRENCH_PROFILE.parapetOuter - 0.2, to: TRENCH_PROFILE.parapetOuter + 0.4 } as const
/** Brightness of the spoil band, matching the kit's earth, fading back to full over `SPOIL_FADE`. */
const SPOIL_SHADE = 0.7
const SPOIL_FADE = { from: TRENCH_PROFILE.parapetOuter, to: TRENCH_PROFILE.parapetOuter + 1.5 } as const

export interface RenderHeights {
  /** One height per map sample, like `map.heights`. */
  readonly heights: Float32Array
  /** Brightness per sample, multiplying the ground colour. */
  readonly shade: Float32Array
  /** Recomputes a rectangle of samples, inclusive, after the map's heights changed there. */
  update(minColumn: number, minRow: number, maxColumn: number, maxRow: number): void
}

/** Distance from each sample to the nearest trench centre line, out to the spoil's fade; Infinity beyond. */
function trenchDistances(map: BattlefieldMap): Float32Array {
  const distances = new Float32Array(map.heights.length).fill(Infinity)
  const reach = SPOIL_FADE.to
  for (const trench of map.trenches) {
    for (let segment = 1; segment < trench.points.length; segment++) {
      const [ax, az] = trench.points[segment - 1]
      const [bx, bz] = trench.points[segment]
      const abx = bx - ax
      const abz = bz - az
      const lengthSquared = abx * abx + abz * abz
      const minColumn = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / map.cellSize))
      const maxColumn = Math.min(map.columns, Math.ceil((Math.max(ax, bx) + reach) / map.cellSize))
      const minRow = Math.max(0, Math.floor((Math.min(az, bz) - reach) / map.cellSize))
      const maxRow = Math.min(map.rows, Math.ceil((Math.max(az, bz) + reach) / map.cellSize))
      for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
          const x = column * map.cellSize
          const z = row * map.cellSize
          const t =
            lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lengthSquared))
          const index = sampleIndex(map, column, row)
          distances[index] = Math.min(distances[index], Math.hypot(x - (ax + abx * t), z - (az + abz * t)))
        }
      }
    }
  }
  return distances
}

function fade(distance: number, range: { readonly from: number; readonly to: number }): number {
  return Math.min(1, Math.max(0, (distance - range.from) / (range.to - range.from)))
}

/**
 * Heights for drawing the ground. Unshaped, they are the simulation's. Shaped for the trench kit, they differ around
 * trenches, where the kit's meshes stand in for the ground: a 0.5 m height grid can't follow vertical revetments, and a
 * triangle spanning the trench floor and the lip would cut through the wall. Each sample near a trench takes the
 * lowest of its neighbours, the floor and the spoil lips are drawn a little lower so the kit covers them, and the
 * spoil is darkened to the kit's earth so seams between pieces read as shadow. Soldiers and line of sight always use
 * the simulation's heights.
 */
export function createRenderHeights(map: BattlefieldMap, shapedForTrenchKit: boolean): RenderHeights {
  const heights = Float32Array.from(map.heights)
  const distances = shapedForTrenchKit ? trenchDistances(map) : new Float32Array(map.heights.length).fill(Infinity)
  const shade = distances.map((distance) => SPOIL_SHADE + (1 - SPOIL_SHADE) * fade(distance, SPOIL_FADE))

  function update(minColumn: number, minRow: number, maxColumn: number, maxRow: number): void {
    for (let row = Math.max(0, minRow); row <= Math.min(map.rows, maxRow); row++) {
      for (let column = Math.max(0, minColumn); column <= Math.min(map.columns, maxColumn); column++) {
        const index = sampleIndex(map, column, row)
        const distance = distances[index]
        let height = map.heights[index]
        if (distance <= LOWERED_REACH) {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const neighbourColumn = Math.min(map.columns, Math.max(0, column + dx))
              const neighbourRow = Math.min(map.rows, Math.max(0, row + dz))
              height = Math.min(height, map.heights[sampleIndex(map, neighbourColumn, neighbourRow)])
            }
          }
        }
        const sink = distance <= TRENCH_PROFILE.wallHalfWidth ? FLOOR_SINK : LIP_SINK * (1 - fade(distance, LIP_FADE))
        heights[index] = height - sink
      }
    }
  }

  update(0, 0, map.columns, map.rows)
  return { heights, shade, update }
}
