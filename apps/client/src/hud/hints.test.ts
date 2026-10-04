import { MaskState, Stance, stepSimulation } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { browserHintStore, createHints, type HintStore } from "./hints.ts"
import { slot, testBattle } from "./test-battle.ts"

function memoryStore(done: readonly string[] = []): HintStore & { saved: readonly string[] } {
  let saved = done
  return {
    get saved() {
      return saved
    },
    load: () => saved,
    save(next) {
      saved = next
    }
  }
}

describe("the prompts", () => {
  it("waits a moment, then teaches one thing at a time until the player does it", () => {
    const { sim, squad, members } = testBattle()
    const store = memoryStore()
    const hints = createHints(sim, squad, store, 100)
    expect(hints.read(101)).toBeNull()
    const first = hints.read(104)
    expect(first).toMatchObject({ id: "move", step: { index: 1, of: 10 } })
    expect(first?.text).toContain("[W] [A] [S] [D]")
    expect(hints.read(110)?.id).toBe("move")
    sim.soldiers.position.x[slot(members, 0)] += 6
    expect(hints.read(111)).toBeNull()
    expect(store.saved).toEqual(["move"])
    // A short pause between prompts.
    expect(hints.read(111.5)).toBeNull()
    expect(hints.read(113)?.id).toBe("fire")
  })

  it("skips what the player already knows, kept from earlier visits", () => {
    const { sim, squad } = testBattle()
    const hints = createHints(sim, squad, memoryStore(["move", "fire", "aim"]), 0)
    expect(hints.read(5)?.id).toBe("prone")
  })

  it("passes a prompt as soon as it's done, even if it was done first", () => {
    const { sim, squad, members } = testBattle()
    const store = memoryStore(["move", "fire", "aim"])
    const hints = createHints(sim, squad, store, 0)
    sim.soldiers.stance.value[slot(members, 0)] = Stance.Prone
    expect(hints.read(5)?.id).toBe("prone")
    expect(hints.read(6)).toBeNull()
    expect(store.saved).toContain("prone")
  })

  it("puts what's happening now ahead of the lesson, once", () => {
    const { sim, squad, members } = testBattle()
    const store = memoryStore()
    const hints = createHints(sim, squad, store, 0)
    expect(hints.read(5)?.id).toBe("move")
    sim.soldiers.mask.state[slot(members, 3)] = MaskState.On
    const gas = hints.read(6)
    expect(gas).toMatchObject({ id: "gas", step: null })
    expect(hints.read(10)?.id).toBe("gas")
    expect(hints.read(16)).toBeNull()
    expect(store.saved).toContain("gas")
    expect(hints.read(18)?.id).toBe("move")
  })

  it("can be turned off", () => {
    const { sim, squad } = testBattle()
    const hints = createHints(sim, squad, memoryStore(), 0)
    expect(hints.read(5)).not.toBeNull()
    hints.enabled = false
    expect(hints.enabled).toBe(false)
    expect(hints.read(6)).toBeNull()
  })

  it("teaches switching, orders, the overview and the guns by what the player does", () => {
    const { sim, squad, members } = testBattle()
    const hints = createHints(sim, squad, memoryStore(["move", "fire", "aim", "prone"]), 0)
    expect(hints.read(5)?.id).toBe("switch")
    squad.leader = slot(members, 2)
    expect(hints.read(6)).toBeNull()
    const orders = hints.read(8)
    expect(orders?.id).toBe("orders")
    // The keys come from the game's own bindings.
    expect(orders?.text).toMatch(/^\[F\] the squad follows you, \[H\] it holds, \[E\]/)
    squad.order = { kind: "follow" }
    expect(hints.read(9)).toBeNull()
    expect(hints.read(10.6)?.id).toBe("overview")
    expect(hints.read(11)?.id).toBe("overview")
    expect(hints.read(11.5, { overview: true })).toBeNull()
    expect(hints.read(13)?.id).toBe("grenade")
    sim.soldiers.grenades.count[slot(members, 2)] = 2
    expect(hints.read(13.5)).toBeNull()
    expect(hints.read(15)?.id).toBe("guns")
    sim.pendingCommands.push({
      type: "fire-mission",
      plan: { side: 0, shell: 0, fromX: 100, toX: 160, z: 150, band: 20, roundsPerMinute: 10, delay: 30, duration: 30 }
    })
    stepSimulation(sim)
    expect(hints.read(16)).toBeNull()
    expect(hints.read(18)?.id).toBe("whistle")
  })

  it("lets a prompt with nothing to do go once it has been read", () => {
    const { sim, squad } = testBattle()
    const store = memoryStore(["move", "fire"])
    const hints = createHints(sim, squad, store, 0)
    expect(hints.read(5)?.text).toContain("[Right button]")
    expect(hints.read(13)?.id).toBe("aim")
    expect(hints.read(14.5)).toBeNull()
    expect(store.saved).toContain("aim")
  })

  it("keeps nothing where the browser's storage is out of reach", () => {
    const store = browserHintStore("test.hints")
    expect(store.load()).toEqual([])
    expect(() => store.save(["move"])).not.toThrow()
  })
})
