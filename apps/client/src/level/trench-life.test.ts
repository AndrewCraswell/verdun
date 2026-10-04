import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { TRENCH_PIECES } from "./trench-dressing.ts"
import {
  brazierTops,
  createCrows,
  createGasCurtain,
  createLaundryLine,
  createStovepipe,
  createTrenchLife,
  stovepipeTops
} from "./trench-life.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function scene(): Scene {
  const engine = new NullEngine()
  engines.push(engine)
  return new Scene(engine)
}

/** A field at height 2 with one belt of wire across it at z = 50. */
const field = {
  ...createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 2),
  wire: [
    {
      points: Array.from({ length: 12 }, (_, index): [number, number] => [10 + index * 7, 50])
    }
  ]
}

/** A random source that walks a fixed cycle, so flocks come out the same every run. */
function steady(): () => number {
  let step = 0
  return () => {
    step += 1
    return (step * 0.618) % 1
  }
}

describe("createGasCurtain", () => {
  it("makes a pleated blanket for the dressing to instance, disabled like the kit's pieces", () => {
    const curtain = createGasCurtain(scene())
    const { minimum, maximum } = curtain.getBoundingInfo().boundingBox

    expect(curtain.name).toBe(TRENCH_PIECES.gasCurtain)
    expect(curtain.isEnabled()).toBe(false)
    expect(maximum.y - minimum.y).toBeCloseTo(1.6)
    expect(maximum.z - minimum.z).toBeCloseTo(1.05)
  })
})

describe("createStovepipe", () => {
  it("makes a short iron pipe standing on its foot, disabled like the kit's pieces", () => {
    const pipe = createStovepipe(scene())
    const { minimum, maximum } = pipe.getBoundingInfo().boundingBox

    expect(pipe.name).toBe(TRENCH_PIECES.stovepipe)
    expect(pipe.isEnabled()).toBe(false)
    expect(minimum.y).toBeCloseTo(0)
    expect(maximum.y).toBeCloseTo(0.8)
  })
})

describe("createLaundryLine", () => {
  it("makes a line of washing between two stakes, coloured, along its x axis, disabled like the kit's pieces", () => {
    const line = createLaundryLine(scene())
    const { minimum, maximum } = line.getBoundingInfo().boundingBox

    expect(line.name).toBe(TRENCH_PIECES.laundry)
    expect(line.isEnabled()).toBe(false)
    expect(maximum.x - minimum.x).toBeCloseTo(2.4 + 0.08)
    expect(maximum.y).toBeCloseTo(1.15)
    expect(line.getVerticesData("color")?.length).toBe(line.getTotalVertices() * 4)
  })
})

describe("stovepipeTops", () => {
  it("finds the mouth of every stovepipe placed", () => {
    const tops = stovepipeTops([
      { piece: TRENCH_PIECES.stovepipe, x: 4, y: 2, z: 6, yaw: 0 },
      { piece: TRENCH_PIECES.brazier, x: 5, y: 2, z: 6, yaw: 0 }
    ])

    expect(tops.map((top) => top.asArray())).toEqual([[4, 2.8, 6]])
  })
})

describe("brazierTops", () => {
  it("finds the open top of every brazier placed, at its height and size", () => {
    const world = scene()
    const drum = CreateBox(TRENCH_PIECES.brazier, { size: 1 }, world)
    const pieces = new Map<string, Mesh>([[drum.name, drum]])
    const placements = [
      { piece: TRENCH_PIECES.brazier, x: 20, y: 2, z: 30, yaw: 0, scale: [1, 0.5, 1] as const },
      { piece: "crate", x: 5, y: 2, z: 5, yaw: 0 }
    ]

    const [top, ...others] = brazierTops(placements, pieces)

    expect(others).toHaveLength(0)
    expect(top?.x).toBe(20)
    expect(top?.y).toBeCloseTo(2.25)
    expect(brazierTops(placements, new Map())).toHaveLength(0)
  })
})

describe("createTrenchLife", () => {
  it("lights a fire in every brazier, with sparks rising from them", () => {
    const world = scene()
    const sprite = new Texture(null, world)

    const life = createTrenchLife(
      world,
      field,
      { braziers: [new Vector3(20, 3, 30)] },
      { fire: sprite, ember: sprite, puff: sprite }
    )
    life.update(0.1)

    expect(life.braziers).toHaveLength(1)
    expect(life.braziers[0]?.position.y).toBeCloseTo(3.28)
    expect(life.embers.emitRate).toBeGreaterThan(0)
    // No stoves, no smoke.
    expect(life.smoke.isStarted()).toBe(false)
    life.dispose()
  })

  it("sends smoke up from the stovepipes, drifting on the wind", () => {
    const world = scene()
    const sprite = new Texture(null, world)
    const wind = { x: 5, z: -2 }

    const life = createTrenchLife(
      world,
      field,
      { braziers: [], stoves: [new Vector3(20, 3, 30), new Vector3(40, 3, 30)], wind: () => wind },
      { fire: sprite, ember: sprite, puff: sprite }
    )
    life.update(0.1)

    expect(life.smoke.isStarted()).toBe(true)
    expect(life.smoke.emitRate).toBeCloseTo(2.4)
    expect(life.smoke.gravity.x).toBeCloseTo(1)
    expect(life.smoke.gravity.z).toBeCloseTo(-0.4)
    life.dispose()
  })
})

describe("createCrows", () => {
  it("perches flocks on the wire, puts them up when a shell lands near, and lands them on the wire again", () => {
    const crows = createCrows(scene(), field, steady())

    expect(crows.flocks.length).toBeGreaterThan(1)
    expect(crows.flocks.every((flock) => flock.state === "perched" && flock.perch.z === 50)).toBe(true)
    const [first] = crows.flocks
    crows.scare(first?.perch.x ?? 0, 50)
    expect(first?.state).toBe("circling")
    // A shell far off leaves them be.
    crows.scare(-1000, -1000)

    const states = new Set<string>()
    for (let frame = 0; frame < 30 * 40; frame++) {
      crows.update(1 / 30)
      states.add(first?.state ?? "")
    }
    expect(states).toEqual(new Set(["circling", "landing", "perched"]))
    expect(first?.perch.z).toBe(50)
    crows.dispose()
  })

  it("keeps flocks somewhere on a map without wire", () => {
    const bare = createFlatMap({ name: "bare", cellSize: 1, columns: 40, rows: 40 }, 3)
    const crows = createCrows(scene(), bare)

    expect(crows.flocks.every((flock) => flock.perch.x === 20 && flock.perch.z === 20)).toBe(true)
  })
})
