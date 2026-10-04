import { footprintRadius, type Scenery, SCENERY_FOOTPRINTS } from "@verdun/map"

/**
 * Something standing on the ground that hides what's behind it, in world space: an upright box turned to `yaw` (as
 * scenery headings are: its `along` axis points at (sin yaw, cos yaw)), or an upright cylinder. `height` is how far it
 * stands above the ground under its item.
 */
export type SightBlock =
  | {
      readonly kind: "box"
      readonly x: number
      readonly z: number
      readonly yaw: number
      readonly halfAcross: number
      readonly halfAlong: number
      readonly height: number
    }
  | {
      readonly kind: "cylinder"
      readonly x: number
      readonly z: number
      readonly radius: number
      readonly height: number
    }

/** A box of the art, relative to its item before scaling: offsets to the right of and along its heading. */
interface Part {
  readonly across: number
  readonly along: number
  readonly height: number
  readonly right?: number
  readonly forward?: number
  readonly turn?: number
}

/**
 * The sight-blocking bulk of each scenery kind's art, measured from the level kit (see scenery-dressing.ts), by
 * variant. Rubble mounds are slopes, so their boxes are drawn a little inside the art's extent and below its crest.
 * Ruins have eight compositions, picked by `variant % 8`.
 */
const RAZED: readonly Part[] = [
  { across: 9, along: 2.8, height: 1.2 },
  { across: 8, along: 2.6, height: 1.1, right: -3, forward: -2.5, turn: 2.2 },
  { across: 0.5, along: 1.2, height: 6.5, right: 3, forward: -3.5 },
  { across: 4, along: 0.6, height: 1.1, right: -4.5, forward: 1, turn: Math.PI / 2 }
]
const ART: Partial<Record<Scenery["kind"], readonly (readonly Part[])[]>> = {
  ruin: [
    RAZED,
    [{ across: 14.3, along: 11.1, height: 4.5 }],
    [{ across: 7.8, along: 7.8, height: 4.3 }],
    RAZED,
    [{ across: 15.9, along: 12.3, height: 4.5 }],
    [{ across: 7.8, along: 7.8, height: 8.8 }],
    RAZED,
    [
      { across: 5.3, along: 1, height: 2.6 },
      { across: 5, along: 3, height: 0.8, forward: -2 }
    ]
  ],
  landmark: [
    [
      { across: 11.2, along: 13.5, height: 7.1 },
      { across: 0.8, along: 2, height: 10.9, right: -8.5, forward: -4 }
    ]
  ],
  // Stone walls run across their heading; the art picks one of four lengths, so this is a middling one.
  wall: [[{ across: 3, along: 0.65, height: 1 }]],
  bunker: [[{ across: 6, along: 7.6, height: 2.5 }]],
  stores: [
    [
      { across: 2.4, along: 2.5, height: 2 },
      { across: 3.4, along: 2.7, height: 1.1, right: 2.4 }
    ]
  ],
  "wrecked-plane": [[{ across: 6.5, along: 5.8, height: 2.6 }]]
}

/** The shapes a piece of scenery hides things behind, as it stands, or cut down to `height` when it has been knocked down. */
export function sightBlocks(item: Scenery, height?: number): SightBlock[] {
  const variants = ART[item.kind]
  const cap = height ?? Infinity
  if (!variants) {
    const standing = Math.min(cap, SCENERY_FOOTPRINTS[item.kind].sightHeight * item.scale)
    return standing > 0
      ? [{ kind: "cylinder", x: item.x, z: item.z, radius: footprintRadius(item), height: standing }]
      : []
  }
  const parts = variants[item.variant % variants.length] ?? []
  const forwardX = Math.sin(item.heading)
  const forwardZ = Math.cos(item.heading)
  const blocks: SightBlock[] = []
  for (const part of parts) {
    const right = (part.right ?? 0) * item.scale
    const forward = (part.forward ?? 0) * item.scale
    const standing = Math.min(cap, part.height * item.scale)
    if (standing <= 0) {
      continue
    }
    blocks.push({
      kind: "box",
      x: item.x + forwardZ * right + forwardX * forward,
      z: item.z - forwardX * right + forwardZ * forward,
      yaw: item.heading + (part.turn ?? 0),
      halfAcross: (part.across * item.scale) / 2,
      halfAlong: (part.along * item.scale) / 2,
      height: standing
    })
  }
  return blocks
}

/** Whether a ground point lies inside a block's footprint. */
export function insideBlock(block: SightBlock, x: number, z: number): boolean {
  const dx = x - block.x
  const dz = z - block.z
  if (block.kind === "cylinder") {
    return dx * dx + dz * dz <= block.radius * block.radius
  }
  const across = dx * Math.cos(block.yaw) - dz * Math.sin(block.yaw)
  const along = dx * Math.sin(block.yaw) + dz * Math.cos(block.yaw)
  return Math.abs(across) <= block.halfAcross && Math.abs(along) <= block.halfAlong
}

/** How far a block reaches from its centre in any direction, for bounding it. */
export function blockReach(block: SightBlock): number {
  return block.kind === "cylinder" ? block.radius : Math.sqrt(block.halfAcross ** 2 + block.halfAlong ** 2)
}
