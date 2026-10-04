/**
 * Turns variable frame times into a whole number of fixed simulation steps. The simulation only ever advances by
 * `stepSeconds`, which keeps it deterministic regardless of frame rate.
 */
export interface FixedStepper {
  /** Adds elapsed wall-clock time and returns how many simulation steps to run now. */
  advance(elapsedSeconds: number): number
  /** Fraction of a step left over, in [0, 1). Renderers use it to interpolate between steps. */
  readonly alpha: number
}

/**
 * @param maxStepsPerAdvance After a long stall (a background tab, a debugger pause), run at most this many steps and
 * drop the rest, rather than freezing while catching up.
 */
export function createFixedStepper(stepSeconds: number, maxStepsPerAdvance = 5): FixedStepper {
  if (!(stepSeconds > 0)) {
    throw new RangeError(`Step length must be positive, got ${stepSeconds}`)
  }
  let accumulator = 0
  return {
    advance(elapsedSeconds) {
      accumulator += Math.max(0, elapsedSeconds)
      const steps = Math.floor(accumulator / stepSeconds)
      if (steps > maxStepsPerAdvance) {
        accumulator = 0
        return maxStepsPerAdvance
      }
      accumulator -= steps * stepSeconds
      return steps
    },
    get alpha() {
      return accumulator / stepSeconds
    }
  }
}
