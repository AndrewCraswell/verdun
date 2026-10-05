import { type BattlefieldMap, heightAt, mapDepth, mapWidth, sampleIndex } from "@verdun/map"
import type { SideSight } from "@verdun/net"
import {
  type EntityId,
  type GroundPatch,
  isSheltering,
  type LineOfSight,
  Side,
  sightReach,
  type Simulation,
  soldierEye,
  soldierIds,
  TICK_RATE,
  type WorldPoint
} from "@verdun/sim"

/** No one is made out beyond this many metres, however clear the day: as far as the page's fog of war shows a man. */
export const SIGHT_RANGE = 300
/** Every man's sight is looked at again once every this many messages: five times a second. */
export const SIGHT_SHARES = 2
/** A man is checked against at most this many of the nearest enemies in range, nearest first: sight lines cost. */
const LOOKERS = 10
/**
 * A man is counted seen for this many seconds after he was last made out, so one ducking behind a traverse and up again
 * isn't sent whole each time: the page's own fog decides, from where he is, whether he's drawn.
 */
const LINGER_SECONDS = 2
/**
 * A sight line between two men is cast again only once either has moved a metre, or his eye a quarter of a metre up or
 * down (stepping onto the fire step, standing up), or after this many seconds.
 */
const KEEP_SECONDS = 2
/** Lookers are found by squares of the map this many metres a side. */
const BUCKET = 50
/**
 * Before a sight line is cast, the ground this many metres out from each end is walked, every half metre: a man down in
 * a trench is often hidden by his own parapet, or the looker by his, which the heights show for less than a cast.
 */
const NEAR_GROUND = 6

/** A soldier's state in a `SightFrame`: in the battle and not down a dugout, so he can be seen. */
export const VISIBLE = 1
/** A soldier's state in a `SightFrame`: able to look, as every man in the fight not down a dugout is. */
export const LOOKING = 2

/** What a side sees is worked out from: each soldier's eye, how far off he can be made out, his side, and his state. */
export interface SightFrame {
  readonly tick: number
  /** By soldier: x, y and z of his eye. */
  readonly eyes: Float32Array
  /** By soldier: how far off he can be made out now, in metres, by the light on him and the weather. */
  readonly reach: Float32Array
  /** By soldier: his `Side`. */
  readonly side: Uint8Array
  /** By soldier: `VISIBLE`, and `LOOKING`, or neither. */
  readonly state: Uint8Array
  /** The ground craters reshaped since the last frame. */
  readonly ground: readonly GroundPatch[]
}

/** Which enemies each side can see. */
export interface SideSightModel {
  /** Looks again, with the craters made since the last look, and returns what each side can see. */
  look(ground: readonly GroundPatch[]): SideSight
  /** Stops looking, for good. */
  close(): void
}

/** The soldiers as the sight core takes them in, with `ground`, the craters since the last frame. */
export function sightFrame(sim: Simulation, ground: readonly GroundPatch[]): SightFrame {
  const soldiers = soldierIds(sim)
  const count = soldiers.reduce((most, soldier) => Math.max(most, soldier + 1), 0)
  const eyes = new Float32Array(count * 3)
  const reach = new Float32Array(count)
  const side = new Uint8Array(count)
  const state = new Uint8Array(count)
  for (const soldier of soldiers) {
    if (isSheltering(sim, soldier)) {
      continue
    }
    const eye = soldierEye(sim, soldier)
    eyes.set([eye.x, eye.y, eye.z], soldier * 3)
    reach[soldier] = Math.min(SIGHT_RANGE, sightReach(sim, soldier))
    side[soldier] = sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French
    state[soldier] = VISIBLE | LOOKING
  }
  return { tick: sim.tick, eyes, reach, side, state, ground }
}

/** Writes the craters into `map`'s heights and rebuilds the sight lines' ground under them. */
export function reshape(map: BattlefieldMap, lineOfSight: LineOfSight, ground: readonly GroundPatch[]): void {
  for (const patch of ground) {
    let at = 0
    for (let row = patch.minRow; row <= patch.maxRow; row++) {
      for (let column = patch.minColumn; column <= patch.maxColumn; column++) {
        map.heights[sampleIndex(map, column, row)] = valueAt(patch.heights, at)
        at++
      }
    }
    lineOfSight.rebuildRegion(
      patch.minColumn * map.cellSize,
      patch.minRow * map.cellSize,
      patch.maxColumn * map.cellSize,
      patch.maxRow * map.cellSize
    )
  }
}

/** An element of a frame's typed array, which is there for every soldier the frame has. */
const valueAt = (array: ArrayLike<number>, index: number): number => array[index] ?? 0

/** Whether the ground rises above the line from `from` to `to` within `NEAR_GROUND` metres of `from`. */
function groundBlocksNear(map: BattlefieldMap, from: WorldPoint, to: WorldPoint): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  // Short of the far end, where it's the other end's walk to judge.
  const reach = Math.min(NEAR_GROUND, distance / 2)
  for (let along = 0.5; along <= reach; along += 0.5) {
    const share = along / distance
    if (from.y + dy * share < heightAt(map, from.x + dx * share, from.z + dz * share)) {
      return true
    }
  }
  return false
}

/** A sight line cast between two men's eyes, where they stood, by the metre and the quarter metre of height. */
interface CastLine {
  readonly at: readonly number[]
  readonly tick: number
  readonly clear: boolean
}

/** Where an eye is, as a cast line is kept against: a metre across, a quarter of a metre up. */
const placeOf = (eye: WorldPoint) => [Math.round(eye.x), Math.round(eye.y * 4), Math.round(eye.z)]

/**
 * Each side's sight of the enemy, as the server works it out to send a side only the enemy it can see: a man is seen
 * when one of the nearest living enemies in range has a clear line to him through the ground and the scenery, as the
 * page's fog of war decides it (the page judges the smoke). Every man is looked at once every `shares` frames, the
 * battle a share at a time. A clear line between two men's eyes shows each to the other's side, and lines are kept
 * while the men stay put: most men in a trench line hold where they are. `map` is reshaped as craters come.
 */
export function createSightCore(
  map: BattlefieldMap,
  lineOfSight: LineOfSight,
  shares: number
): { look(frame: SightFrame): SideSight } {
  const columns = Math.max(1, Math.ceil(mapWidth(map) / BUCKET))
  const rows = Math.max(1, Math.ceil(mapDepth(map) / BUCKET))
  const bucketOf = (x: number, z: number) =>
    Math.min(rows - 1, Math.max(0, Math.floor(z / BUCKET))) * columns +
    Math.min(columns - 1, Math.max(0, Math.floor(x / BUCKET)))
  // By side, the step each enemy soldier was last made out at.
  const lastSeen: Readonly<Record<Side, Map<EntityId, number>>> = { [Side.French]: new Map(), [Side.German]: new Map() }
  // Sight lines cast, by the pair of men, the lower id first.
  const cast = new Map<number, CastLine>()
  let share = 0

  return {
    look(frame) {
      reshape(map, lineOfSight, frame.ground)
      const { tick, eyes, reach, side, state } = frame
      const eyeOf = (soldier: EntityId): WorldPoint => ({
        x: valueAt(eyes, soldier * 3),
        y: valueAt(eyes, soldier * 3 + 1),
        z: valueAt(eyes, soldier * 3 + 2)
      })
      const sideOf = (soldier: EntityId): Side => (side[soldier] === Side.German ? Side.German : Side.French)
      // Each side's lookers, by the map's squares.
      const buckets: Readonly<Record<Side, Map<number, EntityId[]>>> = {
        [Side.French]: new Map(),
        [Side.German]: new Map()
      }
      state.forEach((flags, soldier) => {
        if ((flags & LOOKING) !== 0) {
          const eye = eyeOf(soldier)
          const bucket = bucketOf(eye.x, eye.z)
          const lookers = buckets[sideOf(soldier)]
          const men = lookers.get(bucket)
          if (men) {
            men.push(soldier)
          } else {
            lookers.set(bucket, [soldier])
          }
        }
      })
      /**
       * The `LOOKERS` nearest of a side's lookers within `within` of `head`, nearest first: searched in widening squares,
       * so a crowded front costs little.
       */
      const nearest = (lookers: ReadonlyMap<number, EntityId[]>, head: WorldPoint, within: number) => {
        for (let radius = BUCKET; ; radius *= 2) {
          const extent = Math.min(radius, within)
          const near: { looker: EntityId; distance: number }[] = []
          const first = bucketOf(head.x - extent, head.z - extent)
          const last = bucketOf(head.x + extent, head.z + extent)
          for (let row = Math.floor(first / columns); row <= Math.floor(last / columns); row++) {
            for (let column = first % columns; column <= last % columns; column++) {
              for (const looker of lookers.get(row * columns + column) ?? []) {
                const distance =
                  (valueAt(eyes, looker * 3) - head.x) ** 2 + (valueAt(eyes, looker * 3 + 2) - head.z) ** 2
                if (distance <= extent * extent) {
                  near.push({ looker, distance })
                }
              }
            }
          }
          if (near.length >= LOOKERS || extent >= within) {
            return near.sort((a, b) => a.distance - b.distance).slice(0, LOOKERS)
          }
        }
      }
      /** Whether the line between two men's eyes is clear, cast again only when it must be. */
      const clearBetween = (a: EntityId, b: EntityId): boolean => {
        const aEye = eyeOf(a)
        const bEye = eyeOf(b)
        const key = a < b ? a * 65_536 + b : b * 65_536 + a
        const at = a < b ? [...placeOf(aEye), ...placeOf(bEye)] : [...placeOf(bEye), ...placeOf(aEye)]
        const kept = cast.get(key)
        if (
          kept &&
          tick - kept.tick <= KEEP_SECONDS * TICK_RATE &&
          kept.at.every((value, index) => value === at[index])
        ) {
          return kept.clear
        }
        const clear =
          !groundBlocksNear(map, aEye, bEye) && !groundBlocksNear(map, bEye, aEye) && lineOfSight.isClear(aEye, bEye)
        cast.set(key, { at, tick, clear })
        return clear
      }
      const seenAt = (by: Side, soldier: EntityId) => lastSeen[by].set(soldier, tick)

      for (let soldier = share; soldier < state.length; soldier += shares) {
        if ((valueAt(state, soldier) & VISIBLE) === 0) {
          continue
        }
        const own = sideOf(soldier)
        const enemy = own === Side.French ? Side.German : Side.French
        for (const { looker, distance } of nearest(buckets[enemy], eyeOf(soldier), valueAt(reach, soldier))) {
          if (clearBetween(soldier, looker)) {
            seenAt(enemy, soldier)
            // The line runs both ways: the looker shows to the man he sees, if the light on him lets him be made out.
            if (distance <= valueAt(reach, looker) ** 2) {
              seenAt(own, looker)
            }
            break
          }
        }
      }
      share = (share + 1) % shares
      if (share === 0) {
        for (const [key, line] of cast) {
          if (tick - line.tick > KEEP_SECONDS * TICK_RATE) {
            cast.delete(key)
          }
        }
      }
      const sight = new Map<number, Set<EntityId>>()
      for (const by of [Side.French, Side.German]) {
        const seen = lastSeen[by]
        const now = new Set<EntityId>()
        for (const [soldier, at] of seen) {
          if (tick - at <= LINGER_SECONDS * TICK_RATE) {
            now.add(soldier)
          } else {
            seen.delete(soldier)
          }
        }
        sight.set(by, now)
      }
      return sight
    }
  }
}

/**
 * Sight worked out on the room's own thread, from the simulation's own map and sight lines, which it reshapes itself:
 * for tests. The server's battle looks from a worker (sight-thread.ts).
 */
export function createInlineSight(sim: Simulation, shares: number): SideSightModel {
  const lineOfSight = sim.lineOfSight
  const core = lineOfSight ? createSightCore(sim.map, lineOfSight, shares) : null
  const none: SideSight = new Map([
    [Side.French, new Set()],
    [Side.German, new Set()]
  ])
  return {
    look: () => core?.look(sightFrame(sim, [])) ?? none,
    close() {
      // Nothing held.
    }
  }
}
