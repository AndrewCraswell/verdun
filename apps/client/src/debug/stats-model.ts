import { capturedIds, fallenIds, Side, type Simulation, soldierIds, TICK_RATE } from "@verdun/sim"

/** Frame timings over the last second or so, for frame rate and frame-time spikes. */
export interface FrameTimes {
  /** Records one frame: its length and the time spent in each measured part, in milliseconds. */
  add(frameMs: number, parts?: Readonly<Record<string, number>>): void
  /** Frames per second, averaged over the window. */
  readonly fps: number
  /** Average and worst frame time over the window, in milliseconds. */
  readonly averageMs: number
  readonly worstMs: number
  /** Average time per frame in each measured part, in milliseconds. */
  part(name: string): number | null
  /** The names of every part measured in the window, in the order first seen. */
  readonly partNames: readonly string[]
}

/** Frames are averaged over this many seconds. */
const WINDOW_SECONDS = 1

export function createFrameTimes(): FrameTimes {
  let frames: { ms: number; parts: Readonly<Record<string, number>> }[] = []
  const windowMs = () => frames.reduce((sum, frame) => sum + frame.ms, 0)
  return {
    add(frameMs, parts = {}) {
      frames.push({ ms: frameMs, parts })
      while (frames.length > 1 && windowMs() - (frames[0]?.ms ?? 0) > WINDOW_SECONDS * 1000) {
        frames = frames.slice(1)
      }
    },
    get fps() {
      const total = windowMs()
      return total > 0 ? (frames.length * 1000) / total : 0
    },
    get averageMs() {
      return frames.length > 0 ? windowMs() / frames.length : 0
    },
    get worstMs() {
      return frames.reduce((worst, frame) => Math.max(worst, frame.ms), 0)
    },
    get partNames() {
      return [...new Set(frames.flatMap((frame) => Object.keys(frame.parts)))]
    },
    part(name) {
      const measured = frames.filter((frame) => name in frame.parts)
      if (measured.length === 0) {
        return null
      }
      return measured.reduce((sum, frame) => sum + (frame.parts[name] ?? 0), 0) / frames.length
    }
  }
}

/** What's on the battlefield, for the debug overlay. */
export interface WorldStats {
  readonly clock: string
  readonly soldiers: string
  readonly fallen: string
  readonly prisoners: string
  readonly artillery: string
  readonly clouds: string
  readonly wind: string
}

function perSide(ids: readonly number[], sim: Simulation): string {
  const french = ids.filter((id) => sim.soldiers.side.value[id] === Side.French).length
  return `${french} French, ${ids.length - french} German`
}

/** Battlefield counts: soldiers, the fallen, prisoners, artillery, clouds and wind. */
export function worldStats(sim: Simulation): WorldStats {
  const seconds = Math.floor(sim.tick / TICK_RATE)
  const minutes = Math.floor(seconds / 60)
  const activeCells = (concentration: Float32Array) =>
    concentration.reduce((count, value) => count + (value > 0 ? 1 : 0), 0)
  const missions = sim.artillery.missions.filter((mission) => !mission.finished).length
  const windSpeed = Math.sqrt(sim.wind.x ** 2 + sim.wind.z ** 2)
  return {
    clock: `Tick ${sim.tick}, ${minutes}:${String(seconds % 60).padStart(2, "0")} of battle`,
    soldiers: perSide(soldierIds(sim), sim),
    fallen: perSide(fallenIds(sim), sim),
    prisoners: perSide(capturedIds(sim), sim),
    artillery: `${missions} fire missions, ${sim.artillery.shells.length} shells in flight`,
    clouds: `Gas ${activeCells(sim.gas.concentration)} cells, smoke ${activeCells(sim.smoke.concentration)} cells`,
    wind: `Wind ${windSpeed.toFixed(1)} m/s`
  }
}
