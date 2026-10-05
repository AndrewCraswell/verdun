import { describe, expect, it } from "vitest"
import { giveWay, Priority, priorityOf } from "./voice-priority.ts"

describe("priorityOf", () => {
  it("puts shouts and rounds cracking past first, the fight close by next, and the far battle last", () => {
    expect(priorityOf("voice-gas-fr")).toBe(Priority.Urgent)
    expect(priorityOf("whistle")).toBe(Priority.Urgent)
    expect(priorityOf("crack")).toBe(Priority.Urgent)
    expect(priorityOf("rifle-de-near")).toBe(Priority.Near)
    expect(priorityOf("bullet-impact")).toBe(Priority.Near)
    expect(priorityOf("pain")).toBe(Priority.Near)
    expect(priorityOf("battery-heavy")).toBe(Priority.Far)
    expect(priorityOf("heavy-far")).toBe(Priority.Far)
    expect(priorityOf("step-mud")).toBe(Priority.Far)
  })
})

describe("giveWay", () => {
  const far = (volume: number) => ({ priority: Priority.Far, volume })
  const shout = { priority: Priority.Urgent, volume: 0.1 }

  it("stops a far sound, however loud, to let a quiet shout through", () => {
    expect(giveWay([far(0.9), far(0.5), { priority: Priority.Near, volume: 0.05 }], shout)).toBe(1)
  })

  it("stops the quietest of the least needed, and drops a sound no more needed than any playing", () => {
    expect(giveWay([far(0.4), far(0.2), far(0.3)], far(0.3))).toBe(1)
    expect(giveWay([far(0.4), far(0.2)], far(0.1))).toBeNull()
    expect(giveWay([shout, shout], far(1))).toBeNull()
  })
})
