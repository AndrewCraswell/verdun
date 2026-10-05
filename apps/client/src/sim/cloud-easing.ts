/**
 * Eases a cloud (the smoke) between the server's word on it, when a server runs the battle: the server sends the smoke
 * twice a second (packages/net), and the page shows it drifting from what it showed to what was sent, over the time
 * the next word takes to come, rather than jumping each time.
 */
export interface CloudEasing {
  /**
   * Before the server's word is taken into the mirror, at the page's clock `now` (milliseconds): `sent` is the cloud's
   * concentration it brings, or null when it brings none. Call `advance` after taking the word in.
   */
  synced(now: number, sent: Float32Array | null): void
  /** Writes the cloud as it's shown at `now` into the mirror's field. */
  advance(now: number): void
}

/** The easing lasts the time since the last word, within these, in milliseconds. */
const SHORTEST = 50
const LONGEST = 1000

export function createCloudEasing(field: { readonly concentration: Float32Array }): CloudEasing {
  const { concentration } = field
  let from = concentration.slice()
  let to = concentration.slice()
  let started = 0
  let over = 0
  let heard = Number.NEGATIVE_INFINITY
  let easing = false
  return {
    synced(now, sent) {
      if (!sent || sent.length !== concentration.length) {
        return
      }
      from = concentration.slice()
      to = sent.slice()
      over = Math.min(LONGEST, Math.max(SHORTEST, now - heard))
      started = now
      heard = now
      easing = true
    },
    advance(now) {
      if (!easing) {
        return
      }
      const along = Math.min(1, Math.max(0, (now - started) / over))
      for (let cell = 0; cell < concentration.length; cell++) {
        const start = from[cell] ?? 0
        concentration[cell] = start + ((to[cell] ?? 0) - start) * along
      }
      easing = along < 1
    }
  }
}
