import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
import { type BurstEvent, Shell } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { createShellBursts } from "./shell-burst.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function setup() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 3)
  const sprite = new Texture(null, scene)
  const wind = { x: 4, z: -1 }
  const bursts = createShellBursts(
    scene,
    map,
    { mist: sprite, puff: sprite, smoke: sprite, fire: sprite, ember: sprite },
    () => wind
  )
  const queued = (name: string) => bursts.systems.find((system) => system.name === name)?.manualEmitCount ?? -1
  return { bursts, queued }
}

const burst = (shell: Shell, y = 3): BurstEvent => ({ type: "burst", shell, at: { x: 50, y, z: 50 }, crater: null })

describe("createShellBursts", () => {
  it("throws up a flash, a fireball, a column of earth, dust, sparks and black smoke for high explosive", () => {
    const { bursts, queued } = setup()

    bursts.burst(burst(Shell.FieldHighExplosive))

    for (const name of ["flash", "fireball", "column", "earth", "dust", "smoke"]) {
      expect(queued(`burst-${name}-field`)).toBeGreaterThan(0)
      expect(queued(`burst-${name}-heavy`)).toBe(0)
    }
    expect(queued("burst-sparks")).toBeGreaterThan(0)
  })

  it("gives a heavy howitzer's shell its own, bigger and denser systems", () => {
    const { bursts, queued } = setup()

    bursts.burst(burst(Shell.HeavyHighExplosive))
    const field = setup()
    field.bursts.burst(burst(Shell.FieldHighExplosive))

    expect(queued("burst-column-heavy")).toBeGreaterThan(field.queued("burst-column-field"))
    expect(queued("burst-flash-field")).toBe(0)
    const size = (name: string) =>
      bursts.systems
        .find((system) => system.name === name)
        ?.getSizeGradients()
        ?.at(-1)?.factor1 ?? 0
    expect(size("burst-column-heavy")).toBeGreaterThan(size("burst-column-field"))
  })

  it("bursts shrapnel in the air as a ball of white smoke over a patter of dust, with no column of earth", () => {
    const { bursts, queued } = setup()

    bursts.burst(burst(Shell.FieldShrapnel, 20))

    expect(queued("burst-shrapnel")).toBeGreaterThan(0)
    expect(queued("burst-shrapnel-strikes")).toBeGreaterThan(0)
    expect(queued("burst-column-field")).toBe(0)
  })

  it("pops gas shells and grenades with little earth and no fireball for gas", () => {
    const { bursts, queued } = setup()

    bursts.burst(burst(Shell.FieldGas))
    expect(queued("burst-gas")).toBeGreaterThan(0)
    expect(queued("burst-fireball-field")).toBe(0)

    bursts.burst(burst(Shell.Grenade))
    expect(queued("burst-fireball-field")).toBeGreaterThan(0)
  })

  it("lets smoke and dust drift with the wind, and disposes every system", () => {
    const { bursts } = setup()

    bursts.update()

    const smoke = bursts.systems.find((system) => system.name === "burst-smoke-field")
    expect(smoke?.gravity.x).toBeCloseTo(1)
    expect(smoke?.gravity.z).toBeCloseTo(-0.25)
    const scene = smoke?.getScene()
    bursts.dispose()
    expect(scene?.particleSystems).toHaveLength(0)
  })
})
