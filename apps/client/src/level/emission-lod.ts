/** Bursts this near the camera's eye, metres, get every particle: the showpiece, close up. */
const FULL_WITHIN = 80
/** From here on, metres, a burst gets its fewest particles. */
const FEWEST_BEYOND = 300
/** The share of its particles a burst gets that far off. */
const FEWEST = 0.25

/** How a burst's particles are thinned by its distance from the camera. */
export interface Thinning {
  /** The share of its particles it gets, 0 to 1. */
  readonly share: number
  /** How much larger each is drawn, so the fewer still cover about as much. */
  readonly boost: number
}

const FULL: Thinning = { share: 1, boost: 1 }

/**
 * Far off, a burst's few hundred particles show as a few pixels each yet cost the page as much as near ones: it gets
 * fewer, a little larger, falling to a quarter of them (each drawn about 1.4 times the size) 300 m from the eye.
 * `eye` is null with no camera to measure from, and then nothing is thinned.
 */
export function thinning(
  eye: { readonly x: number; readonly y: number; readonly z: number } | null | undefined,
  x: number,
  y: number,
  z: number
): Thinning {
  if (!eye) {
    return FULL
  }
  const distance = Math.hypot(eye.x - x, eye.y - y, eye.z - z)
  if (distance <= FULL_WITHIN) {
    return FULL
  }
  const t = Math.min(1, (distance - FULL_WITHIN) / (FEWEST_BEYOND - FULL_WITHIN))
  const share = 1 - t * (1 - FEWEST)
  // A quarter of the particles each twice the size would cover as much, but read as blots: half way to that.
  return { share, boost: share ** -0.25 }
}

/**
 * `count` particles thinned to `share` of them, rounded up or down at random so the average is right; never none, so
 * a burst always shows.
 */
export function thinned(count: number, share: number, random: () => number = Math.random): number {
  if (count <= 0) {
    return 0
  }
  return Math.max(1, Math.floor(count * share + random()))
}
