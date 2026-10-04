import { carveTrenches, createFlatMap, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import type { Placement } from "./placement.ts"
import { layOutTrenchKit, TRENCH_PIECES } from "./trench-dressing.ts"

/**
 * A flat 100 m field at height 10 with a French front line that turns a right angle (east along z = 60, then north
 * along x = 70), a reserve line behind it, and a communication trench from the front line's bay south to the field's
 * edge.
 */
function field() {
  const front: Trench = {
    kind: "fire",
    points: [
      [10, 60],
      [70, 60],
      [70, 90]
    ],
    facing: "north"
  }
  const reserve: Trench = {
    kind: "fire",
    points: [
      [10, 20],
      [90, 20]
    ],
    facing: "north"
  }
  const communication: Trench = {
    kind: "communication",
    points: [
      [40, 60],
      [40, 30]
    ],
    facing: null
  }
  const trenches = [front, reserve, communication]
  const map = { ...createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 10), trenches }
  carveTrenches(map, trenches)
  return map
}

const placements = layOutTrenchKit(field())
const of = (piece: string) => placements.filter((placement) => placement.piece === piece)

/** Where a piece's local axis ends up after its yaw, as a ground direction. */
function turned(placement: Placement, x: number, z: number): [number, number] {
  const cos = Math.cos(placement.yaw)
  const sin = Math.sin(placement.yaw)
  return [x * cos + z * sin, -x * sin + z * cos]
}

describe("layOutTrenchKit", () => {
  it("puts a corner piece at the turn, its arms back along one leg and on along the other", () => {
    const [corner] = of(TRENCH_PIECES.corner)
    if (!corner) {
      throw new Error("no corner")
    }
    expect(of(TRENCH_PIECES.corner)).toHaveLength(1)
    expect([corner.x, corner.z]).toEqual([70, 60])
    // The corner's arms point along its -x and +z axes: here west (back along the bay) and north (on up the leg).
    const arms = [turned(corner, -1, 0), turned(corner, 0, 1)]
    expect(arms.some(([x, z]) => x < -0.99 && Math.abs(z) < 0.01)).toBe(true)
    expect(arms.some(([x, z]) => z > 0.99 && Math.abs(x) < 0.01)).toBe(true)
  })

  it("joins a trench ending on another with a T junction, its stem along the joining trench", () => {
    const tees = of(TRENCH_PIECES.tee)

    expect(tees).toHaveLength(1)
    const [tee] = tees
    expect(tee?.x).toBeCloseTo(40)
    expect(tee?.z).toBeCloseTo(60)
    // The stem is the junction's +z: south, down the communication trench.
    const [x, z] = tee ? turned(tee, 0, 1) : [0, 0]
    expect(z).toBeCloseTo(-1)
    expect(x).toBeCloseTo(0)
  })

  it("closes every free end with an end cap facing into its trench", () => {
    const ends = of(TRENCH_PIECES.end)

    // Both ends of each fire trench and the far end of the communication trench.
    expect(ends).toHaveLength(5)
    const west = ends.find((end) => end.x < 15 && end.z === 60)
    expect(west?.x).toBeCloseTo(10 + 1.61)
    const [x] = west ? turned(west, 0, 1) : [0]
    expect(x).toBeCloseTo(1)
  })

  it("fills the runs between turns and junctions with straight sections scaled to fit", () => {
    const straights = placements.filter(
      (placement) =>
        TRENCH_PIECES.straights.some((piece) => piece === placement.piece) || placement.piece === TRENCH_PIECES.dugout
    )
    const covered = straights.reduce((sum, straight) => sum + 3.22 * (straight.scale?.[2] ?? 1), 0)
    // The reserve line, 80 m less its two end caps, is all straight sections.
    const reserve = straights.filter((straight) => straight.z === 20)
    expect(reserve.reduce((sum, straight) => sum + 3.22 * (straight.scale?.[2] ?? 1), 0)).toBeCloseTo(80 - 2 * 3.22)
    expect(covered).toBeGreaterThan(150)
    expect(straights.every((straight) => (straight.scale?.[2] ?? 1) > 0.5 && (straight.scale?.[2] ?? 1) < 1.5)).toBe(
      true
    )
  })

  it("stands the kit on the trench floor", () => {
    const straight = placements.find((placement) => placement.z === 20 && placement.piece.includes("Straight"))

    expect(straight?.y).toBeCloseTo(10 - 1.9 + 1.4, 1)
  })

  it("lines the front wall of fire trench bays with fire steps, but not the legs or communication trenches", () => {
    const steps = [...of(TRENCH_PIECES.fireStepLong), ...of(TRENCH_PIECES.fireStepShort)]

    expect(steps.length).toBeGreaterThan(5)
    // North of their bay's centre line, toward the enemy, and never on the leg running north at x = 70.
    expect(steps.filter((step) => Math.abs(step.z - 60.725) < 0.01 || Math.abs(step.z - 20.725) < 0.01)).toHaveLength(
      steps.length
    )
  })

  it("puts duckboards down every trench", () => {
    const boards = of(TRENCH_PIECES.duckboard)

    expect(boards.some((board) => board.x === 40)).toBe(true)
    expect(boards.some((board) => board.x === 70)).toBe(true)
    expect(boards.length).toBeGreaterThan(40)
  })

  it("gives the front line ladders for going over the top, and only the rear lines dugouts", () => {
    const ladders = of(TRENCH_PIECES.ladder)
    const dugouts = of(TRENCH_PIECES.dugout)

    expect(ladders.length).toBeGreaterThan(0)
    expect(ladders.every((ladder) => ladder.z > 50)).toBe(true)
    expect(dugouts.length).toBeGreaterThan(0)
    expect(dugouts.every((dugout) => dugout.z === 20)).toBe(true)
  })

  it("dresses the lines as lived in: sandbags on the bays' parapets, stores along the walls, poles beside the saps", () => {
    const sandbags = of(TRENCH_PIECES.sandbags)
    const clutter = placements.filter(
      (placement) =>
        TRENCH_PIECES.clutter.some((piece) => piece === placement.piece) ||
        TRENCH_PIECES.leaning.some((piece) => piece === placement.piece)
    )
    const poles = of(TRENCH_PIECES.pole)

    // Sandbags lie 1.55 m in front of a bay's centre line, toward the enemy, and only on bays.
    expect(sandbags.every((bags) => Math.abs(bags.z - 61.55) < 0.01 || Math.abs(bags.z - 21.55) < 0.01)).toBe(true)
    expect(clutter.length).toBeGreaterThan(0)
    // Poles run beside the communication trench at x = 40, outside its spoil.
    expect(poles.length).toBeGreaterThan(0)
    expect(poles.every((pole) => Math.abs(Math.abs(pole.x - 40) - 3.4) < 0.01)).toBe(true)
  })

  it("lays the parapets' sandbags in courses a shell has broken here and there, below the eye on the fire step", () => {
    const courses = [...of(TRENCH_PIECES.sandbags), ...of(TRENCH_PIECES.sandbagsShort)]
    const heaps = of(TRENCH_PIECES.sandbagHeap)
    const floor = 10 - 1.9

    expect(heaps.length).toBeGreaterThan(0)
    // Each heap lies in a gap in its course: no length of wall covers it.
    for (const heap of heaps) {
      const covering = courses.filter(
        (bags) => Math.abs(bags.z - heap.z) < 1 && Math.abs(bags.x - heap.x) < ((bags.scale?.[0] ?? 1) * 8.78) / 2
      )
      expect(covering.filter((bags) => bags.piece === TRENCH_PIECES.sandbags)).toHaveLength(0)
    }
    // The course's top sits under the eye of a man on the fire step, 1.65 m above it.
    expect(courses.every((bags) => bags.y + 0.38 < floor + 1.05 + 1.65)).toBe(true)
  })

  it("leaves bags, planks, iron and stores lying on the lips, behind the bays and either side of the saps", () => {
    const lip = placements.filter(
      (placement) =>
        ["Gen_Prop_Plank_01", "Gen_Prop_Plank_02", "Prop_Iron_Sheet_03", "Prop_Shell_01"].includes(placement.piece) ||
        placement.piece.startsWith("Env_Sandbag_0")
    )
    const onFrontBay = lip.filter((placement) => placement.x > 12 && placement.x < 68 && Math.abs(placement.z - 60) < 3)

    expect(lip.length).toBeGreaterThan(10)
    // On the front line's bay only on its parados, south of the trench, away from the enemy.
    expect(onFrontBay.length).toBeGreaterThan(0)
    expect(onFrontBay.every((placement) => placement.z < 60 - 1.5)).toBe(true)
    // Either side of the communication trench.
    const sap = lip.filter((placement) => Math.abs(placement.x - 40) < 3 && placement.z > 33 && placement.z < 55)
    expect(new Set(sap.map((placement) => Math.sign(placement.x - 40))).size).toBe(2)
  })

  it("hangs a gas curtain in every dugout's doorway, with a brazier burning beside some", () => {
    const dugouts = of(TRENCH_PIECES.dugout)
    const curtains = of(TRENCH_PIECES.gasCurtain)
    const braziers = of(TRENCH_PIECES.brazier)

    expect(curtains).toHaveLength(dugouts.length)
    for (const [index, curtain] of curtains.entries()) {
      const dugout = dugouts[index]
      // In the doorway's wall, a metre to the dugout section's -x side and a metre along it.
      const [sideX, sideZ] = turned(curtain, -1, 0)
      const offsetX = curtain.x - (dugout?.x ?? 0)
      const offsetZ = curtain.z - (dugout?.z ?? 0)
      expect(offsetX * sideX + offsetZ * sideZ).toBeCloseTo(0.98)
      expect(curtain.yaw).toBe(dugout?.yaw)
    }
    expect(braziers.length).toBeLessThanOrEqual(dugouts.length)
    expect(braziers.every((brazier) => brazier.z > 18 && brazier.z < 22)).toBe(true)
  })

  it("stands a stovepipe on the ground over some dugouts' rooms, behind their doorways", () => {
    const dugouts = of(TRENCH_PIECES.dugout)
    const pipes = of(TRENCH_PIECES.stovepipe)

    expect(dugouts.length).toBeGreaterThan(0)
    expect(pipes.length).toBeLessThanOrEqual(dugouts.length)
    for (const pipe of pipes) {
      // 3.4 m out from the reserve line's centre line at z = 20, on the ground: 1.8 m over its floor at 10 - 1.9.
      expect(Math.abs(pipe.z - 20)).toBeCloseTo(3.4)
      expect(pipe.y).toBeCloseTo(10 - 1.9 + 1.8)
    }
  })

  it("leaves rainwater standing on the floor under the duckboards here and there", () => {
    const water = of(TRENCH_PIECES.water)
    const boards = of(TRENCH_PIECES.duckboard)

    expect(water.length).toBeGreaterThan(0)
    expect(water.length).toBeLessThan(boards.length)
    // Just under the boards.
    expect(water.every((plane) => boards.some((board) => Math.abs(board.y - plane.y - 0.03) < 0.05))).toBe(true)
  })

  it("puts up a signboard where the communication trench joins the front line", () => {
    const signs = of(TRENCH_PIECES.sign)

    expect(signs).toHaveLength(1)
    expect(Math.abs((signs[0]?.x ?? 0) - 40)).toBeCloseTo(2.4)
    expect(signs[0]?.z).toBeLessThan(60)
  })
})
