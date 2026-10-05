import { Shell, Side, spawnSoldier, TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { slot, testBattle } from "./test-battle.ts"
import { createThreatWatch } from "./threats.ts"

describe("where the danger comes from", () => {
  it("marks enemy fire at or close past the man under control, from where it was fired, fading", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    const german = spawnSoldier(sim, { side: Side.German, x: 40, z: 150 })
    const far = spawnSoldier(sim, { side: Side.German, x: 200, z: 150 })
    const watch = createThreatWatch(sim, squad, TICK_RATE)
    const at = { x: sim.soldiers.position.x[leader], y: 1, z: sim.soldiers.position.z[leader] }
    watch.record([
      { type: "shot", shooter: german, target: leader, hit: false, from: { x: 40, y: 1.5, z: 150 }, to: at },
      // Fired at someone else, well wide of him: not his danger.
      {
        type: "shot",
        shooter: far,
        target: -1,
        hit: false,
        from: { x: 200, y: 1.5, z: 150 },
        to: { x: 200, y: 0, z: 90 }
      },
      // Our own fire is never marked.
      { type: "shot", shooter: slot(members, 1), target: -1, hit: false, from: at, to: { x: 40, y: 0, z: 150 } }
    ])
    const [threat, ...rest] = watch.read()
    expect(rest).toEqual([])
    expect(threat).toMatchObject({ kind: "fire", x: 40, z: 150, strength: 1 })
    sim.tick += TICK_RATE * 2
    expect(watch.read()).toEqual([])
  })

  it("warns of shells about to land near him, heavy ones as heavy", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    const x = sim.soldiers.position.x[leader]
    const z = sim.soldiers.position.z[leader]
    const watch = createThreatWatch(sim, squad, TICK_RATE)
    sim.artillery.shells.push(
      { shell: Shell.HeavyHighExplosive, side: Side.German, x: x + 10, z, landsAtTick: sim.tick + TICK_RATE },
      { shell: Shell.FieldHighExplosive, side: Side.German, x: x + 200, z, landsAtTick: sim.tick + TICK_RATE },
      { shell: Shell.FieldHighExplosive, side: Side.German, x, z: z + 5, landsAtTick: sim.tick + TICK_RATE * 10 }
    )
    const threats = watch.read()
    expect(threats).toHaveLength(1)
    expect(threats[0]).toMatchObject({ kind: "heavy", x: x + 10 })
    expect(threats[0]?.strength).toBeCloseTo(2 / 3, 5)
  })
})
