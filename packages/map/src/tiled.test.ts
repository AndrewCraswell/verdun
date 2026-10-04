import { describe, expect, it } from "vitest"
import { createFlatMap } from "./format.ts"
import type { Scenery, WireBelt } from "./scenery.ts"
import { checkTrenchKit, fromTiledMap, TILED_PIXELS_PER_METRE, type TiledLayout, toTiledMap } from "./tiled.ts"
import { TRENCH_GRID } from "./trench-trace.ts"
import type { GroundPoint, Trench } from "./trenches.ts"

const fire = (points: GroundPoint[], facing: "north" | "south" = "north"): Trench => ({ kind: "fire", points, facing })
const communication = (points: GroundPoint[]): Trench => ({ kind: "communication", points, facing: null })

const layout = {
  trenches: [
    fire([
      [10, 20],
      [30, 20],
      [30, 11],
      [50.125, 11]
    ]),
    communication([
      [20, 20],
      [20, 5]
    ])
  ],
  wire: [
    {
      points: [
        [10, 30],
        [25.5, 31.25],
        [50, 30]
      ]
    }
  ],
  scenery: [
    { kind: "tree", x: 12.3456, z: 7.891, heading: 1.234, variant: 2, scale: 1.25 },
    { kind: "gun", x: 0, z: 40, heading: -0.5, variant: 0, scale: 0.8 }
  ],
  objectives: [{ name: "The crossroads", x: 25.25, z: 21.5, radius: 12 }],
  railways: [
    {
      points: [
        [0, 3],
        [30.5, 4.25],
        [58, 3]
      ]
    }
  ]
} satisfies TiledLayout

const map = { ...createFlatMap({ name: "test sector", cellSize: 0.5, columns: 120, rows: 80 }), ...layout }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

interface TiledJson extends Record<string, unknown> {
  layers: Record<string, unknown>[]
}

/** A parsed copy of the Tiled map, as a designer's edited file would arrive. */
function exported(): TiledJson {
  const file = JSON.stringify(toTiledMap(map))
  const parsed: unknown = JSON.parse(file)
  if (!isRecord(parsed) || !Array.isArray(parsed.layers) || !parsed.layers.every(isRecord)) {
    throw new Error("Tiled map didn't survive JSON")
  }
  return { ...parsed, layers: parsed.layers }
}

function layerNamed(tiled: TiledJson, name: string): { objects: unknown[] } {
  const layer = tiled.layers.find((candidate) => candidate.name === name)
  if (!layer || !Array.isArray(layer.objects)) {
    throw new Error(`No ${name} layer`)
  }
  return { objects: layer.objects }
}

function objectAt(objects: readonly unknown[], index: number): Record<string, unknown> {
  const object = objects[index]
  if (!isRecord(object)) {
    throw new Error(`No object ${index}`)
  }
  return object
}

function expectPointsClose(actual: readonly GroundPoint[], expected: readonly GroundPoint[]) {
  expect(actual).toHaveLength(expected.length)
  for (const [index, [x, z]] of expected.entries()) {
    expect(actual[index]![0]).toBeCloseTo(x, 3)
    expect(actual[index]![1]).toBeCloseTo(z, 3)
  }
}

function expectSceneryClose(actual: readonly Scenery[], expected: readonly Scenery[]) {
  expect(actual).toHaveLength(expected.length)
  for (const [index, item] of expected.entries()) {
    const read = actual[index]!
    expect(read.kind).toBe(item.kind)
    expect(read.variant).toBe(item.variant)
    expect(read.x).toBeCloseTo(item.x, 3)
    expect(read.z).toBeCloseTo(item.z, 3)
    expect(read.heading).toBeCloseTo(item.heading, 3)
    expect(read.scale).toBeCloseTo(item.scale, 3)
  }
}

function expectWireClose(actual: readonly WireBelt[], expected: readonly WireBelt[]) {
  expect(actual).toHaveLength(expected.length)
  for (const [index, belt] of expected.entries()) {
    expectPointsClose(actual[index]!.points, belt.points)
  }
}

describe("Tiled maps", () => {
  it("round-trip trenches, wire, railways and scenery through JSON", () => {
    const read = fromTiledMap(exported())

    expect(read.trenches.map(({ kind, facing }) => ({ kind, facing }))).toEqual(
      layout.trenches.map(({ kind, facing }) => ({ kind, facing }))
    )
    for (const [index, trench] of layout.trenches.entries()) {
      expectPointsClose(read.trenches[index]!.points, trench.points)
    }
    expectWireClose(read.wire, layout.wire)
    expectWireClose(read.railways ?? [], layout.railways)
    expectSceneryClose(read.scenery, layout.scenery)
    expect(read.objectives).toEqual(layout.objectives)
    expect(read.warnings).toEqual([])
  })

  it("keeps the generated objectives for a map saved before it had a layer for them", () => {
    const tiled = exported()
    tiled.layers = tiled.layers.filter((layer) => layer.name !== "objectives")

    expect(fromTiledMap(tiled).objectives).toBeUndefined()
  })

  it("keeps the generated railways for a map saved before it had a layer for them", () => {
    const tiled = exported()
    tiled.layers = tiled.layers.filter((layer) => layer.name !== "railways")

    expect(fromTiledMap(tiled).railways).toBeUndefined()
  })

  it("is an orthogonal map of one-metre tiles with a layer per kind of thing", () => {
    const tiled = toTiledMap(map)

    expect(tiled).toMatchObject({ orientation: "orthogonal", type: "map", width: 60, height: 40, tilesets: [] })
    expect(tiled.tilewidth).toBe(TILED_PIXELS_PER_METRE)
    expect(tiled.layers.map((layer) => [layer.name, layer.type, layer.objects.length])).toEqual([
      ["trenches", "objectgroup", 2],
      ["wire", "objectgroup", 1],
      ["railways", "objectgroup", 1],
      ["scenery", "objectgroup", 2],
      ["objectives", "objectgroup", 1]
    ])
    const ids = tiled.layers.flatMap((layer) => layer.objects.map((object) => object.id))
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(tiled.nextobjectid).toBe(8)
    expect(tiled.nextlayerid).toBe(6)
    expect(tiled.layers.find((layer) => layer.name === "objectives")?.objects[0]).toMatchObject({
      name: "The crossroads",
      point: true,
      x: 252.5,
      y: 185
    })
  })

  it("flips z so north is up, and stores headings in degrees", () => {
    const tiled = toTiledMap(map)
    const [trench] = tiled.layers.find((layer) => layer.name === "trenches")!.objects
    const [tree] = tiled.layers.find((layer) => layer.name === "scenery")!.objects

    // The map is 40 m deep: z 20 is 20 m below the top edge, at y 200 px.
    expect(trench).toMatchObject({ x: 100, y: 200 })
    expect(trench!.polyline).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 90 },
      { x: 401.25, y: 90 }
    ])
    expect(trench!.properties).toEqual([
      { name: "facing", type: "string", value: "north" },
      { name: "kind", type: "string", value: "fire" }
    ])
    expect(tree).toMatchObject({ point: true, type: "tree", x: 123.46, y: 321.09 })
    expect(tree!.properties).toEqual([
      { name: "heading", type: "float", value: 70.7 },
      { name: "scale", type: "float", value: 1.25 },
      { name: "variant", type: "int", value: 2 }
    ])
    expect(tiled.layers[0]!.objects[1]!.properties![0]).toEqual({ name: "facing", type: "string", value: "none" })
  })

  it("writes keys in the alphabetical order Tiled saves them in", () => {
    const tiled = toTiledMap(map)
    const sorted = (keys: string[]) => [...keys].sort()

    expect(Object.keys(tiled)).toEqual(sorted(Object.keys(tiled)))
    for (const layer of tiled.layers) {
      expect(Object.keys(layer)).toEqual(sorted(Object.keys(layer)))
      for (const object of layer.objects) {
        expect(Object.keys(object)).toEqual(sorted(Object.keys(object)))
      }
    }
  })

  it("rounds to the millimetre, so the file is the same every time", () => {
    const tiled = toTiledMap({
      ...map,
      trenches: [],
      wire: [
        {
          points: [
            [1 / 3, 2 / 3],
            [46.940000000000005, 0.1 + 0.2]
          ]
        }
      ],
      scenery: []
    })

    expect(tiled.layers[1]!.objects[0]).toMatchObject({ x: 3.33, y: 393.33, polyline: [{ x: 0 }, { x: 466.07 }] })
    expect(JSON.stringify(toTiledMap(map))).toBe(JSON.stringify(toTiledMap(map)))
  })

  it("round-trips the Fleury sector within a millimetre", async () => {
    const { generateFleurySector } = await import("./fleury.ts")
    const fleury = generateFleurySector()

    const file = JSON.stringify(toTiledMap(fleury))
    const read = fromTiledMap(JSON.parse(file))

    expect(read.trenches).toHaveLength(fleury.trenches.length)
    for (const [index, trench] of fleury.trenches.entries()) {
      expect(read.trenches[index]!.kind).toBe(trench.kind)
      expect(read.trenches[index]!.facing).toBe(trench.facing)
      expectPointsClose(read.trenches[index]!.points, trench.points)
    }
    expectWireClose(read.wire, fleury.wire)
    expectWireClose(read.railways ?? [], fleury.railways)
    expectSceneryClose(read.scenery, fleury.scenery)
    expect(read.warnings).toEqual([])
  })

  it("reads edits made in Tiled: moved, rotated and added objects with default properties", () => {
    const tiled = exported()
    const trenches = layerNamed(tiled, "trenches")
    const scenery = layerNamed(tiled, "scenery")
    // Tiled turns a rotated polyline about its first point, clockwise on screen.
    trenches.objects[1] = { ...objectAt(trenches.objects, 1), rotation: 90 }
    scenery.objects.push({ id: 99, class: "stump", point: true, x: 50, y: 50 })
    tiled.properties = [{ name: "pixelsPerMetre", type: "float", value: 5 }]

    const read = fromTiledMap(tiled)

    // At 5 px/m the 40 tile × 10 px map is 80 m deep.
    expectPointsClose(read.trenches[1]!.points, [
      [40, 40],
      [10, 40]
    ])
    expect(read.scenery[2]).toEqual({ kind: "stump", x: 10, z: 70, heading: 0, variant: 0, scale: 1 })
  })

  it("reads a map that lost its properties at the standard scale", () => {
    const { properties: _, ...tiled } = exported()

    expect(fromTiledMap(tiled).scenery[0]).toMatchObject({ x: 12.346, z: 7.891 })
  })

  it("accepts communication trenches with an empty or missing facing, and ignores other layers", () => {
    const tiled = exported()
    const trenches = layerNamed(tiled, "trenches")
    trenches.objects[1] = {
      ...objectAt(trenches.objects, 1),
      properties: [{ name: "kind", type: "string", value: "communication" }]
    }
    trenches.objects.push({
      ...objectAt(trenches.objects, 1),
      id: 50,
      properties: [
        { name: "kind", value: "communication" },
        { name: "facing", value: "" }
      ]
    })
    tiled.layers.push({ name: "notes", type: "imagelayer" }, { name: "sketch", type: "objectgroup", objects: [{}] })

    const read = fromTiledMap(tiled)

    expect(read.trenches.map((trench) => trench.facing)).toEqual(["north", null, null])
  })

  describe("reject", () => {
    const cases: [string, (tiled: TiledJson) => unknown, RegExp][] = [
      ["something that isn't a map", () => [], /JSON object of type map/],
      ["a map of another type", (tiled) => ({ ...tiled, type: "tileset" }), /type map/],
      ["an isometric map", (tiled) => ({ ...tiled, orientation: "isometric" }), /orthogonal, got "isometric"/],
      ["a map without a height", (tiled) => ({ ...tiled, height: 0 }), /positive height/],
      ["a map without layers", (tiled) => ({ ...tiled, layers: {} }), /list of layers/],
      [
        "a bad pixel scale",
        (tiled) => ({ ...tiled, properties: [{ name: "pixelsPerMetre", value: -1 }] }),
        /pixelsPerMetre must be a positive number/
      ],
      ["properties that aren't a list", (tiled) => ({ ...tiled, properties: {} }), /Tiled map has properties/],
      ["a nameless property", (tiled) => ({ ...tiled, properties: [{ value: 1 }] }), /property without a name/],
      [
        "a missing layer",
        (tiled) => ({ ...tiled, layers: tiled.layers.filter((layer) => layer.name !== "wire") }),
        /no "wire" layer/
      ],
      [
        "two layers of one name",
        (tiled) => ({ ...tiled, layers: [...tiled.layers, { ...tiled.layers[1] }] }),
        /2 layers named "wire"/
      ],
      [
        "a tile layer where an object layer belongs",
        (tiled) => ({ ...tiled, layers: [...tiled.layers.slice(0, 2), { name: "scenery", type: "tilelayer" }] }),
        /"scenery" must be an object layer/
      ]
    ]
    it.each(cases)("%s", (_, edit, message) => {
      expect(() => fromTiledMap(edit(exported()))).toThrow(message)
    })

    const objectCases: [string, string, (object: Record<string, unknown>) => unknown, RegExp][] = [
      ["a non-object", "wire", () => 7, /object #1 in layer "wire" must be an object/],
      ["a rectangle as a trench", "trenches", ({ polyline: _, ...rest }) => rest, /object 1 .* must be a polyline/],
      ["a one-point wire belt", "wire", (object) => ({ ...object, polyline: [{ x: 0, y: 0 }] }), /at least two/],
      ["a bad polyline point", "wire", (object) => ({ ...object, polyline: [{ x: 0 }, { x: 1, y: 1 }] }), /numeric/],
      ["a missing position", "wire", (object) => ({ ...object, x: "1" }), /object 3 .* numeric x and y/],
      ["a bad rotation", "wire", (object) => ({ ...object, rotation: "left" }), /rotation that isn't a number/],
      [
        "a trench of unknown kind",
        "trenches",
        (object) => ({ ...object, properties: [{ name: "kind", value: "sap" }] }),
        /kind property of "fire" or "communication", got "sap"/
      ],
      [
        "a fire trench without a facing",
        "trenches",
        (object) => ({ ...object, properties: [{ name: "kind", value: "fire" }] }),
        /fire trench and needs a facing/
      ],
      [
        "a communication trench with a facing",
        "trenches",
        (object) => ({
          ...object,
          id: 2,
          properties: [
            { name: "kind", value: "communication" },
            { name: "facing", value: "north" }
          ]
        }),
        /object 2 .* faces "none", got "north"/
      ],
      [
        "unknown scenery",
        "scenery",
        (object) => ({ ...object, type: "tank" }),
        /object 5 .* class "tank"; expected one of ruin/
      ],
      ["scenery that isn't a point", "scenery", ({ point: _, ...rest }) => rest, /must be a point object/],
      [
        "a heading that isn't a number",
        "scenery",
        (object) => ({ ...object, properties: [{ name: "heading", value: "north" }] }),
        /heading in degrees, got "north"/
      ],
      [
        "a fractional variant",
        "scenery",
        (object) => ({ ...object, properties: [{ name: "variant", value: 1.5 }] }),
        /variant that is a whole number/
      ],
      [
        "a negative scale",
        "scenery",
        (object) => ({ ...object, properties: [{ name: "scale", value: -2 }] }),
        /positive scale, got -2/
      ],
      ["a nameless objective", "objectives", (object) => ({ ...object, name: " " }), /objectives" needs a name/],
      ["an objective without a radius", "objectives", (object) => ({ ...object, properties: [] }), /positive radius/],
      ["an objective that isn't a point", "objectives", ({ point: _, ...rest }) => rest, /must be a point object/]
    ]
    it.each(objectCases)("%s, naming the object", (_, layer, edit, message) => {
      const tiled = exported()
      const { objects } = layerNamed(tiled, layer)
      objects[0] = edit(objectAt(objects, 0))
      expect(() => fromTiledMap(tiled)).toThrow(message)
    })
  })
})

describe("trench kit check", () => {
  const { clearance } = TRENCH_GRID

  it("passes square turns and junctions with room for the kit", () => {
    const trenches = [
      fire([
        [0, 0],
        [20, 0],
        [20, 10],
        [40, 10]
      ]),
      // A T junction in the middle of the first run, and a trench continuing straight through a collinear point.
      communication([
        [10, 0],
        [10, -10],
        [10, -20],
        [30, -20]
      ])
    ]

    expect(checkTrenchKit(trenches)).toEqual([])
  })

  it("passes a trench ending at another's corner, which the kit lines with a T junction", () => {
    const corner = fire([
      [0, 0],
      [20, 0],
      [20, 20]
    ])
    const south = communication([
      [20, 0],
      [20, -20]
    ])
    const east = communication([
      [20, 0],
      [40, 0]
    ])

    expect(checkTrenchKit([corner, south])).toEqual([])
    expect(checkTrenchKit([corner, east])).toEqual([])
  })

  it("warns about turns that aren't right angles", () => {
    const warnings = checkTrenchKit([
      fire([
        [0, 0],
        [20, 0],
        [40, 20]
      ])
    ])

    expect(warnings).toEqual([
      { trench: 0, at: [20, 0], message: "turns 45° at (20.0, 0.0); the kit only turns at right angles" }
    ])
  })

  it("warns about turns closer together than two clearances, or an end closer than one", () => {
    const short = 2 * clearance - 0.5
    const warnings = checkTrenchKit([
      fire([
        [0, 0],
        [clearance - 1, 0],
        [clearance - 1, short],
        [20, short]
      ])
    ])

    expect(warnings.map((warning) => warning.message)).toEqual([
      `only 3.10 m of straight trench between the end at (0.0, 0.0) and the turn at (3.1, 0.0); the kit needs 4.1 m`,
      `only 7.70 m of straight trench between the turn at (3.1, 0.0) and the turn at (3.1, 7.7); the kit needs 8.2 m`
    ])
  })

  it("warns about junctions too near a turn, or meeting a trench at an angle", () => {
    const warnings = checkTrenchKit([
      fire([
        [0, 0],
        [20, 0],
        [20, 20]
      ]),
      communication([
        [17, 0],
        [17, -20]
      ]),
      communication([
        [8, 0],
        [-2, -10]
      ])
    ])

    expect(warnings.map(({ trench, message }) => [trench, message])).toEqual([
      [2, "meets trench 0 at an angle at (8.0, 0.0); the kit's junctions are square"],
      [
        0,
        "only 3.00 m of straight trench between the junction at (17.0, 0.0) and the turn at (20.0, 0.0); the kit needs 8.2 m"
      ]
    ])
  })

  it("treats trenches joined end to end as a corner, and reports repeated points", () => {
    const warnings = checkTrenchKit([
      fire([
        [0, 0],
        [20, 0],
        [20, 0]
      ]),
      // Joins the end of the first at a right angle, and turns again too soon.
      communication([
        [20, 0],
        [20, -5],
        [30, -5]
      ])
    ])

    expect(warnings.map(({ trench, message }) => [trench, message])).toEqual([
      [0, "point 2 at (20.0, 0.0) repeats the point before it"],
      [
        1,
        "only 5.00 m of straight trench between the junction at (20.0, 0.0) and the turn at (20.0, -5.0); the kit needs 8.2 m"
      ]
    ])
  })

  it("names the Tiled object when reading a map", () => {
    const read = fromTiledMap(
      toTiledMap({
        ...map,
        trenches: [
          fire([
            [0, 0],
            [10, 0],
            [10, 2]
          ])
        ]
      })
    )

    expect(read.warnings).toEqual([
      'Tiled object 1 in layer "trenches": only 2.00 m of straight trench between the turn at (10.0, 0.0) and the end at (10.0, 2.0); the kit needs 4.1 m'
    ])
  })
})
