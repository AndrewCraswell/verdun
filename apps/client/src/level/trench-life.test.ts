import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { TRENCH_PIECES } from "./trench-dressing.ts"
import { createCrows, createGasCurtain, createTrenchLife } from "./trench-life.ts"

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

describe("createTrenchLife", () => {
  it("lights a fire in every brazier, with sparks rising from them", () => {
    const world = scene()
    const drum = CreateBox(TRENCH_PIECES.brazier, { size: 1 }, world)
    const instance = drum.createInstance(`${TRENCH_PIECES.brazier}#0`)
    instance.position.set(20, 2.5, 30)
    instance.computeWorldMatrix(true)
    const other = CreateBox("crate", { size: 1 }, world).createInstance("crate#1")
    const sprite = new Texture(null, world)

    const life = createTrenchLife(world, field, [instance, other], { fire: sprite, ember: sprite })
    life.update(0.1)

    expect(life.braziers).toHaveLength(1)
    expect(life.braziers[0]?.position.y).toBeCloseTo(3.28)
    expect(life.embers.emitRate).toBeGreaterThan(0)
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
