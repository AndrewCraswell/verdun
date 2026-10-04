/** Seeded random number generator. Its whole state is one 32-bit integer, so it saves with the world. */
export interface Rng {
  /** Next value in [0, 1). */
  next(): number
  /** Current state. `createRng(rng.state)` resumes the same sequence. */
  readonly state: number
}

/** Mulberry32: fast, small-state and identical on every JavaScript engine. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d_2b_79_f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    },
    get state() {
      return state
    }
  }
}
