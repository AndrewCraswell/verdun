import { describe, expect, it } from "vitest"
import { createFlatMap, MAP_FORMAT_VERSION, Surface } from "./format.ts"
import { generateRollingTerrain } from "./generate.ts"
import { fromMapDocument, toMapDocument } from "./serialization.ts"

describe("map documents", () => {
  it("round-trip through JSON", () => {
    const map = generateRollingTerrain({
      name: "sector",
      widthMeters: 20,
      depthMeters: 10,
      cellSize: 1,
      seed: 7,
      amplitude: 5
    })

    const file = JSON.stringify(toMapDocument(map))
    const restored = fromMapDocument(JSON.parse(file))

    expect(restored).toEqual(map)
  })

  it("migrate version 1 files, which had no surfaces, to all mud", () => {
    const legacy = { version: 1, name: "old", cellSize: 1, columns: 1, rows: 1, heights: [0, 1, 2, 3] }

    const map = fromMapDocument(legacy)

    expect(map.version).toBe(MAP_FORMAT_VERSION)
    expect(Array.from(map.heights)).toEqual([0, 1, 2, 3])
    expect(Array.from(map.surfaces)).toEqual([Surface.Mud, Surface.Mud, Surface.Mud, Surface.Mud])
  })

  it("round-trip trench lines, and load older files without any", () => {
    const map = {
      ...createFlatMap({ name: "m", cellSize: 1, columns: 2, rows: 2 }),
      trenches: [
        {
          kind: "fire" as const,
          points: [
            [0, 1],
            [2, 1]
          ] as const,
          facing: "north" as const
        }
      ]
    }
    const legacy = { ...toMapDocument(map), version: 2, trenches: undefined }
    const file = JSON.stringify(toMapDocument(map))

    expect(fromMapDocument(JSON.parse(file)).trenches).toEqual(map.trenches)
    expect(fromMapDocument(legacy).trenches).toEqual([])
  })

  it("rejects malformed trench lines", () => {
    const valid = toMapDocument(createFlatMap({ name: "m", cellSize: 1, columns: 1, rows: 1 }))

    expect(() => fromMapDocument({ ...valid, trenches: undefined })).toThrow("trench")
    expect(() =>
      fromMapDocument({
        ...valid,
        trenches: [
          {
            kind: "fire",
            points: [
              [0, 0],
              [1, 1]
            ],
            facing: null
          }
        ]
      })
    ).toThrow("trench")
    expect(() =>
      fromMapDocument({
        ...valid,
        trenches: [
          {
            kind: "sap",
            points: [
              [0, 0],
              [1, 1]
            ],
            facing: null
          }
        ]
      })
    ).toThrow("trench")
    expect(() =>
      fromMapDocument({ ...valid, trenches: [{ kind: "communication", points: [[0, 0]], facing: null }] })
    ).toThrow("trench")
    expect(() => fromMapDocument({ ...valid, trenches: ["line"] })).toThrow("trench")
  })

  it("round-trip scenery and wire, and load older files without any", () => {
    const map = {
      ...createFlatMap({ name: "m", cellSize: 1, columns: 2, rows: 2 }),
      scenery: [{ kind: "ruin" as const, x: 1, z: 1.5, heading: 0.5, variant: 2, scale: 1 }],
      objectives: [{ name: "Fleury", x: 1, z: 1, radius: 30 }],
      wire: [
        {
          points: [
            [0, 1],
            [2, 1.5]
          ] as const
        }
      ]
    }
    const restored = fromMapDocument(structuredClone(toMapDocument(map)))
    const legacy = fromMapDocument({
      ...toMapDocument(map),
      version: 3,
      scenery: undefined,
      wire: undefined,
      objectives: undefined
    })

    expect(restored.scenery).toEqual(map.scenery)
    expect(restored.wire).toEqual(map.wire)
    expect(restored.objectives).toEqual(map.objectives)
    expect(legacy.scenery).toEqual([])
    expect(legacy.wire).toEqual([])
    expect(legacy.objectives).toEqual([])
    expect(legacy.version).toBe(MAP_FORMAT_VERSION)
  })

  it("rejects malformed scenery and wire", () => {
    const valid = toMapDocument(createFlatMap({ name: "m", cellSize: 1, columns: 1, rows: 1 }))
    const item = { kind: "tree", x: 0, z: 0, heading: 0, variant: 0, scale: 1 }

    expect(() => fromMapDocument({ ...valid, scenery: undefined })).toThrow("scenery")
    expect(() => fromMapDocument({ ...valid, scenery: [{ ...item, kind: "castle" }] })).toThrow("scenery")
    expect(() => fromMapDocument({ ...valid, scenery: [{ ...item, scale: 0 }] })).toThrow("scenery")
    expect(() => fromMapDocument({ ...valid, scenery: [{ ...item, variant: 1.5 }] })).toThrow("scenery")
    expect(() => fromMapDocument({ ...valid, scenery: [{ ...item, x: Number.NaN }] })).toThrow("scenery")
    expect(() => fromMapDocument({ ...valid, scenery: ["tree"] })).toThrow("scenery")
    expect(() => fromMapDocument({ ...valid, wire: undefined })).toThrow("wire")
    expect(() => fromMapDocument({ ...valid, wire: [{ points: [[0, 0]] }] })).toThrow("wire")
    expect(() => fromMapDocument({ ...valid, wire: [{ points: [[0, 0], [1]] }] })).toThrow("wire")
    expect(() => fromMapDocument({ ...valid, wire: [null] })).toThrow("wire")
    expect(() => fromMapDocument({ ...valid, objectives: undefined })).toThrow("objectives")
    expect(() => fromMapDocument({ ...valid, objectives: [{ name: "Fleury", x: 0, z: 0, radius: 0 }] })).toThrow(
      "objectives"
    )
    expect(() => fromMapDocument({ ...valid, objectives: [{ name: 3, x: 0, z: 0, radius: 5 }] })).toThrow("objectives")
  })

  it("round-trip the weather region, and load older files without one", () => {
    const map = { ...createFlatMap({ name: "somme", cellSize: 1, columns: 1, rows: 1 }), weatherRegion: "somme" }
    expect(fromMapDocument(structuredClone(toMapDocument(map)))).toEqual(map)
    const older = { ...toMapDocument(createFlatMap({ name: "old", cellSize: 1, columns: 1, rows: 1 })), version: 4 }
    expect(fromMapDocument(older).weatherRegion).toBeUndefined()
    expect(() => fromMapDocument({ ...older, version: 5, weatherRegion: 3 })).toThrow(/weather region/)
  })

  it("round-trip railways, load older files without any, and reject malformed ones", () => {
    const line = {
      points: [
        [0, 1],
        [2.5, 1.5]
      ] as const
    }
    const map = { ...createFlatMap({ name: "railhead", cellSize: 1, columns: 3, rows: 3 }), railways: [line] }
    expect(fromMapDocument(structuredClone(toMapDocument(map)))).toEqual(map)
    const older = { ...toMapDocument(map), version: 5, railways: undefined }
    expect(fromMapDocument(older).railways).toEqual([])
    const current = toMapDocument(map)
    expect(() => fromMapDocument({ ...current, railways: undefined })).toThrow("railways")
    expect(() => fromMapDocument({ ...current, railways: [{ points: [[0, 0]] }] })).toThrow("railways")
    expect(() =>
      fromMapDocument({
        ...current,
        railways: [
          {
            points: [
              [0, 0],
              [1, "a"]
            ]
          }
        ]
      })
    ).toThrow("railways")
  })

  it("round-trip roads and debus points, load older files without any, and reject malformed ones", () => {
    const road = {
      points: [
        [0, 0],
        [2, 2]
      ] as const,
      behind: "french" as const
    }
    const debus = { side: "french" as const, x: 1, z: 1, heading: 0.5, seenBy: 0 }
    const map = {
      ...createFlatMap({ name: "lorries", cellSize: 1, columns: 3, rows: 3 }),
      roads: [road],
      debus: [debus]
    }
    const current = toMapDocument(map)
    expect(fromMapDocument(structuredClone(current))).toEqual(map)
    const older = { ...current, version: 6, roads: undefined, debus: undefined }
    expect(fromMapDocument(older).roads).toEqual([])
    expect(fromMapDocument(older).debus).toEqual([])
    // Version 6 named the wooden fences "knife-rest": renamed in place, the scenery's order kept.
    const fence = { kind: "knife-rest", x: 1, z: 2, heading: 0, variant: 0, scale: 1 }
    const tree = { kind: "tree", x: 3, z: 2, heading: 0, variant: 0, scale: 1 }
    expect(fromMapDocument({ ...older, scenery: [fence, tree] }).scenery.map((item) => item.kind)).toEqual([
      "wooden-fence",
      "tree"
    ])
    expect(() => fromMapDocument({ ...current, scenery: [fence] })).toThrow("scenery")
    expect(() => fromMapDocument({ ...current, roads: [{ ...road, behind: "british" }] })).toThrow("roads")
    expect(() => fromMapDocument({ ...current, roads: [{ points: road.points }] })).toThrow("roads")
    expect(() => fromMapDocument({ ...current, debus: [{ ...debus, seenBy: -1 }] })).toThrow("debus")
    expect(() => fromMapDocument({ ...current, debus: [{ ...debus, side: null }] })).toThrow("debus")
    expect(() => fromMapDocument({ ...current, debus: undefined })).toThrow("debus")
    expect(() => fromMapDocument({ ...current, debus: ["here"] })).toThrow("debus")
  })

  it("rejects documents that are not objects", () => {
    expect(() => fromMapDocument(null)).toThrow("must be an object")
    expect(() => fromMapDocument("map")).toThrow("must be an object")
  })

  it("rejects unknown format versions", () => {
    const document = { ...toMapDocument(createFlatMap({ name: "m", cellSize: 1, columns: 1, rows: 1 })), version: 99 }

    expect(() => fromMapDocument(document)).toThrow("Unsupported map format version 99")
  })

  it("rejects malformed fields", () => {
    const valid = toMapDocument(createFlatMap({ name: "m", cellSize: 1, columns: 1, rows: 1 }))

    expect(() => fromMapDocument({ ...valid, name: 3 })).toThrow("name")
    expect(() => fromMapDocument({ ...valid, cellSize: -1 })).toThrow("cell size")
    expect(() => fromMapDocument({ ...valid, columns: 1.5 })).toThrow("columns and rows")
    expect(() => fromMapDocument({ ...valid, heights: [0, 0, 0] })).toThrow("4 finite numbers")
    expect(() => fromMapDocument({ ...valid, heights: [0, 0, 0, Number.NaN] })).toThrow("4 finite numbers")
    expect(() => fromMapDocument({ ...valid, surfaces: undefined })).toThrow("surface types")
    expect(() => fromMapDocument({ ...valid, surfaces: [0, 1, 2] })).toThrow("surface types")
    expect(() => fromMapDocument({ ...valid, surfaces: [0, 1, 2, 9] })).toThrow("surface types")
  })
})
