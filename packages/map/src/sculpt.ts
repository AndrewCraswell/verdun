import { type BattlefieldMap, sampleIndex, Surface } from "./format.ts"
import { valueNoise } from "./noise.ts"
import { railwayCourse } from "./railways.ts"
import type { Railway, Scenery, SceneryKind } from "./scenery.ts"
import { type GroundPoint, TRENCH_PROFILE } from "./trenches.ts"

/**
 * How the ground was worked for a kind of scenery, in metres times the item's scale:
 *
 * - `pad`: levelled to the middle of the ground under it out to `radius`, easing back into the slope over `blend`;
 * - `pit`: dug `depth` below that level out to `radius`, the spoil thrown up into a berm `rise` high reaching `berm`,
 *   left open behind, where the crew comes and goes;
 * - `bank`: earth heaped `rise` high against it at `radius`, falling away to nothing at `reach`;
 * - `apron`: the ground out to `radius` painted `surface`, broken up with churned earth.
 */
interface GroundWork {
  readonly pad?: { readonly radius: number; readonly blend: number }
  readonly pit?: { readonly radius: number; readonly depth: number; readonly berm: number; readonly rise: number }
  readonly bank?: { readonly radius: number; readonly rise: number; readonly reach: number }
  readonly apron?: { readonly radius: number; readonly surface: Surface }
}

/**
 * Houses stood on levelled plots and their ruins on the rubble of them; guns were dug into pits and screened with
 * their spoil; concrete posts were banked with earth to the loopholes; dumps were levelled and trodden to mud.
 */
export const GROUND_WORK: Partial<Record<SceneryKind, GroundWork>> = {
  ruin: { pad: { radius: 5.5, blend: 3 }, apron: { radius: 8, surface: Surface.Chalk } },
  landmark: { pad: { radius: 9, blend: 4 }, apron: { radius: 12, surface: Surface.Chalk } },
  wall: { pad: { radius: 2, blend: 1.5 } },
  stores: { pad: { radius: 3, blend: 2 }, apron: { radius: 4.5, surface: Surface.Mud } },
  gun: {
    pad: { radius: 4, blend: 3 },
    pit: { radius: 3, depth: 0.7, berm: 5.2, rise: 0.6 },
    apron: { radius: 5, surface: Surface.Mud }
  },
  "wrecked-gun": { pad: { radius: 2.5, blend: 2 }, apron: { radius: 3.5, surface: Surface.Churned } },
  "wrecked-plane": { pad: { radius: 3.5, blend: 2.5 }, apron: { radius: 5, surface: Surface.Churned } },
  "machine-gun": { pad: { radius: 1.3, blend: 0.8 } },
  bunker: { pad: { radius: 3, blend: 1.5 }, bank: { radius: 3, rise: 1, reach: 6.5 } }
}

/** No ground work within this distance of a trench's centre line, so walls, floors and fire steps keep their shape. */
const TRENCH_GUARD = TRENCH_PROFILE.wallHalfWidth + 0.6
/** Ground work fades out between the guard and this distance from a trench. */
const TRENCH_FADE = TRENCH_PROFILE.parapetOuter
/** The pit's opening faces this far either side of straight behind the gun, in radians. */
const PIT_OPENING = 0.7
const NOISE_SEED = 7_919

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Squares of ground this many metres across, for finding the trenches near a point. */
const GUARD_SQUARE = 8

/**
 * How much of its ground work a point takes, by how near it lies to a trench's centre line: none within the guard,
 * fading in out to the fade, all of it beyond. Each trench leg is filed under every square of ground within the fade of
 * it, and a point is measured against its own square's legs alone: the nearest of those is the nearest of all whenever
 * that lies within the fade, and beyond the fade, near or far, the work is whole.
 */
function trenchGuard(map: BattlefieldMap): (x: number, z: number) => number {
  // A metre's slack, so rounding in the measured distance can't leave out a leg near the fade.
  const reach = TRENCH_FADE + 1
  const across = Math.floor((map.columns * map.cellSize) / GUARD_SQUARE) + 1
  const down = Math.floor((map.rows * map.cellSize) / GUARD_SQUARE) + 1
  const squares = Array.from({ length: across * down }, (): (readonly [GroundPoint, GroundPoint])[] => [])
  const square = (metres: number, count: number) => Math.max(0, Math.min(count - 1, Math.floor(metres / GUARD_SQUARE)))
  for (const { points } of map.trenches) {
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1] ?? [0, 0]
      const b = points[index] ?? a
      const fromColumn = square(Math.min(a[0], b[0]) - reach, across)
      const toColumn = square(Math.max(a[0], b[0]) + reach, across)
      const fromRow = square(Math.min(a[1], b[1]) - reach, down)
      const toRow = square(Math.max(a[1], b[1]) + reach, down)
      for (let row = fromRow; row <= toRow; row++) {
        for (let column = fromColumn; column <= toColumn; column++) {
          squares[row * across + column]?.push([a, b])
        }
      }
    }
  }
  return (x, z) => {
    const column = Math.floor(x / GUARD_SQUARE)
    const row = Math.floor(z / GUARD_SQUARE)
    const legs = column >= 0 && column < across && row >= 0 && row < down ? squares[row * across + column] : undefined
    let nearest = Infinity
    for (const [a, b] of legs ?? []) {
      const abx = b[0] - a[0]
      const abz = b[1] - a[1]
      const lengthSquared = abx * abx + abz * abz
      const t =
        lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSquared))
      nearest = Math.min(nearest, Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t)))
    }
    return smoothstep(TRENCH_GUARD, TRENCH_FADE, nearest)
  }
}

/** The middle height of the ground within a circle: a median, so a shell hole on one side doesn't drag the level down. */
function levelOf(map: BattlefieldMap, x: number, z: number, radius: number): number {
  const heights: number[] = []
  const step = map.cellSize
  for (let dz = -radius; dz <= radius; dz += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      if (dx * dx + dz * dz <= radius * radius) {
        heights.push(heightAtSample(map, x + dx, z + dz))
      }
    }
  }
  heights.sort((a, b) => a - b)
  return heights[Math.floor(heights.length / 2)] ?? heightAtSample(map, x, z)
}

function heightAtSample(map: BattlefieldMap, x: number, z: number): number {
  const column = Math.min(map.columns, Math.max(0, Math.round(x / map.cellSize)))
  const row = Math.min(map.rows, Math.max(0, Math.round(z / map.cellSize)))
  return map.heights[sampleIndex(map, column, row)] ?? 0
}

/** The difference in angle between two headings, 0 to pi. */
function angleBetween(a: number, b: number): number {
  const difference = Math.abs(((a - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return Math.min(difference, 2 * Math.PI - difference)
}

/**
 * Works the ground under the map's scenery (see GROUND_WORK): levels it under houses and dumps, digs gun pits, banks
 * earth against concrete posts and paints rubble and mud round them. It changes the map's own heights and surfaces, so
 * line of sight and movement see the same ground the art stands on. Never touches the ground within a couple of metres
 * of a trench, so the trench keeps its profile.
 */
export function sculptForScenery(map: BattlefieldMap, scenery: readonly Scenery[]): void {
  const guardAt = trenchGuard(map)
  for (const item of scenery) {
    const work = GROUND_WORK[item.kind]
    if (!work) {
      continue
    }
    const scale = item.scale
    const pad = work.pad && { radius: work.pad.radius * scale, blend: work.pad.blend * scale }
    const pit = work.pit && {
      radius: work.pit.radius * scale,
      depth: work.pit.depth * scale,
      berm: work.pit.berm * scale,
      rise: work.pit.rise * scale
    }
    const bank = work.bank && {
      radius: work.bank.radius * scale,
      rise: work.bank.rise * scale,
      reach: work.bank.reach * scale
    }
    const apron = work.apron && { radius: work.apron.radius * scale, surface: work.apron.surface }
    const reach = Math.max(pad ? pad.radius + pad.blend : 0, pit?.berm ?? 0, bank?.reach ?? 0, apron?.radius ?? 0)
    const level = levelOf(map, item.x, item.z, pad?.radius ?? 2)
    const rear = item.heading + Math.PI

    const minColumn = Math.max(0, Math.floor((item.x - reach) / map.cellSize))
    const maxColumn = Math.min(map.columns, Math.ceil((item.x + reach) / map.cellSize))
    const minRow = Math.max(0, Math.floor((item.z - reach) / map.cellSize))
    const maxRow = Math.min(map.rows, Math.ceil((item.z + reach) / map.cellSize))
    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        const x = column * map.cellSize
        const z = row * map.cellSize
        const distance = Math.hypot(x - item.x, z - item.z)
        if (distance > reach) {
          continue
        }
        const guard = guardAt(x, z)
        if (guard <= 0) {
          continue
        }
        const index = sampleIndex(map, column, row)
        const ground = map.heights[index] ?? 0
        let height = ground
        if (pad) {
          const weight = 1 - smoothstep(pad.radius, pad.radius + pad.blend, distance)
          height += (level - height) * weight
        }
        if (pit) {
          // A flat floor easing up to the pit's edge, then the berm, low or gone across the opening behind.
          const floor = 1 - smoothstep(pit.radius * 0.6, pit.radius, distance)
          height -= pit.depth * floor
          const angle = Math.atan2(x - item.x, z - item.z)
          const open = smoothstep(PIT_OPENING, PIT_OPENING * 1.6, angleBetween(angle, rear))
          const ring =
            smoothstep(pit.radius * 0.85, pit.radius * 1.15, distance) *
            (1 - smoothstep((pit.radius + pit.berm) / 2, pit.berm, distance))
          height += pit.rise * ring * open
        }
        if (bank) {
          const ring =
            smoothstep(bank.radius * 0.6, bank.radius, distance) * (1 - smoothstep(bank.radius, bank.reach, distance))
          height += bank.rise * ring
        }
        map.heights[index] = ground + (height - ground) * guard
        if (apron && distance < apron.radius && guard >= 1) {
          // Trodden and churned earth, ragged rather than round, with the apron's own surface only in patches.
          const noise = valueNoise(NOISE_SEED, x, z, 2.5)
          const edge = distance / apron.radius
          if (noise > 0.62 + edge * 0.3) {
            map.surfaces[index] = apron.surface
          } else if (noise > 0.15 + edge * 0.6) {
            map.surfaces[index] = Surface.Churned
          }
        }
      }
    }
  }
}

/**
 * A field railway's bed: the ground under its sleepers levelled `halfWidth` metres either side of the track, easing
 * back into the land over `blend`, to the run of the ground along it: the middle height across the bed every `step`
 * metres, averaged over `smoothing` metres either way, so the track neither dives into shell holes nor humps over the
 * crests between them. It climbs and falls no steeper than `grade`, 1 in 25, about as steep as the 60 cm lines' little
 * engines and the horses and men who hauled their wagons could manage: where the ground is steeper, the bed is cut into
 * it and banked over it.
 */
const RAILWAY_BED = { halfWidth: 1.1, blend: 1.4, step: 1, smoothing: 8, grade: 0.04 } as const

/**
 * The run of a bed along heights sampled `spacing` metres apart, rising and falling no more than `grade`: midway
 * between the highest such run nowhere above the heights and the lowest nowhere below them. Of all the runs that keep
 * to the grade, it strays least from the heights at its worst.
 */
function graded(heights: readonly number[], spacing: number, grade: number): number[] {
  const climb = grade * spacing
  const bound = (pick: (a: number, b: number) => number, toward: number) => {
    const run = [...heights]
    for (let index = 1; index < run.length; index++) {
      run[index] = pick(run[index] ?? 0, (run[index - 1] ?? 0) + toward * climb)
    }
    for (let index = run.length - 2; index >= 0; index--) {
      run[index] = pick(run[index] ?? 0, (run[index + 1] ?? 0) + toward * climb)
    }
    return run
  }
  const under = bound(Math.min, 1)
  const over = bound(Math.max, -1)
  return under.map((height, index) => (height + (over[index] ?? height)) / 2)
}

/** The nearest point of a line: how far off it, and how far along it from its start, in metres. */
function nearestAlong(points: readonly GroundPoint[], x: number, z: number): { distance: number; along: number } {
  let best = { distance: Infinity, along: 0 }
  let start = 0
  for (let index = 1; index < points.length; index++) {
    const [ax, az] = points[index - 1] ?? [0, 0]
    const [bx, bz] = points[index] ?? [0, 0]
    const abx = bx - ax
    const abz = bz - az
    const length = Math.hypot(abx, abz)
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (length * length)))
    const distance = Math.hypot(x - (ax + abx * t), z - (az + abz * t))
    if (distance < best.distance) {
      best = { distance, along: start + length * t }
    }
    start += length
  }
  return best
}

/** The point of a line `along` metres from its start, or its end if it's shorter. */
function pointAlong(points: readonly GroundPoint[], along: number): GroundPoint {
  let left = along
  for (let index = 1; index < points.length; index++) {
    const [ax, az] = points[index - 1] ?? [0, 0]
    const [bx, bz] = points[index] ?? [0, 0]
    const length = Math.hypot(bx - ax, bz - az)
    if (left <= length) {
      const t = length === 0 ? 0 : left / length
      return [ax + (bx - ax) * t, az + (bz - az) * t]
    }
    left -= length
  }
  return points.at(-1) ?? [0, 0]
}

/**
 * Lays the bed of every field railway (see RAILWAY_BED) along its course (see railwayCourse), trodden to mud, in the
 * map's own heights and surfaces, so the ground the track lies on is the ground the soldiers walk. Never within a
 * couple of metres of a trench.
 */
export function sculptForRailways(map: BattlefieldMap, railways: readonly Railway[]): void {
  const guardAt = trenchGuard(map)
  const reach = RAILWAY_BED.halfWidth + RAILWAY_BED.blend
  for (const railway of railways) {
    const points = railwayCourse(railway)
    let length = 0
    for (let index = 1; index < points.length; index++) {
      const [ax, az] = points[index - 1] ?? [0, 0]
      const [bx, bz] = points[index] ?? [0, 0]
      length += Math.hypot(bx - ax, bz - az)
    }
    // The ground's middle height across the bed, every metre along it, then its run, smoothed.
    const steps = Math.max(1, Math.ceil(length / RAILWAY_BED.step))
    const across = Array.from({ length: steps + 1 }, (_, index) => {
      const [x, z] = pointAlong(points, (index / steps) * length)
      return levelOf(map, x, z, RAILWAY_BED.halfWidth)
    })
    const span = Math.round(RAILWAY_BED.smoothing / RAILWAY_BED.step)
    const smoothed = across.map((_, index) => {
      const from = Math.max(0, index - span)
      const to = Math.min(across.length - 1, index + span)
      let sum = 0
      for (let other = from; other <= to; other++) {
        sum += across[other] ?? 0
      }
      return sum / (to - from + 1)
    })
    const run = graded(smoothed, length / steps, RAILWAY_BED.grade)
    const bedAt = (along: number) => {
      const position = Math.max(0, Math.min(steps, (along / length) * steps))
      const below = Math.floor(position)
      const above = Math.min(steps, below + 1)
      return (run[below] ?? 0) + ((run[above] ?? 0) - (run[below] ?? 0)) * (position - below)
    }

    // Every sample within reach of the course, once, though it's near more than one of its legs.
    const near = new Map<number, readonly [column: number, row: number]>()
    for (let index = 1; index < points.length; index++) {
      const [ax, az] = points[index - 1] ?? [0, 0]
      const [bx, bz] = points[index] ?? [0, 0]
      const minColumn = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / map.cellSize))
      const maxColumn = Math.min(map.columns, Math.ceil((Math.max(ax, bx) + reach) / map.cellSize))
      const minRow = Math.max(0, Math.floor((Math.min(az, bz) - reach) / map.cellSize))
      const maxRow = Math.min(map.rows, Math.ceil((Math.max(az, bz) + reach) / map.cellSize))
      for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
          near.set(sampleIndex(map, column, row), [column, row])
        }
      }
    }
    for (const [index, [column, row]] of near) {
      const x = column * map.cellSize
      const z = row * map.cellSize
      const { distance, along } = nearestAlong(points, x, z)
      if (distance > reach) {
        continue
      }
      const guard = guardAt(x, z)
      if (guard <= 0) {
        continue
      }
      const ground = map.heights[index] ?? 0
      const weight = (1 - smoothstep(RAILWAY_BED.halfWidth, reach, distance)) * guard
      map.heights[index] = ground + (bedAt(along) - ground) * weight
      if (distance < RAILWAY_BED.halfWidth && guard >= 1) {
        map.surfaces[index] = Surface.Mud
      }
    }
  }
}
