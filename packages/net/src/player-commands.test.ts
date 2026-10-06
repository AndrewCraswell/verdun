import { createFlatMap } from "@verdun/map"
import { createSimulation, createSquad, Shell, Side, spawnSoldier } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { playerCommand } from "./player-commands.ts"

/** The player's French squad, a French squad of bots beside it, another player's, and a German squad. */
function line() {
  const sim = createSimulation({ map: createFlatMap({ name: "field", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
  const men = (side: Side, x: number) =>
    Array.from({ length: 4 }, (_, index) => spawnSoldier(sim, { side, x: x + index, z: 20 }))
  const ours = createSquad(sim, Side.French, men(Side.French, 10), "player")
  const bots = createSquad(sim, Side.French, men(Side.French, 30))
  const theirs = createSquad(sim, Side.French, men(Side.French, 50), "player")
  const enemy = createSquad(sim, Side.German, men(Side.German, 70))
  return { sim, ours, bots, theirs, enemy }
}

const plan = {
  side: Side.French,
  shell: Shell.FieldHighExplosive,
  fromX: 10,
  toX: 40,
  z: 80,
  band: 10,
  roundsPerMinute: 60,
  delay: 30,
  duration: 45
}

const attack = {
  type: "barrage-attack",
  side: Side.French,
  fromX: 0,
  toX: 100,
  startZ: 40,
  objectiveZ: 80,
  roundsPerMinute: 200,
  lift: 25,
  interval: 60,
  standoff: 50,
  delay: 5
}

describe("what a player may command", () => {
  it("moves, aims and fires the men of their own squad, and no one else's", () => {
    const { sim, ours, enemy } = line()
    const man = ours.members[1]!
    const foe = enemy.members[0]!

    expect(playerCommand(sim, ours, { type: "move-to", soldier: man, x: 5, z: 6, run: true, extra: 1 })).toEqual({
      type: "move-to",
      soldier: man,
      x: 5,
      z: 6,
      run: true
    })
    expect(playerCommand(sim, ours, { type: "steer", soldier: man, x: 1, z: 0 })).toEqual({
      type: "steer",
      soldier: man,
      x: 1,
      z: 0,
      run: false
    })
    expect(playerCommand(sim, ours, { type: "face", soldier: man, x: 0, z: 1 })).toEqual({
      type: "face",
      soldier: man,
      x: 0,
      z: 1
    })
    expect(playerCommand(sim, ours, { type: "throw-grenade", soldier: man, x: 3, z: 30 })).toEqual({
      type: "throw-grenade",
      soldier: man,
      x: 3,
      z: 30
    })
    expect(playerCommand(sim, ours, { type: "fire", soldier: man })).toEqual({ type: "fire", soldier: man })
    expect(playerCommand(sim, ours, { type: "stance", soldier: man, stance: "prone" })).toEqual({
      type: "stance",
      soldier: man,
      stance: "prone"
    })

    expect(playerCommand(sim, ours, { type: "reload", soldier: man })).toEqual({ type: "reload", soldier: man })
    expect(playerCommand(sim, ours, { type: "man-gun", soldier: man })).toEqual({ type: "man-gun", soldier: man })
    expect(playerCommand(sim, ours, { type: "vault", soldier: man, x: 0, z: 1 })).toEqual({
      type: "vault",
      soldier: man,
      x: 0,
      z: 1
    })
    expect(playerCommand(sim, ours, { type: "cut-wire", soldier: man, x: "north" })).toEqual({
      type: "cut-wire",
      soldier: man
    })

    expect(playerCommand(sim, ours, { type: "fire", soldier: foe })).toBeNull()
    expect(playerCommand(sim, ours, { type: "vault", soldier: foe })).toBeNull()
    expect(playerCommand(sim, ours, { type: "steer", soldier: foe, x: 1, z: 0 })).toBeNull()
    expect(playerCommand(sim, ours, { type: "move-to", soldier: man, x: Number.NaN, z: 0 })).toBeNull()
    expect(playerCommand(sim, ours, { type: "stance", soldier: man, stance: "sheltering" })).toBeNull()
  })

  it("gives their own squad its orders, and chooses which squad of bots to lead", () => {
    const { sim, ours, bots, theirs, enemy } = line()
    const order = (value: unknown) => playerCommand(sim, ours, { type: "squad-order", squad: ours.id, order: value })

    expect(order({ kind: "follow" })).toEqual({ type: "squad-order", squad: ours.id, order: { kind: "follow" } })
    expect(order({ kind: "advance", x: 4, z: 50 })).toEqual({
      type: "squad-order",
      squad: ours.id,
      order: { kind: "advance", x: 4, z: 50 }
    })
    expect(order({ kind: "reserve" })).toBeNull()
    expect(order("hold")).toBeNull()
    expect(playerCommand(sim, ours, { type: "squad-order", squad: bots.id, order: { kind: "hold" } })).toBeNull()

    expect(playerCommand(sim, ours, { type: "take-command", squad: ours.id, soldier: ours.members[2] })).toEqual({
      type: "take-command",
      squad: ours.id,
      soldier: ours.members[2]
    })
    expect(playerCommand(sim, ours, { type: "take-command", squad: ours.id, soldier: bots.members[0] })).toBeNull()

    expect(playerCommand(sim, ours, { type: "join-squad", squad: ours.id, from: bots.id })).toEqual({
      type: "join-squad",
      squad: ours.id,
      from: bots.id
    })
    expect(playerCommand(sim, ours, { type: "take-over-squad", squad: ours.id, from: enemy.id })).toEqual({
      type: "take-over-squad",
      squad: ours.id,
      from: enemy.id
    })
    // Another player's squad is theirs to lead.
    expect(playerCommand(sim, ours, { type: "join-squad", squad: ours.id, from: theirs.id })).toBeNull()
    expect(playerCommand(sim, ours, { type: "join-squad", squad: theirs.id, from: bots.id })).toBeNull()
  })

  it("calls on their own side's guns", () => {
    const { sim, ours } = line()
    const creep = { lift: 25, interval: 60, stopZ: 120, protect: { objectiveZ: 80, lineZ: 120 } }

    expect(playerCommand(sim, ours, { type: "fire-mission", plan })).toEqual({ type: "fire-mission", plan })
    expect(playerCommand(sim, ours, { type: "fire-mission", plan: { ...plan, creep, observed: true } })).toEqual({
      type: "fire-mission",
      plan: { ...plan, creep, observed: true }
    })
    const { protect, ...unprotected } = creep
    void protect
    expect(playerCommand(sim, ours, { type: "fire-mission", plan: { ...plan, creep: unprotected } })).toEqual({
      type: "fire-mission",
      plan: { ...plan, creep: unprotected }
    })
    expect(playerCommand(sim, ours, attack)).toEqual(attack)
    const whole = { ...attack, standingRoundsPerMinute: 30, objectiveDepth: 15, squads: [0, 1] }
    expect(playerCommand(sim, ours, whole)).toEqual(whole)

    expect(playerCommand(sim, ours, { type: "fire-mission", plan: { ...plan, side: Side.German } })).toBeNull()
    expect(playerCommand(sim, ours, { type: "fire-mission", plan: { ...plan, shell: 9 } })).toBeNull()
    expect(playerCommand(sim, ours, { type: "fire-mission", plan: { ...plan, band: "wide" } })).toBeNull()
    expect(playerCommand(sim, ours, { type: "fire-mission", plan: { ...plan, creep: { lift: 25 } } })).toBeNull()
    expect(playerCommand(sim, ours, { type: "fire-mission", plan: { ...plan, creep: 3 } })).toBeNull()
    expect(
      playerCommand(sim, ours, { type: "fire-mission", plan: { ...plan, creep: { ...creep, protect: { lineZ: 1 } } } })
    ).toBeNull()
    expect(playerCommand(sim, ours, { type: "fire-mission", plan: null })).toBeNull()
    expect(playerCommand(sim, ours, { ...attack, side: Side.German })).toBeNull()
    expect(playerCommand(sim, ours, { ...attack, squads: ["all"] })).toBeNull()
  })

  it("lets the dev keys through only on a dev server", () => {
    const { sim, ours, enemy } = line()
    const kill = { type: "kill", soldier: enemy.members[0] }
    const clock = { type: "clock", shift: 3_600_000 }
    const wind = { type: "wind", x: 2, z: 0 }

    expect(playerCommand(sim, ours, kill)).toBeNull()
    expect(playerCommand(sim, ours, clock)).toBeNull()
    expect(playerCommand(sim, ours, wind)).toBeNull()
    expect(playerCommand(sim, ours, kill, true)).toEqual(kill)
    expect(playerCommand(sim, ours, clock, true)).toEqual(clock)
    expect(playerCommand(sim, ours, { type: "clock", week: "next" }, true)).toBeNull()
    expect(playerCommand(sim, ours, wind, true)).toEqual(wind)
  })

  it("ignores anything else", () => {
    const { sim, ours } = line()

    expect(playerCommand(sim, ours, { type: "forecast", forecast: { kind: "cycle", seed: 1 } }, true)).toBeNull()
    expect(playerCommand(sim, ours, { type: "ammunition", side: Side.French, shell: 0, rounds: 1e6 }, true)).toBeNull()
    expect(playerCommand(sim, ours, "fire")).toBeNull()
    expect(playerCommand(sim, ours, [{ type: "fire" }])).toBeNull()
  })
})
