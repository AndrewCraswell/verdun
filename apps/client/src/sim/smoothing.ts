import type { EntityId, Simulation } from "@verdun/sim"

/**
 * Eases soldiers between the server's word on them, when a server runs the battle: each man walks from where the page
 * showed him to where the server last had him, at the pace that gets him there as the next word is due. Men in the
 * cells near the player's own come ten times a second, the rest twice (packages/net), so without this the far ones
 * would hop half a metre at a time. They're shown a moment behind the server: never ahead of what it has said.
 */
export interface Smoothing {
  /**
   * The server's word has just been taken into the mirror, at the page's clock `now` (milliseconds): each man's
   * position becomes where he's heading, and the mirror goes back to showing him where he was. `except` is left as the
   * server has him: the soldier the player controls, whom prediction places (prediction.ts).
   */
  synced(now: number, except: EntityId): void
  /** Moves each man on toward where he's heading, as of `now`; `except` is left alone. */
  advance(now: number, except: EntityId): void
}

/** A man this far from where he's shown has been moved, not walked there (taken prisoner, a new man): he's put there. */
const JUMP = 10
/** The pace is set over the time since a man's last word, within these, in milliseconds. */
const SHORTEST = 50
const LONGEST = 1000

export function createSmoothing(mirror: Simulation): Smoothing {
  const { position } = mirror.soldiers
  let shownX = new Float32Array(0)
  let shownZ = new Float32Array(0)
  let targetX = new Float32Array(0)
  let targetZ = new Float32Array(0)
  let speedX = new Float32Array(0)
  let speedZ = new Float32Array(0)
  let heard = new Float64Array(0)
  let last = 0

  /** Room for `count` men, new ones shown where the server has them. */
  const grow = (count: number) => {
    if (count <= shownX.length) {
      return
    }
    const longer = <T extends Float32Array | Float64Array>(array: T, make: (length: number) => T): T => {
      const grown = make(count)
      grown.set(array)
      return grown
    }
    const from = shownX.length
    shownX = longer(shownX, (length) => new Float32Array(length))
    shownZ = longer(shownZ, (length) => new Float32Array(length))
    targetX = longer(targetX, (length) => new Float32Array(length))
    targetZ = longer(targetZ, (length) => new Float32Array(length))
    speedX = longer(speedX, (length) => new Float32Array(length))
    speedZ = longer(speedZ, (length) => new Float32Array(length))
    heard = longer(heard, (length) => new Float64Array(length))
    for (let soldier = from; soldier < count; soldier++) {
      shownX[soldier] = position.x[soldier]
      shownZ[soldier] = position.z[soldier]
      targetX[soldier] = shownX[soldier]
      targetZ[soldier] = shownZ[soldier]
    }
  }

  return {
    synced(now, except) {
      const count = Math.min(position.x.length, position.z.length)
      grow(count)
      for (let soldier = 0; soldier < count; soldier++) {
        const x = position.x[soldier]
        const z = position.z[soldier]
        if (soldier === except) {
          shownX[soldier] = x
          shownZ[soldier] = z
          targetX[soldier] = x
          targetZ[soldier] = z
          continue
        }
        if (x !== targetX[soldier] || z !== targetZ[soldier]) {
          const fromX = shownX[soldier]
          const fromZ = shownZ[soldier]
          if (Math.hypot(x - fromX, z - fromZ) > JUMP) {
            shownX[soldier] = x
            shownZ[soldier] = z
            speedX[soldier] = 0
            speedZ[soldier] = 0
          } else {
            const over = Math.min(LONGEST, Math.max(SHORTEST, now - heard[soldier]))
            speedX[soldier] = (x - fromX) / over
            speedZ[soldier] = (z - fromZ) / over
          }
          targetX[soldier] = x
          targetZ[soldier] = z
          heard[soldier] = now
        }
        position.x[soldier] = shownX[soldier]
        position.z[soldier] = shownZ[soldier]
      }
      last = now
    },
    advance(now, except) {
      const elapsed = Math.max(0, now - last)
      last = now
      for (let soldier = 0; soldier < shownX.length; soldier++) {
        if (soldier === except) {
          continue
        }
        const x = shownX[soldier]
        const z = shownZ[soldier]
        const toX = targetX[soldier] - x
        const toZ = targetZ[soldier] - z
        const stepX = speedX[soldier] * elapsed
        const stepZ = speedZ[soldier] * elapsed
        // On toward the target, never past it.
        const arrived = stepX * stepX + stepZ * stepZ >= toX * toX + toZ * toZ
        shownX[soldier] = arrived ? x + toX : x + stepX
        shownZ[soldier] = arrived ? z + toZ : z + stepZ
        position.x[soldier] = shownX[soldier]
        position.z[soldier] = shownZ[soldier]
      }
    }
  }
}
