import { describe, expect, it } from "vitest"
import { generateFleurySector } from "./fleury.ts"
import { mapDepth, mapWidth, Surface } from "./format.ts"
import { heightAt } from "./sampling.ts"
import { SCENERY_KINDS } from "./scenery.ts"
import { checkTrenchKit, fromTiledMap, toTiledMap } from "./tiled.ts"
import { TRENCH_GRID } from "./trench-trace.ts"
import { type GroundPoint, type Trench, TRENCH_PROFILE } from "./trenches.ts"

// A 1 m grid keeps the tests quick; the game runs the same layout on 0.5 m.
const map = generateFleurySector({ cellSize: 1 })

const meanZ = (trench: Trench) => trench.points.reduce((sum, [, z]) => sum + z, 0) / trench.points.length

function frontLine(facing: "north" | "south"): Trench {
  const fire = map.trenches.filter((trench) => trench.kind === "fire" && trench.facing === facing)
  const [front] = fire.sort((a, b) => (facing === "north" ? meanZ(b) - meanZ(a) : meanZ(a) - meanZ(b)))
  if (!front) {
    throw new Error(`no ${facing}-facing fire trench`)
  }
  return front
}

function distanceToTrenches(x: number, z: number, kind?: Trench["kind"]): number {
  let nearest = Infinity
  for (const trench of map.trenches.filter((candidate) => !kind || candidate.kind === kind)) {
    for (let index = 1; index < trench.points.length; index++) {
      const [ax, az] = trench.points[index - 1]
      const [bx, bz] = trench.points[index]
      const lengthSquared = (bx - ax) ** 2 + (bz - az) ** 2
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / lengthSquared))
      nearest = Math.min(nearest, Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)))
    }
  }
  return nearest
}

function segmentLengths(points: readonly GroundPoint[]): number[] {
  return points.slice(1).map(([bx, bz], index) => Math.hypot(bx - points[index][0], bz - points[index][1]))
}

describe("generateFleurySector", () => {
  it("is fought in Fleury's history's weather", () => {
    expect(map.weatherRegion).toBe("fleury")
  })

  it("covers 600 m by 400 m", () => {
    expect(mapWidth(map)).toBe(600)
    expect(mapDepth(map)).toBe(400)
    expect(map.name).toBe("Fleury sector")
  })

  it("is the same every time for a seed", () => {
    const again = generateFleurySector({ cellSize: 1 })

    expect(again.heights).toEqual(map.heights)
    expect(again.trenches).toEqual(map.trenches)
    expect(again.scenery).toEqual(map.scenery)
  })

  it("puts the French front line to the south facing north, and the German one to the north facing south", () => {
    const french = frontLine("north")
    const german = frontLine("south")

    expect(meanZ(french)).toBeGreaterThan(100)
    expect(meanZ(german)).toBeLessThan(300)
    // No man's land between them, everywhere along the front.
    expect(meanZ(german) - meanZ(french)).toBeGreaterThan(100)
    expect(Math.min(...german.points.map(([, z]) => z)) - Math.max(...french.points.map(([, z]) => z))).toBeGreaterThan(
      40
    )
    // Each front line runs nearly the width of the map.
    for (const line of [french, german]) {
      expect(line.points[0]?.[0]).toBeLessThan(10)
      expect(line.points.at(-1)?.[0]).toBeGreaterThan(590)
    }
  })

  it("gives each side three lines, communication trenches and saps", () => {
    const fire = map.trenches.filter((trench) => trench.kind === "fire")
    const communication = map.trenches.filter((trench) => trench.kind === "communication")

    expect(fire.filter((trench) => trench.facing === "north")).toHaveLength(3)
    expect(fire.filter((trench) => trench.facing === "south")).toHaveLength(3)
    expect(communication.length).toBeGreaterThanOrEqual(2 * (4 + 4 + 4))
  })

  it("traces every trench for the kit: right-angle turns with room for the corner pieces", () => {
    for (const trench of map.trenches) {
      const lengths = segmentLengths(trench.points)
      // Saps are a single straight run; everything else turns only at right angles.
      for (let index = 2; index < trench.points.length; index++) {
        const [ax, az] = trench.points[index - 2]
        const [bx, bz] = trench.points[index - 1]
        const [cx, cz] = trench.points[index]
        expect(Math.abs((bx - ax) * (cx - bx) + (bz - az) * (cz - bz))).toBeLessThan(1e-6)
      }
      const inner = lengths.slice(1, -1)
      expect(inner.every((length) => length >= 2 * TRENCH_GRID.clearance - 1e-6)).toBe(true)
    }
  })

  it("carves the trenches into the ground", () => {
    const [x, z] = frontLine("north").points[1] ?? [0, 0]
    const floor = heightAt(map, x - 3, z)
    const beyond = heightAt(map, x - 3, z - 8)

    expect(beyond - floor).toBeGreaterThan(TRENCH_PROFILE.floorDepth - 1.5)
  })

  it("shells no man's land into churned ground", () => {
    let churned = 0
    let samples = 0
    for (let x = 20; x < 580; x += 7) {
      for (let z = 190; z < 215; z += 5) {
        samples += 1
        if (map.surfaces[Math.round(z) * (map.columns + 1) + Math.round(x)] === Surface.Churned) {
          churned += 1
        }
      }
    }
    expect(churned / samples).toBeGreaterThan(0.6)
  })

  it("places every kind of scenery on the map, none of it standing in a trench", () => {
    const kinds = new Set(map.scenery.map((item) => item.kind))
    for (const kind of SCENERY_KINDS) {
      expect(kinds.has(kind)).toBe(true)
    }
    expect(map.scenery.every(({ x, z }) => x > 0 && x < 600 && z > 0 && z < 400)).toBe(true)
    // Bridges span trenches, machine guns sit on the parapet and pools fill craters; the rest keeps off the trenches.
    const standing = map.scenery.filter((item) => !["bridge", "machine-gun", "pool"].includes(item.kind))
    expect(standing.every((item) => distanceToTrenches(item.x, item.z) > TRENCH_PROFILE.parapetOuter)).toBe(true)
  })

  it("runs a field railway up from the rear behind the French lines to the communication trenches, its track clear", () => {
    expect(map.railways).toHaveLength(1)
    const [railway] = map.railways
    const points = railway?.points ?? []
    // In from the sector's south edge, behind the French lines.
    expect(points[0]?.[1]).toBe(0)
    expect(points.every(([, z]) => z < 35)).toBe(true)
    // Every metre of it: clear of the trenches and of everything placed but the dumps beside it, on a level bed.
    const along: GroundPoint[] = []
    for (let index = 1; index < points.length; index++) {
      const [ax, az] = points[index - 1] ?? [0, 0]
      const [bx, bz] = points[index] ?? [0, 0]
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az))
      for (let step = 0; step < steps; step++) {
        along.push([ax + ((bx - ax) * step) / steps, az + ((bz - az) * step) / steps])
      }
    }
    expect(along.every(([x, z]) => distanceToTrenches(x, z) > TRENCH_PROFILE.parapetOuter + 1)).toBe(true)
    const nearest = (x: number, z: number) => Math.min(...along.map(([px, pz]) => Math.hypot(px - x, pz - z)))
    expect(map.scenery.every((item) => nearest(item.x, item.z) > 1.8)).toBe(true)
    const heights = along.map(([x, z]) => heightAt(map, x, z))
    const steepest = Math.max(...heights.slice(1).map((height, index) => Math.abs(height - (heights[index] ?? 0))))
    expect(steepest).toBeLessThan(0.05)
    // The dumps at the heads of the communication trenches it serves, beside the line.
    const dumps = map.scenery.filter((item) => item.kind === "stores" && nearest(item.x, item.z) < 10)
    expect(dumps.length).toBeGreaterThanOrEqual(2)
  })

  it("lines Fleury's streets with houses facing them, the farm's great barn among them", () => {
    // The main street, from the German line to the French: (471, 270) to (533, 160).
    const along = (x: number, z: number) => {
      const [dx, dz] = [62, -110]
      const t = Math.max(0, Math.min(1, ((x - 471) * dx + (z - 270) * dz) / (dx * dx + dz * dz)))
      return Math.hypot(x - (471 + dx * t), z - (270 + dz * t))
    }
    const onMainStreet = map.scenery.filter((item) => item.kind === "ruin" && along(item.x, item.z) < 10)
    expect(onMainStreet.length).toBeGreaterThanOrEqual(3)
    // Gable to the street: its houses face across it, square to its run. (A few odd ruins stand off the streets.)
    const street = Math.atan2(62, -110)
    const facing = onMainStreet.filter((house) => Math.abs(Math.cos(house.heading - street)) < 0.05)
    expect(facing.length / onMainStreet.length).toBeGreaterThan(0.7)
    const landmarks = map.scenery.filter((item) => item.kind === "landmark")
    expect(landmarks).toHaveLength(1)
    expect(along(landmarks[0]?.x ?? 0, landmarks[0]?.z ?? 0)).toBeLessThan(14)
  })

  it("stakes wire in front of both front lines, each belt on its own side of no man's land", () => {
    const french = meanZ(frontLine("north"))
    const german = meanZ(frontLine("south"))
    const middle = (french + german) / 2
    const frenchBelts = map.wire.filter((belt) => (belt.points[0]?.[1] ?? 0) < middle)
    const germanBelts = map.wire.filter((belt) => (belt.points[0]?.[1] ?? 0) > middle)

    expect(frenchBelts.length).toBeGreaterThan(4)
    expect(germanBelts.length).toBeGreaterThan(6)
    // Clear of the fire trenches; saps run out to listening posts just behind the wire.
    for (const belt of map.wire) {
      expect(belt.points.every(([x, z]) => distanceToTrenches(x, z, "fire") > 10)).toBe(true)
      expect(belt.points.every(([x, z]) => distanceToTrenches(x, z, "communication") > 4)).toBe(true)
    }
  })

  it("keeps to the trench kit's rules everywhere", () => {
    expect(checkTrenchKit(map.trenches)).toEqual([])
  })

  it("names the ground worth fighting for, all of it in or beside no man's land", () => {
    const names = map.objectives.map((objective) => objective.name)

    expect(names).toContain("Fleury")
    expect(names).toContain("Ravine head")
    expect(map.objectives.every((objective) => objective.z > 150 && objective.z < 300)).toBe(true)
  })

  it("closes the wire's patrol gaps and the saps' mouths with knife rests", () => {
    const knifeRests = map.scenery.filter((item) => item.kind === "knife-rest")

    expect(knifeRests.length).toBeGreaterThan(8)
  })

  it("throws up chalk around craters on the ridge", () => {
    let chalk = 0
    for (let x = 20; x < 580; x += 2) {
      for (let z = 330; z < 395; z += 2) {
        if (map.surfaces[Math.round(z) * (map.columns + 1) + Math.round(x)] === Surface.Chalk) {
          chalk += 1
        }
      }
    }
    expect(chalk).toBeGreaterThan(100)
  })

  it("builds a sector around a hand-drawn layout, regenerating pools and bridges", () => {
    const drawn = fromTiledMap(toTiledMap(map))
    const sap: Trench = {
      kind: "communication",
      points: [
        [300, 100],
        [300, 112]
      ],
      facing: null
    }
    const layout = { ...drawn, trenches: [...drawn.trenches, sap] }
    const edited = generateFleurySector({ cellSize: 1, layout })

    expect(edited.trenches).toHaveLength(map.trenches.length + 1)
    expect(edited.wire).toEqual(drawn.wire)
    // The objectives drawn with it, and the generated ones for a layout without any.
    expect(edited.objectives).toEqual(drawn.objectives)
    const { objectives: _, ...withoutObjectives } = layout
    expect(generateFleurySector({ cellSize: 1, layout: withoutObjectives }).objectives).toEqual(map.objectives)
    // Railways likewise: those drawn, or the generated line for a layout without any.
    expect(edited.railways).toEqual(drawn.railways)
    const { railways: __, ...withoutRailways } = layout
    expect(generateFleurySector({ cellSize: 1, layout: withoutRailways }).railways).toEqual(map.railways)
    expect(edited.scenery.some((item) => item.kind === "pool")).toBe(true)
    expect(edited.scenery.filter((item) => item.kind === "ruin")).toHaveLength(
      map.scenery.filter((item) => item.kind === "ruin").length
    )
    // The new sap is carved into the ground.
    expect(heightAt(edited, 300, 106)).toBeLessThan(heightAt(map, 300, 106) - 1)
  })

  it("leaves the ravine as dead ground: most of it out of sight of every German machine gun", () => {
    const guns = map.scenery
      .filter((item) => (item.kind === "machine-gun" && item.variant === 1) || item.kind === "bunker")
      .map((item) => ({ x: item.x, z: item.z, y: heightAt(map, item.x, item.z) + 0.8 }))
    // A man standing in the ravine's bed, chest high, seen from a gun's eye over the height field.
    const seen = (x: number, z: number) =>
      guns.some((gun) => {
        const aim = heightAt(map, x, z) + 1.3
        const distance = Math.hypot(x - gun.x, z - gun.z)
        for (let along = 4; along < distance - 1; along += 1) {
          const t = along / distance
          if (heightAt(map, gun.x + (x - gun.x) * t, gun.z + (z - gun.z) * t) > gun.y + (aim - gun.y) * t) {
            return false
          }
        }
        return true
      })
    const bed: GroundPoint[] = [
      [250, 182],
      [230, 199],
      [212, 216],
      [196, 236]
    ]

    expect(bed.filter(([x, z]) => seen(x, z)).length).toBeLessThanOrEqual(1)
  })

  it("builds on surveyed ground when given it, keeping the ravine and sunken road cut into it", () => {
    // Ground rising 40 m from west to east, as the real Fleury sector does.
    const columns = 600
    const rows = 400
    const heights = new Float32Array((columns + 1) * (rows + 1))
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        heights[row * (columns + 1) + column] = (column / columns) * 40
      }
    }
    const surveyed = generateFleurySector({
      cellSize: 1,
      elevation: { columns, rows, cellSize: 1, base: 301, heights }
    })
    const ground = (x: number, z: number) => heightAt(surveyed, x, z)

    // Away from trenches and craters the ground follows the survey, east well above west.
    expect(ground(560, 40) - ground(40, 40)).toBeGreaterThan(25)
    // The ravine's bed lies well below the surveyed ground beside it.
    expect(ground(212, 216)).toBeLessThan((212 / 600) * 40 - 4)
    expect(surveyed.trenches).toEqual(map.trenches)
  })
})
