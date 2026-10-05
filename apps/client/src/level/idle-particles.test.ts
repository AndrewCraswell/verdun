import { Buffer } from "@babylonjs/core/Buffers/buffer"
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { pauseIdleParticles } from "./idle-particles.ts"

const engines: NullEngine[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function scene({ pausing = true } = {}): Scene {
  const engine = new NullEngine()
  engines.push(engine)
  const world = new Scene(engine)
  world.activeCamera = new FreeCamera("camera", new Vector3(0, 10, -10), world)
  if (pausing) {
    pauseIdleParticles(world)
  }
  return world
}

/**
 * A started system, emitting only when told, as the shells' bursts and the tracers do; or by its rate, as the rain
 * does. The null engine loads no texture or shader, so it's taken as ready and drawn as nothing.
 */
function system(world: Scene, name: string, { rate }: { readonly rate?: number } = {}): ParticleSystem {
  const made = new ParticleSystem(name, 50, world)
  made.emitter = Vector3.Zero()
  made.minLifeTime = made.maxLifeTime = 10
  if (rate === undefined) {
    made.manualEmitCount = 0
  } else {
    made.emitRate = rate
  }
  vi.spyOn(made, "isReady").mockReturnValue(true)
  vi.spyOn(made, "render").mockReturnValue(0)
  made.start()
  return made
}

describe("pauseIdleParticles", () => {
  it("pauses a system with nothing alive and nothing to make, and wakes it in the frame it's told to emit", () => {
    const world = scene()
    const burst = system(world, "burst")

    world.render()
    expect(burst.paused).toBe(true)

    burst.manualEmitCount = 5
    world.render()
    expect(burst.particles).toHaveLength(5)
    // Animated while what it made lives, and paused again once the last has gone.
    world.render()
    expect(burst.paused).toBe(false)
    burst.updateSpeed = 1000
    world.render()
    world.render()
    expect(burst.particles).toHaveLength(0)
    expect(burst.paused).toBe(true)
  })

  it("stops the upload of the whole vertex buffer Babylon makes for a system holding nothing", () => {
    const upload = vi.spyOn(Buffer.prototype, "updateDirectly")
    const unpaused = scene({ pausing: false })
    system(unpaused, "burst")
    unpaused.render()
    // A count of none, which Babylon reads as the whole buffer.
    expect(upload).toHaveBeenCalledWith(expect.any(Float32Array), 0, 0)

    const world = scene()
    system(world, "burst")
    world.render()
    upload.mockClear()
    world.render()
    world.render()
    expect(upload).not.toHaveBeenCalled()
  })

  it("keeps a system emitting by its rate running, and pauses it while the rate is none", () => {
    const world = scene()
    const rain = system(world, "rain", { rate: 0 })

    world.render()
    expect(rain.paused).toBe(true)
    rain.emitRate = 100
    world.render()
    expect(rain.paused).toBe(false)
  })

  it("leaves alone systems not started, on a clock, ending, or paused by hand", () => {
    const world = scene()
    // Paused before it starts, it would skip the warm-up a start gives it.
    const waiting = new ParticleSystem("waiting", 50, world)
    waiting.emitter = Vector3.Zero()
    const timed = system(world, "timed")
    timed.targetStopDuration = 2
    const ending = system(world, "ending")
    ending.disposeOnStop = true
    const held = system(world, "held")
    held.paused = true
    held.manualEmitCount = 5

    world.render()
    expect([waiting, timed, ending, held].map((each) => each.paused)).toEqual([false, false, false, true])
    expect(held.particles).toHaveLength(0)
  })
})
