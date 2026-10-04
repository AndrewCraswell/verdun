import { type BattlefieldMap, sampleIndex, Surface } from "./format.ts"
import { valueNoise } from "./noise.ts"
import type { Scenery, SceneryKind } from "./scenery.ts"
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

function trenchDistance(segments: readonly (readonly [GroundPoint, GroundPoint])[], x: number, z: number): number {
  let nearest = Infinity
  for (const [a, b] of segments) {
    const abx = b[0] - a[0]
    const abz = b[1] - a[1]
    const lengthSquared = abx * abx + abz * abz
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSquared))
    nearest = Math.min(nearest, Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t)))
  }
  return nearest
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
  const segments = map.trenches.flatMap((trench) =>
    trench.points.slice(1).map((b, index): readonly [GroundPoint, GroundPoint] => [trench.points[index] ?? b, b])
  )
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
        const guard = smoothstep(TRENCH_GUARD, TRENCH_FADE, trenchDistance(segments, x, z))
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
