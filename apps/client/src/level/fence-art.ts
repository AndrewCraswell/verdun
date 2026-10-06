import type { Scenery } from "@verdun/map"
import type { PlacedPiece, SceneryBatches } from "./scenery-batches.ts"

/** A fence's piece stands at its item's spot, give or take its tilt with the ground. */
const AT_ITS_SPOT = 0.5

export interface FenceArt {
  /** Fences the art follows. */
  readonly fences: number
  /** Takes away the fences shells have flattened: `down` is the simulation's `fencesDown`, which only ever grows. */
  sync(down: readonly number[]): void
}

/**
 * The wooden fences closing the wire's gaps (the map's `wooden-fence` scenery, drawn as the kit's barricade) in step with the
 * simulation: each is drawn until a shell flattens it, as the simulation has it (`sim.fencesDown`), so the gaps the
 * guns opened show, and a barrage that leaves the wire for the attack leaves the fences standing in the art too.
 */
export function createFenceArt(scenery: SceneryBatches, items: readonly Scenery[]): FenceArt {
  const pieces = new Map<number, PlacedPiece[]>()
  items.forEach((item, index) => {
    if (item.kind !== "wooden-fence") {
      return
    }
    const placed = scenery
      .near(item.x, item.z, AT_ITS_SPOT)
      .filter((candidate) => candidate.piece.startsWith("Prop_Barricade"))
    if (placed.length > 0) {
      pieces.set(index, placed)
    }
  })
  // How many of `down` have been taken away.
  let taken = 0
  return {
    fences: pieces.size,
    sync(down) {
      for (; taken < down.length; taken++) {
        for (const placed of pieces.get(down[taken] ?? -1) ?? []) {
          scenery.show(placed, false)
        }
      }
    }
  }
}
