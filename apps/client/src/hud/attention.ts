import type { MissionView } from "./fire-support.ts"
import type { ClockView, SectorView } from "./sector-state.ts"
import type { OrderView } from "./squad-order.ts"

/**
 * What has just changed and deserves a moment on screen. Most of the HUD stays out of the way until the player holds
 * the overview key; these flags bring a part of it up on its own for a few seconds when what it shows changes: an
 * objective changing hands, the light or the weather turning, the guns called, a new order.
 */
export interface Attention {
  readonly objectives: boolean
  readonly sky: boolean
  readonly fire: boolean
  readonly order: boolean
}

/** Real seconds each kind of change keeps its part of the HUD up. */
export const ATTENTION_SECONDS = { objectives: 10, sky: 8, fire: 8, order: 6 } as const

export interface AttentionWatch {
  /** What deserves attention at a real moment, in seconds, given what the HUD shows now. */
  read(
    now: number,
    seen: {
      readonly sector: SectorView
      readonly clock: ClockView
      readonly missions: readonly MissionView[]
      readonly order: OrderView
    }
  ): Attention
}

export function createAttentionWatch(): AttentionWatch {
  let objectives = ""
  let sky = ""
  /** The newest mission seen, by id (ids only grow), and whether the watch has looked once. */
  let newestSeen = -1
  let primed = false
  let order = -1
  const until = { objectives: -Infinity, sky: -Infinity, fire: -Infinity, order: -Infinity }

  function changed(previous: string | number, next: string | number, initial: string | number): boolean {
    return previous !== initial && previous !== next
  }

  return {
    read(now, { sector, clock, missions: live, order: current }) {
      const holders = sector.objectives
        .map((objective) => `${objective.name}:${objective.holder}:${objective.contested}`)
        .join()
      if (changed(objectives, holders, "")) {
        until.objectives = now + ATTENTION_SECONDS.objectives
      }
      objectives = holders
      const light = `${clock.light.phase}:${clock.light.standTo}:${clock.weather.sky}`
      if (changed(sky, light, "")) {
        until.sky = now + ATTENTION_SECONDS.sky
      }
      sky = light
      const newest = Math.max(-1, ...live.map((mission) => mission.id))
      if (primed && newest > newestSeen) {
        until.fire = now + ATTENTION_SECONDS.fire
      }
      newestSeen = Math.max(newestSeen, newest)
      primed = true
      if (changed(order, current.serial, -1)) {
        until.order = now + ATTENTION_SECONDS.order
      }
      order = current.serial
      return {
        objectives: now < until.objectives,
        sky: now < until.sky,
        fire: now < until.fire,
        order: now < until.order
      }
    }
  }
}
