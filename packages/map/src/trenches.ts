import { type BattlefieldMap, mapDepth, mapWidth, sampleIndex, Surface } from "./format.ts"

/** A point on the ground plane, `[x, z]` in metres. */
export type GroundPoint = readonly [number, number]

/**
 * A trench line. Fire trenches face the enemy: they get a fire step to shoot from and a parapet of spoil in front.
 * Communication trenches run to the rear and are plain slots.
 */
export interface Trench {
  readonly kind: "fire" | "communication"
  readonly points: readonly GroundPoint[]
  /** Which way a fire trench faces: toward +z (north) or -z (south). Communication trenches have none. */
  readonly facing: "north" | "south" | null
}

/**
 * Trench cross-section, in metres, matched to the Synty deep trench kit the client lines trenches with: revetted walls
 * 2.2 m apart, a floor 1.9 m down, and lips of spoil either side. Distances are from the trench centre line.
 */
export const TRENCH_PROFILE = {
  /** The fire step starts this far in front of the centre line; the floor is the rest of the width behind it. */
  floorHalfWidth: 0.35,
  /** The revetted walls stand this far either side of the centre line. */
  wallHalfWidth: 1.1,
  /** The spoil heaped either side is highest this far from the centre line. */
  lipCrest: 1.9,
  floorDepth: 1.9,
  /** A soldier standing on the fire step sees, and shoots, over the parapet: eye height 1.65 m clears it by 0.4 m. */
  fireStepOuter: 1.1,
  fireStepDepth: 0.85,
  parapetOuter: 3,
  parapetHeight: 0.4,
  paradosOuter: 3,
  paradosHeight: 0.4,
  communicationDepth: 1.9
} as const

const REACH = Math.max(TRENCH_PROFILE.parapetOuter, TRENCH_PROFILE.paradosOuter)

interface Nearest {
  distance: number
  /** True when the sample lies on the side the trench faces. */
  inFront: boolean
  trench: Trench
}

function closestOnSegment(p: GroundPoint, a: GroundPoint, b: GroundPoint): GroundPoint {
  const abx = b[0] - a[0]
  const abz = b[1] - a[1]
  const lengthSquared = abx * abx + abz * abz
  const t =
    lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / lengthSquared))
  return [a[0] + abx * t, a[1] + abz * t]
}

/** Spoil heaped along a trench lip: rising from the top of the wall to its crest, then falling to nothing at `outer`. */
function lip(distance: number, height: number, outer: number): number {
  const { wallHalfWidth, lipCrest } = TRENCH_PROFILE
  if (distance < lipCrest) {
    return (height * (distance - wallHalfWidth)) / (lipCrest - wallHalfWidth)
  }
  return height * Math.max(0, 1 - (distance - lipCrest) / (outer - lipCrest))
}

/** Height change a trench makes at a given distance from its centre line. Negative digs, positive piles spoil. */
function profileOffset({ distance, inFront, trench }: Nearest): number {
  const profile = TRENCH_PROFILE
  if (trench.kind === "communication") {
    return distance <= profile.wallHalfWidth
      ? -profile.communicationDepth
      : lip(distance, profile.paradosHeight, profile.paradosOuter)
  }
  if (inFront) {
    if (distance <= profile.floorHalfWidth) {
      return -profile.floorDepth
    }
    if (distance <= profile.fireStepOuter) {
      return -profile.fireStepDepth
    }
    return lip(distance, profile.parapetHeight, profile.parapetOuter)
  }
  return distance <= profile.wallHalfWidth
    ? -profile.floorDepth
    : lip(distance, profile.paradosHeight, profile.paradosOuter)
}

/**
 * Digs trenches into the map: lowers the height grid along each trench, raises parapets, and marks the trench floor as
 * mud. Where trenches meet, the nearest one decides the profile. Returns the world-space bounds that changed, for
 * rebuilding terrain chunks and colliders.
 */
export function carveTrenches(
  map: BattlefieldMap,
  trenches: readonly Trench[]
): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  const nearest = new Map<number, Nearest>()
  const bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }

  for (const trench of trenches) {
    const facingZ = trench.facing === "north" ? 1 : -1
    for (let segment = 0; segment < trench.points.length - 1; segment++) {
      const a = trench.points[segment]
      const b = trench.points[segment + 1]
      const minColumn = Math.max(0, Math.floor((Math.min(a[0], b[0]) - REACH) / map.cellSize))
      const maxColumn = Math.min(map.columns, Math.ceil((Math.max(a[0], b[0]) + REACH) / map.cellSize))
      const minRow = Math.max(0, Math.floor((Math.min(a[1], b[1]) - REACH) / map.cellSize))
      const maxRow = Math.min(map.rows, Math.ceil((Math.max(a[1], b[1]) + REACH) / map.cellSize))
      bounds.minX = Math.min(bounds.minX, minColumn * map.cellSize)
      bounds.minZ = Math.min(bounds.minZ, minRow * map.cellSize)
      bounds.maxX = Math.max(bounds.maxX, maxColumn * map.cellSize)
      bounds.maxZ = Math.max(bounds.maxZ, maxRow * map.cellSize)
      for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
          const p: GroundPoint = [column * map.cellSize, row * map.cellSize]
          const closest = closestOnSegment(p, a, b)
          const distance = Math.hypot(p[0] - closest[0], p[1] - closest[1])
          const index = sampleIndex(map, column, row)
          const current = nearest.get(index)
          if (distance <= REACH && (!current || distance < current.distance)) {
            nearest.set(index, { distance, inFront: (p[1] - closest[1]) * facingZ > 0, trench })
          }
        }
      }
    }
  }

  for (const [index, sample] of nearest) {
    map.heights[index] += profileOffset(sample)
    // The floor and the spoil heaped either side are bare mud.
    if (sample.distance <= TRENCH_PROFILE.parapetOuter) {
      map.surfaces[index] = Surface.Mud
    }
  }
  return Number.isFinite(bounds.minX) ? bounds : null
}

/** Evenly spaced points along a trench's centre line, for placing soldiers. */
export function pointsAlong(trench: Trench, spacing: number): GroundPoint[] {
  const points: GroundPoint[] = []
  let carried = 0
  for (let segment = 0; segment < trench.points.length - 1; segment++) {
    const a = trench.points[segment]
    const b = trench.points[segment + 1]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    let along = carried
    while (along <= length) {
      const t = length === 0 ? 0 : along / length
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      along += spacing
    }
    carried = along - length
  }
  return points
}

export interface TrenchSystemOptions {
  /** Distance from the map edges, in metres, kept clear of trenches. */
  readonly margin?: number
  /** Fire trench bays are this long before each traverse. */
  readonly bayLength?: number
  /** Traverses step the line back by this much, so a shell or an enfilading gun can't sweep a whole trench. */
  readonly traverseDepth?: number
  /** Communication trenches run to the rear about this often along the front. */
  readonly communicationSpacing?: number
}

/** A fire trench across the map: bays and traverses in a crenellated pattern, the trace of a real WW1 front line. */
function fireTrench(map: BattlefieldMap, z: number, facing: "north" | "south", options: Required<TrenchSystemOptions>) {
  const back = facing === "north" ? -1 : 1
  const points: GroundPoint[] = []
  const end = mapWidth(map) - options.margin
  let x = options.margin
  let stepped = false
  points.push([x, z])
  while (x + options.bayLength < end) {
    x += options.bayLength
    points.push([x, stepped ? z + back * options.traverseDepth : z])
    stepped = !stepped
    points.push([x + 2, stepped ? z + back * options.traverseDepth : z])
    x += 2
  }
  points.push([end, stepped ? z + back * options.traverseDepth : z])
  return { kind: "fire" as const, points, facing }
}

function communicationTrenches(
  map: BattlefieldMap,
  fromZ: number,
  toZ: number,
  options: Required<TrenchSystemOptions>
): Trench[] {
  const trenches: Trench[] = []
  for (
    let x = options.margin + options.communicationSpacing / 2;
    x < mapWidth(map) - options.margin;
    x += options.communicationSpacing
  ) {
    // A gentle zigzag, so the trench can't be enfiladed along its length.
    const points: GroundPoint[] = []
    const steps = 6
    for (let step = 0; step <= steps; step++) {
      const z = fromZ + ((toZ - fromZ) * step) / steps
      points.push([x + (step % 2 === 0 ? 0 : 3), z])
    }
    trenches.push({ kind: "communication", points, facing: null })
  }
  return trenches
}

/**
 * The prototype front: each side has a fire trench facing the enemy, a support trench behind it, and communication
 * trenches linking them to the rear. French to the south, Germans to the north, no man's land between.
 */
export function layOutFront(map: BattlefieldMap, settings: TrenchSystemOptions = {}): Trench[] {
  const options: Required<TrenchSystemOptions> = {
    margin: 20,
    bayLength: 9,
    traverseDepth: 3,
    communicationSpacing: 110,
    ...settings
  }
  const depth = mapDepth(map)
  const frenchFire = depth * 0.25
  const frenchSupport = depth * 0.12
  const germanFire = depth * 0.75
  const germanSupport = depth * 0.88
  return [
    fireTrench(map, frenchFire, "north", options),
    fireTrench(map, frenchSupport, "north", options),
    ...communicationTrenches(map, frenchSupport, frenchFire - options.traverseDepth, options),
    fireTrench(map, germanFire, "south", options),
    fireTrench(map, germanSupport, "south", options),
    ...communicationTrenches(map, germanFire + options.traverseDepth, germanSupport, options)
  ]
}
