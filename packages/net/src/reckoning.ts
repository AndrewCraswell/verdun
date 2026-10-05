import { TICK_RATE } from "@verdun/sim"
import type { SoldierArray, SoldierArrays } from "./soldier-cells.ts"

/**
 * Dead reckoning: where a man is goes to players as where he was (his anchor), the pace he was going at, and the step
 * that was, and players carry him along from it themselves. The server sends a new anchor only when where players would
 * have him has drifted `DRIFT` metres from where he is: a man walking a straight line, or standing still, is sent once,
 * where his position every message was otherwise the most of what's sent. Which way he faces goes as a byte of a turn.
 *
 * Players get their own squad's men as they are (sync-codec.ts), so the man they steer never jumps by a reckoning's
 * error.
 */

/**
 * Where players have a man may drift this far, in metres, from where he is before he's sent anew: other squads' men,
 * whom the page eases between updates anyway (the player's own are sent as they are).
 */
export const DRIFT = 0.15
/** A moving man's anchor is renewed this many steps after it was set, inside the 256 steps `anchor.tick` counts. */
const LONGEST = 200

/**
 * The arrays sent in place of men's positions and facing: the anchor in the position's units, the pace in millimetres a
 * second (to 32 m/s either way), the lowest byte of the step the anchor was set at, and the facing as a byte of a turn.
 */
export const RECKONED = ["anchor.x", "anchor.z", "anchor.tick", "pace.x", "pace.z", "facing.angle"] as const
/** What the reckoned arrays stand in for, which players are sent exactly only for their own men. */
export const RECKONED_FROM: ReadonlySet<string> = new Set(["position.x", "position.z", "facing.x", "facing.z"])

/** `array`, lengthened to `length` by `make` if it's shorter. */
function grown<T extends SoldierArray | Float64Array>(array: T, length: number, make: new (length: number) => T): T {
  if (array.length >= length) {
    return array
  }
  const longer = new make(length)
  longer.set(array)
  return longer
}

/** A facing as a byte of a turn: 0 faces +z, 64 faces +x. */
function angleOf(x: number, z: number): number {
  return Math.round((Math.atan2(x, z) / (2 * Math.PI)) * 256) & 255
}

/** The server's side: the anchors players have, renewed as men drift from them. */
export interface Reckoner {
  /**
   * From the soldiers' arrays at `tick` (positions in the position's units, facing as sent), the `RECKONED` arrays to
   * send in their place: new arrays every call, so what changed can be found against the last.
   */
  reckon(arrays: SoldierArrays, tick: number, soldiers: number): Record<(typeof RECKONED)[number], SoldierArray>
}

/** `unit` is the position's unit, in metres. */
export function createReckoner(unit: number): Reckoner {
  let anchorX = new Uint16Array(0)
  let anchorZ = new Uint16Array(0)
  let paceX = new Int16Array(0)
  let paceZ = new Int16Array(0)
  let anchoredAt = new Float64Array(0)
  let lastX = new Float64Array(0)
  let lastZ = new Float64Array(0)
  let known = 0
  let lastTick = 0
  return {
    reckon(arrays, tick, soldiers) {
      anchorX = grown(anchorX, soldiers, Uint16Array)
      anchorZ = grown(anchorZ, soldiers, Uint16Array)
      paceX = grown(paceX, soldiers, Int16Array)
      paceZ = grown(paceZ, soldiers, Int16Array)
      anchoredAt = grown(anchoredAt, soldiers, Float64Array)
      lastX = grown(lastX, soldiers, Float64Array)
      lastZ = grown(lastZ, soldiers, Float64Array)
      const xs = arrays["position.x"]
      const zs = arrays["position.z"]
      const seconds = (tick - lastTick) / TICK_RATE
      const tickByte = new Uint8Array(soldiers)
      for (let soldier = 0; soldier < soldiers; soldier++) {
        const x = (xs?.[soldier] ?? 0) * unit
        const z = (zs?.[soldier] ?? 0) * unit
        const age = tick - (anchoredAt[soldier] ?? 0)
        const reckonedX = (anchorX[soldier] ?? 0) * unit + ((paceX[soldier] ?? 0) / 1000) * (age / TICK_RATE)
        const reckonedZ = (anchorZ[soldier] ?? 0) * unit + ((paceZ[soldier] ?? 0) / 1000) * (age / TICK_RATE)
        const moving = paceX[soldier] !== 0 || paceZ[soldier] !== 0
        const isNew = soldier >= known
        if (isNew || Math.hypot(x - reckonedX, z - reckonedZ) >= DRIFT || (moving && age >= LONGEST)) {
          // Anew, from where he is, at the pace he's gone since the last message.
          const pace = (from: number, to: number) =>
            isNew || seconds <= 0 ? 0 : Math.max(-32_767, Math.min(32_767, Math.round(((to - from) / seconds) * 1000)))
          paceX[soldier] = pace(lastX[soldier] ?? 0, x)
          paceZ[soldier] = pace(lastZ[soldier] ?? 0, z)
          anchorX[soldier] = xs?.[soldier] ?? 0
          anchorZ[soldier] = zs?.[soldier] ?? 0
          anchoredAt[soldier] = tick
        }
        tickByte[soldier] = (anchoredAt[soldier] ?? 0) & 255
        lastX[soldier] = x
        lastZ[soldier] = z
      }
      known = soldiers
      lastTick = tick
      const facingX = arrays["facing.x"]
      const facingZ = arrays["facing.z"]
      return {
        "anchor.x": anchorX.slice(0, soldiers),
        "anchor.z": anchorZ.slice(0, soldiers),
        "anchor.tick": tickByte,
        "pace.x": paceX.slice(0, soldiers),
        "pace.z": paceZ.slice(0, soldiers),
        "facing.angle": Uint8Array.from({ length: soldiers }, (_, soldier) =>
          angleOf(facingX?.[soldier] ?? 0, facingZ?.[soldier] ?? 1)
        )
      }
    }
  }
}

/** Where the page shows each man, in metres, and which way he faces: what goes into the mirror. */
export interface Shown {
  readonly x: Float32Array
  readonly z: Float32Array
  readonly facingX: Float32Array
  readonly facingZ: Float32Array
}

export const nothingShown = (): Shown => ({
  x: new Float32Array(0),
  z: new Float32Array(0),
  facingX: new Float32Array(0),
  facingZ: new Float32Array(0)
})

/**
 * Carries every man on from his anchor to `tick`, writing into `shown` (lengthened to `soldiers` as needed: what's
 * returned): but for the men `held` says to leave where they were (the enemy out of sight), and those `exact` has as
 * they are (the player's own squad, positions in `unit` steps).
 */
export function reckonShown(
  shown: Shown,
  arrays: SoldierArrays,
  unit: number,
  tick: number,
  soldiers: number,
  held: (soldier: number) => boolean,
  exact: { readonly has: (soldier: number) => boolean; readonly arrays: SoldierArrays }
): Shown {
  const next: Shown = {
    x: grown(shown.x, soldiers, Float32Array),
    z: grown(shown.z, soldiers, Float32Array),
    facingX: grown(shown.facingX, soldiers, Float32Array),
    facingZ: grown(shown.facingZ, soldiers, Float32Array)
  }
  const anchorX = arrays["anchor.x"]
  const anchorZ = arrays["anchor.z"]
  const anchorTick = arrays["anchor.tick"]
  const paceX = arrays["pace.x"]
  const paceZ = arrays["pace.z"]
  const angle = arrays["facing.angle"]
  for (let soldier = 0; soldier < soldiers; soldier++) {
    if (exact.has(soldier)) {
      next.x[soldier] = (exact.arrays["position.x"]?.[soldier] ?? 0) * unit
      next.z[soldier] = (exact.arrays["position.z"]?.[soldier] ?? 0) * unit
      next.facingX[soldier] = exact.arrays["facing.x"]?.[soldier] ?? 0
      next.facingZ[soldier] = exact.arrays["facing.z"]?.[soldier] ?? 0
    } else if (!held(soldier)) {
      const seconds = ((tick - (anchorTick?.[soldier] ?? 0)) & 255) / TICK_RATE
      next.x[soldier] = (anchorX?.[soldier] ?? 0) * unit + ((paceX?.[soldier] ?? 0) / 1000) * seconds
      next.z[soldier] = (anchorZ?.[soldier] ?? 0) * unit + ((paceZ?.[soldier] ?? 0) / 1000) * seconds
      const turn = ((angle?.[soldier] ?? 0) / 256) * 2 * Math.PI
      next.facingX[soldier] = Math.sin(turn)
      next.facingZ[soldier] = Math.cos(turn)
    }
  }
  return next
}
