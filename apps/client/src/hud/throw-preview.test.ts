import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { createSimulation, createSquad, GRENADE_RANGE, Side, spawnSoldier, Stance } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { throwPreview } from "./throw-preview.ts"

/** A field with a fire trench along z = 100, and the player's squad of two in it. */
function battle() {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const trench: Trench = {
    kind: "fire",
    points: [
      [20, 100],
      [180, 100]
    ],
    facing: "north"
  }
  carveTrenches(map, [trench])
  const sim = createSimulation({ map: { ...map, trenches: [trench] }, seed: 3 })
  const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 99.6 })
  const mate = spawnSoldier(sim, { side: Side.French, x: 104, z: 99.6 })
  const squad = createSquad(sim, Side.French, [thrower, mate], "player")
  return { sim, squad, thrower, mate }
}

describe("the throw preview", () => {
  it("shows a throw that clears the parapet, with its reach, blast, spread and fuse", () => {
    const { sim, squad } = battle()
    const preview = throwPreview(sim, squad, { x: 100, z: 120 })
    expect(preview).toMatchObject({ verdict: "clear", reach: GRENADE_RANGE.max, blast: 3, fuse: 4.5, grenades: 3 })
    expect(preview?.distance).toBeCloseTo(20.4, 1)
    expect(preview?.scatter).toBeCloseTo(1 + 0.06 * 20.4, 1)
    expect(preview?.flight.struck).toBeNull()
  })

  it("warns that a throw from too low won't clear the wall, and rolls back", () => {
    const { sim, squad, thrower } = battle()
    sim.soldiers.stance.value[thrower] = Stance.Prone
    const preview = throwPreview(sim, squad, { x: 100, z: 118 })
    // Rolling back into his own bay puts him in the blast: the worse of the two is said.
    expect(preview?.verdict).toBe("danger")
    expect(preview?.flight.struck).not.toBeNull()
    expect(preview?.ourMenInBlast).toBeGreaterThan(0)
  })

  it("says when it's too far, when our men are near where it would burst, and when there's nothing to throw", () => {
    const { sim, squad, thrower } = battle()
    expect(throwPreview(sim, squad, { x: 100, z: 160 })?.verdict).toBe("short")
    expect(throwPreview(sim, squad, { x: 106, z: 99.6 })?.verdict).toBe("danger")
    sim.soldiers.grenades.count[thrower] = 0
    expect(throwPreview(sim, squad, { x: 100, z: 120 })?.verdict).toBe("none")
    squad.leader = -1
    expect(throwPreview(sim, squad, { x: 100, z: 120 })).toBeNull()
  })
})
