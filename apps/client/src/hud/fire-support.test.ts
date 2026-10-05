import {
  attackBehindBarrage,
  bombardEnemyLine,
  callForFire,
  callGasOn,
  enqueueCommand,
  Shell,
  Side,
  stepSimulation,
  TICK_RATE
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { callsOf, countdownWord, createShellLedger, missionsOf } from "./fire-support.ts"
import { testBattle } from "./test-battle.ts"

/** Sets the French batteries' stock of a kind of shell: unlimited until a scenario says otherwise. */
const ammunition = (sim: ReturnType<typeof testBattle>["sim"], shell: Shell, rounds: number) =>
  enqueueCommand(sim, { type: "ammunition", side: Side.French, shell, rounds })

describe("missionsOf", () => {
  it("shows a bombardment's three missions as one, counting down to its first rounds", () => {
    const { sim } = testBattle()
    bombardEnemyLine(sim, Side.French)
    stepSimulation(sim)
    const [bombardment, ...others] = missionsOf(sim, Side.French, TICK_RATE, { x: 150, z: 20 })
    expect(others).toEqual([])
    expect(bombardment).toMatchObject({
      kind: "bombardment",
      label: "Bombardment",
      place: "the enemy line",
      phase: "pending",
      creep: null
    })
    expect(bombardment?.footprints).toHaveLength(3)
    expect(bombardment?.shells).toEqual([Shell.HeavyHighExplosive, Shell.FieldHighExplosive])
    expect(bombardment?.seconds).toBeGreaterThan(4.5)
    expect(bombardment?.seconds).toBeLessThanOrEqual(5)
    expect(bombardment && countdownWord(bombardment)).toBe("Rounds in")
    for (let step = 0; step < 6 * TICK_RATE; step++) {
      stepSimulation(sim)
    }
    const firing = missionsOf(sim, Side.French, TICK_RATE, null)[0]
    expect(firing?.phase).toBe("firing")
    expect(firing && countdownWord(firing)).toBe("Firing")
    expect(firing?.seconds).toBeGreaterThan(110)
    expect(firing?.progress).toBeGreaterThan(0)
    // The enemy's own missions are no business of the player's panel.
    expect(missionsOf(sim, Side.German, TICK_RATE, null)).toEqual([])
  })

  it("names a call for fire after the objective it falls near, or by distance and direction", () => {
    const { sim } = testBattle()
    callForFire(sim, Side.French, 150, 110)
    callGasOn(sim, Side.French, 280, 150)
    stepSimulation(sim)
    const [fire, gas] = missionsOf(sim, Side.French, TICK_RATE, { x: 280, z: 20 })
    expect(fire).toMatchObject({ kind: "fire", label: "Fire mission", place: "near Crossroads" })
    expect(gas).toMatchObject({ kind: "gas", label: "Gas shoot", place: "130 m north" })
    expect(missionsOf(sim, Side.French, TICK_RATE, null)[1]?.place).toBe("on the map")
  })

  it("follows a creeping barrage to its next lift", () => {
    const { sim } = testBattle()
    attackBehindBarrage(sim, Side.French)
    stepSimulation(sim)
    const [barrage] = missionsOf(sim, Side.French, TICK_RATE, null)
    expect(barrage).toMatchObject({ kind: "creeping", label: "Creeping barrage", place: "ahead of our line" })
    expect(barrage?.phase).toBe("firing")
    expect(barrage?.creep?.direction).toBe(1)
    expect(barrage?.seconds).toBeLessThanOrEqual(90)
    expect(barrage && countdownWord(barrage)).toBe("Lifts in")
  })
})

describe("callsOf", () => {
  it("offers the four calls on their keys, and says why one won't fire", () => {
    const { sim } = testBattle()
    ammunition(sim, Shell.FieldGas, 0)
    stepSimulation(sim)
    const calls = callsOf(sim, Side.French, [])
    expect(calls.map((call) => [call.key, call.label, call.available])).toEqual([
      ["B", "Bombard", true],
      ["V", "Fire mission", true],
      ["X", "Gas shoot", false],
      ["G", "Whistle", true]
    ])
    expect(calls[2]?.reason).toBe("No shells left")
  })

  it("lights a call already firing, and holds it back", () => {
    const { sim } = testBattle()
    bombardEnemyLine(sim, Side.French)
    stepSimulation(sim)
    const calls = callsOf(sim, Side.French, missionsOf(sim, Side.French, TICK_RATE, null))
    expect(calls[0]).toMatchObject({ id: "bombard", active: true, available: false, reason: "Bombardment firing" })
  })
})

describe("the shell ledger", () => {
  it("counts each kind of shell the scenario limits, against the most the side has held", () => {
    const { sim } = testBattle()
    const ledger = createShellLedger()
    expect(ledger.stocks(sim, Side.French)).toEqual([])
    ammunition(sim, Shell.FieldHighExplosive, 800)
    stepSimulation(sim)
    expect(ledger.stocks(sim, Side.French)).toEqual([
      { shell: Shell.FieldHighExplosive, label: "Field HE", left: 800, share: 1 }
    ])
    ammunition(sim, Shell.FieldHighExplosive, 600)
    stepSimulation(sim)
    expect(ledger.stocks(sim, Side.French)[0]).toMatchObject({ left: 600, share: 0.75 })
  })
})
