import { createFlatMap } from "@verdun/map"
import { createSimulation, createSquad, enqueueCommand, isAlive, Side, spawnSoldier, stepSimulation } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createPlayers } from "./players.ts"

/** Five French squads of bots in the line, one in reserve behind it, and two German squads. */
function line() {
  const sim = createSimulation({ map: createFlatMap({ name: "field", cellSize: 1, columns: 200, rows: 100 }), seed: 1 })
  const squad = (side: Side, x: number, z: number) =>
    createSquad(
      sim,
      side,
      Array.from({ length: 4 }, (_, index) => spawnSoldier(sim, { side, x: x + index * 3, z }))
    )
  const french = [0, 1, 2, 3, 4].map((index) => squad(Side.French, 10 + index * 30, 20))
  const reserve = squad(Side.French, 70, 5)
  reserve.order = { kind: "reserve" }
  const german = [0, 1].map((index) => squad(Side.German, 10 + index * 30, 80))
  return { sim, french, reserve, german }
}

describe("players in a sector", () => {
  it("each lead a squad of their side, from the middle of its line outward, and none the same", () => {
    const { sim, french, german } = line()
    const players = createPlayers(sim)

    expect(players.join("a", Side.French)).toBe(french[2])
    expect(players.join("b", Side.French)).toBe(french[3])
    expect(players.join("c", Side.German)).toBe(german[1])
    stepSimulation(sim)

    expect(french[2]?.controller).toBe("player")
    expect(french[3]?.controller).toBe("player")
    expect(players.squadOf("a")).toBe(french[2])
    expect(players.squadOf("nobody")).toBeNull()
  })

  it("can't join a side whose every squad is led, in reserve or fallen", () => {
    const { sim, german } = line()
    const players = createPlayers(sim)
    for (const member of german[0]?.members ?? []) {
      enqueueCommand(sim, { type: "kill", soldier: member })
    }
    stepSimulation(sim)

    expect(players.join("a", Side.German)).toBe(german[1])
    expect(players.join("b", Side.German)).toBeNull()
  })

  it("hand their squad back to the bots when they leave, and free it for the next player", () => {
    const { sim, french } = line()
    const players = createPlayers(sim)
    players.join("a", Side.French)
    stepSimulation(sim)
    players.leave("a")
    players.leave("a")
    stepSimulation(sim)

    expect(french[2]?.controller).toBe("ai")
    expect(players.squadOf("a")).toBeNull()
    expect(players.join("b", Side.French)).toBe(french[2])
  })

  it("command only what their squad may do", () => {
    const { sim, french, german } = line()
    const players = createPlayers(sim)
    const squad = players.join("a", Side.French)
    const leader = squad?.members[0] ?? -1
    const foe = german[0]?.members[0] ?? -1
    stepSimulation(sim)

    expect(
      players.command("a", [
        { type: "steer", soldier: leader, x: 1, z: 0 },
        { type: "kill", soldier: foe }
      ])
    ).toEqual(["kill"])
    expect(players.command("a", { type: "fire", soldier: foe })).toEqual(["fire"])
    expect(players.command("a", [3])).toEqual(["?"])
    expect(players.command("stranger", [{ type: "steer", soldier: leader, x: 1, z: 0 }])).toEqual(["steer"])
    const x = sim.soldiers.position.x[leader]
    stepSimulation(sim)

    expect(sim.soldiers.position.x[leader]).toBeGreaterThan(x)
    expect(isAlive(sim, foe)).toBe(true)
    expect(french[2]?.controller).toBe("player")
  })

  it("have each batch of their commands acknowledged with the tick that applied it", () => {
    const { sim } = line()
    const players = createPlayers(sim)
    const squad = players.join("a", Side.French)
    players.join("b", Side.French)
    const leader = squad?.members[0] ?? -1
    stepSimulation(sim)
    expect(players.acknowledgements().size).toBe(0)

    players.command("a", { step: 7, commands: [{ type: "steer", soldier: leader, x: 1, z: 0 }] })
    players.command("a", { step: 8, commands: [] })
    players.command("b", [{ type: "fire", soldier: leader }])
    players.command("stranger", { step: 3, commands: [] })
    stepSimulation(sim)
    players.stepped()

    expect(players.acknowledgements()).toEqual(new Map([["a", { step: 8, tick: sim.tick }]]))
    expect(players.acknowledgements().size).toBe(0)
  })

  it("on a dev server, let the dev keys through", () => {
    const { sim, german } = line()
    const players = createPlayers(sim, true)
    players.join("a", Side.French)
    const foe = german[0]?.members[0] ?? -1

    expect(players.command("a", [{ type: "kill", soldier: foe }])).toEqual([])
  })
})
