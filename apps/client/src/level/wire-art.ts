import { type WireField, wirePace } from "@verdun/sim"
import type { Placement } from "./placement.ts"
import type { PlacedPiece, SceneryBatches } from "./scenery-batches.ts"

/** Fence pieces run along their x axis, this long at full size (see scenery-dressing.ts). */
const FENCE_LENGTH = 10.06
/** A piece of wire is drawn while less than this share of the ground it covers is cut through. */
const CUT_AWAY = 0.5

/** A piece of the wire's art and the ground points it stands for. */
interface Strand {
  readonly placed: PlacedPiece
  readonly points: readonly (readonly [number, number])[]
  shown: boolean
}

export interface WireArt {
  /** Pieces of wire the art follows. */
  readonly strands: number
  /** Tears away the wire's art where the wire is cut, and stakes it again where it's been mended. */
  sync(field: WireField): void
}

/** Ground points a placed piece of wire covers: along a fence's length every metre, or a tangle's spot. */
function pointsOf(placement: Placement): [number, number][] {
  if (placement.piece.startsWith("Prop_Wire_Fence_Tangled")) {
    return [[placement.x, placement.z]]
  }
  // The fence's x axis, turned by its yaw, runs along the belt.
  const dx = Math.cos(placement.yaw)
  const dz = -Math.sin(placement.yaw)
  const length = FENCE_LENGTH * (placement.scale?.[0] ?? 1)
  const count = Math.max(2, Math.round(length))
  return Array.from({ length: count }, (_, index) => {
    const along = ((index + 0.5) / count - 0.5) * length
    return [placement.x + dx * along, placement.z + dz * along]
  })
}

/**
 * The wire belts' art in step with the simulation's wire (`sim.wire`): each fence piece and tangle is drawn while most
 * of the ground it covers is still wire a man has to cut or crawl through, and torn away once shells have cut it
 * through, so the gaps an attack can go through show. Wiring parties stake it again by night, and the art comes back.
 */
export function createWireArt(scenery: SceneryBatches, placements: readonly Placement[]): WireArt {
  const strands: Strand[] = []
  for (const placement of placements) {
    if (!placement.piece.startsWith("Prop_Wire_Fence")) {
      continue
    }
    const placed = scenery.near(placement.x, placement.z, 0.01).find((candidate) => candidate.piece === placement.piece)
    if (placed) {
      strands.push({ placed, points: pointsOf(placement), shown: true })
    }
  }
  return {
    strands: strands.length,
    sync(field) {
      for (const strand of strands) {
        const cut = strand.points.filter(([x, z]) => wirePace(field, x, z) >= 1).length
        const shown = cut < strand.points.length * CUT_AWAY
        if (shown !== strand.shown) {
          strand.shown = shown
          scenery.show(strand.placed, shown)
        }
      }
    }
  }
}
