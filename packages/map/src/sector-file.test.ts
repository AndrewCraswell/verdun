import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { fromTiledSector, lineZ, toTiledProject, toTiledSector } from "./sector-file.ts"

const FILE = new URL("../sectors/fleury.json", import.meta.url)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fleury(): unknown {
  return JSON.parse(readFileSync(FILE, "utf8"))
}

/** The Fleury file with one object of a layer changed. */
function edited(layerName: string, change: (object: Record<string, unknown>) => void): unknown {
  const json = fleury()
  if (typeof json !== "object" || json === null || !("layers" in json) || !Array.isArray(json.layers)) {
    throw new Error("not a map")
  }
  for (const layer of json.layers) {
    if (layer.name === layerName) {
      change(layer.objects[0])
    }
  }
  return json
}

describe("sector files", () => {
  it("read Fleury's features as the generator had them", () => {
    const features = fromTiledSector(fleury())
    expect(features).toMatchObject({ name: "Fleury sector", width: 600, depth: 400, weatherRegion: "fleury" })
    expect(features.villages).toEqual([{ name: "Fleury", x: 505, z: 205, radius: 72, height: 7.5 }])
    expect(features.ravines[0]?.points.at(-1)).toEqual([250, 182])
    expect(features.streets[0]).toEqual([
      [471, 270],
      [502, 215],
      [533, 160]
    ])
    expect(features.churches[0]?.heading).toBe(Math.PI / 2)
    expect(features.woods.map((wood) => wood.name)).toEqual(["Bois de la Caillette", "Bois des Corbeaux", "Bois Fumin"])
    expect(features.rise.at(2)).toEqual([125, 6.5])
  })

  it("write what they read, so a sector made in code and saved reads back the same", () => {
    const features = fromTiledSector(fleury())
    expect(fromTiledSector(structuredClone(toTiledSector(features)))).toEqual(features)
  })

  it("name the object they can't read", () => {
    expect(() => fromTiledSector({ type: "tileset" })).toThrow("orthogonal Tiled map")
    const shallow = edited("ground", (ravine) => (ravine.properties = [{ name: "halfWidth", value: -1 }]))
    expect(() => fromTiledSector(shallow)).toThrow(/object 1 in layer "ground" needs a positive halfWidth/)
    expect(() => fromTiledSector(edited("landmarks", (church) => (church.type = "castle")))).toThrow(
      /expected church or orchard/
    )
    expect(() => fromTiledSector(edited("woods", (wood) => delete wood.ellipse))).toThrow(/must be an ellipse/)
    const shortened = edited("roads", (road) => {
      if (Array.isArray(road.polyline)) {
        road.polyline.length = 1
      }
    })
    expect(() => fromTiledSector(shortened)).toThrow(/at least two points/)
  })

  it("say what's missing or wrong, kind by kind", () => {
    const map = (change: (json: Record<string, unknown>) => void) => {
      const json = fleury()
      if (!isObject(json)) {
        throw new Error("not a map")
      }
      change(json)
      return json
    }
    expect(() => fromTiledSector(map((json) => (json.width = 0)))).toThrow("positive width")
    expect(() => fromTiledSector(map((json) => (json.layers = {})))).toThrow("list of layers")
    expect(() => fromTiledSector(map((json) => (json.tilewidth = 16)))).toThrow("tiles must be a metre")
    expect(() => fromTiledSector(map((json) => (json.properties = [])))).toThrow("name, weatherRegion and rise")
    const withRise = (rise: string) =>
      map((json) => {
        json.properties = [
          { name: "name", type: "string", value: "Test" },
          { name: "weatherRegion", type: "string", value: "fleury" },
          { name: "rise", type: "string", value: rise }
        ]
      })
    expect(() => fromTiledSector(withRise("0:4 seventy:5"))).toThrow('"z:height" pairs')
    for (const [layer, kind] of [
      ["ground", "lake"],
      ["roads", "canal"],
      ["railways", "tram"]
    ] as const) {
      expect(() => fromTiledSector(edited(layer, (object) => (object.type = kind)))).toThrow(`class "${kind}"`)
    }
    expect(() =>
      fromTiledSector(edited("landmarks", (church) => (church.properties = [{ name: "heading", value: "east" }])))
    ).toThrow("heading in degrees")
    const noCrossroads = map((json) => {
      for (const layer of Array.isArray(json.layers) ? json.layers : []) {
        if (layer.name === "roads") {
          layer.objects = layer.objects.filter((object: { type?: string }) => object.type !== "crossroads")
          layer.properties = []
        }
      }
    })
    expect(() => fromTiledSector(noCrossroads)).toThrow("frenchRear and germanRear")
    const crossroadsGone = map((json) => {
      for (const layer of Array.isArray(json.layers) ? json.layers : []) {
        if (layer.name === "roads") {
          layer.objects = layer.objects.filter((object: { type?: string }) => object.type !== "crossroads")
        }
      }
    })
    expect(() => fromTiledSector(crossroadsGone)).toThrow("needs a crossroads point")
    const orchardRows = edited("landmarks", (church) => {
      church.type = "orchard"
      church.properties = [{ name: "rows", value: 2.5 }]
    })
    expect(() => fromTiledSector(orchardRows)).toThrow("whole number rows")
    expect(() => fromTiledSector(edited("landmarks", (church) => delete church.point))).toThrow(
      "must be a point object"
    )
  })
})

describe("sector files' trenches", () => {
  it("read each side's lines as drawn, west to east, with its trenches, saps and wire", () => {
    const [french, german] = fromTiledSector(fleury()).sides
    expect(french?.side).toBe("french")
    expect(german?.side).toBe("german")
    expect(french?.wire).toEqual([25])
    expect(german?.wire).toEqual([25])
    expect(french?.forward).toEqual([64, 186, 302, 412, 512])
    expect(german?.saps).toEqual([40, 280, 396, 486])
    expect(french?.front[0]?.[0]).toBe(8)
    expect(french?.front.at(-1)?.[0]).toBe(592)
  })

  it("say which line or marker they can't use", () => {
    const line = (name: string) => (object: Record<string, unknown>) => object.name === name
    const editing = (
      pick: (object: Record<string, unknown>) => boolean,
      change: (object: Record<string, unknown>) => void
    ) => {
      const json = fleury()
      if (!isObject(json) || !Array.isArray(json.layers)) {
        throw new Error("not a map")
      }
      for (const layer of json.layers) {
        if (isObject(layer) && layer.name === "trenches" && Array.isArray(layer.objects)) {
          layer.objects.filter((object) => isObject(object) && pick(object)).forEach(change)
        }
      }
      return json
    }
    const reversed = editing(line("french front"), (object) => {
      if (Array.isArray(object.polyline)) {
        object.polyline.reverse()
      }
    })
    expect(() => fromTiledSector(reversed)).toThrow("west to east")
    expect(() =>
      fromTiledSector(editing(line("german reserve"), (object) => (object.name = "german support")))
    ).not.toThrow()
    const twice = editing(line("german reserve"), (object) => {
      if (Array.isArray(object.properties)) {
        object.properties = object.properties.map((property) =>
          isObject(property) && property.name === "line" ? { ...property, value: "support" } : property
        )
      }
    })
    expect(() => fromTiledSector(twice)).toThrow("second support line")
    const missing = fleury()
    if (isObject(missing) && Array.isArray(missing.layers)) {
      for (const layer of missing.layers) {
        if (isObject(layer) && layer.name === "trenches" && Array.isArray(layer.objects)) {
          layer.objects = layer.objects.filter((object) => !(isObject(object) && object.name === "french reserve"))
        }
      }
    }
    expect(() => fromTiledSector(missing)).toThrow("needs a french reserve line")
    const wire = editing(line("french front"), (object) => {
      if (Array.isArray(object.properties)) {
        object.properties = object.properties.map((property) =>
          isObject(property) && property.name === "wire" ? { ...property, value: "25 lots" } : property
        )
      }
    })
    expect(() => fromTiledSector(wire)).toThrow("wire as distances")
    const marker = (object: Record<string, unknown>) => object.type === "communication"
    const from = editing(marker, (object) => (object.properties = [{ name: "from", value: "front" }]))
    expect(() => fromTiledSector(from)).toThrow("from of support or reserve")
    expect(() => fromTiledSector(editing(marker, (object) => (object.type = "tunnel")))).toThrow('class "tunnel"')
    const british = editing(marker, (object) => (object.properties = [{ name: "side", value: "british" }]))
    expect(() => fromTiledSector(british)).toThrow("side of french or german")
  })
})

describe("lineZ", () => {
  it("follows a drawn line between its points, and holds it level past its ends", () => {
    const course: [number, number][] = [
      [10, 100],
      [20, 110],
      [40, 90]
    ]
    expect(lineZ(course, 15)).toBe(105)
    expect(lineZ(course, 30)).toBe(100)
    expect(lineZ(course, 0)).toBe(100)
    expect(lineZ(course, 50)).toBe(90)
    expect(lineZ([], 5)).toBe(0)
  })
})

describe("sector files' positions and objectives", () => {
  it("read the batteries, the things placed by hand and the objectives", () => {
    const features = fromTiledSector(fleury())
    expect(features.batteries.map((battery) => battery.guns.length)).toEqual([4, 3])
    expect(features.batteries[1]?.heading).toBeCloseTo(Math.PI)
    expect(features.placed.map((item) => item.kind)).toEqual([
      "wrecked-gun",
      "wrecked-gun",
      "wrecked-plane",
      "bunker",
      "bunker",
      "bunker"
    ])
    expect(features.objectives.map((objective) => objective.name)).toContain("Fleury crossroads")
  })

  it("say what they can't place", () => {
    expect(() => fromTiledSector(edited("positions", (battery) => (battery.type = "regiment")))).toThrow(
      "expected battery or a kind of scenery"
    )
    const heading = edited("positions", (battery) => (battery.properties = [{ name: "heading", value: "north" }]))
    expect(() => fromTiledSector(heading)).toThrow("heading in degrees")
    expect(() => fromTiledSector(edited("objectives", (objective) => (objective.name = "")))).toThrow("needs a name")
  })
})

describe("the Tiled project", () => {
  it("is the one committed beside the sector files, so each class's form matches what the reader expects", () => {
    const committed: unknown = JSON.parse(
      readFileSync(new URL("../sectors/verdun.tiled-project", import.meta.url), "utf8")
    )
    expect(committed).toEqual(toTiledProject())
  })

  it("lets an object leave a property at its class's default, as Tiled does", () => {
    const features = fromTiledSector(edited("ground", (ravine) => (ravine.properties = [])))
    expect(features.ravines[0]?.halfWidth).toBe(16)
    expect(features.ravines[0]?.depth).toBe(9)
  })
})

describe("sector files, as Tiled may save them", () => {
  it("read a sector with no survey or preview, objects classed the newer way, and objects without names", () => {
    const { backdrop: _backdrop, preview: _preview, ...bare } = fromTiledSector(fleury())
    const written = structuredClone(toTiledSector(bare))
    expect(written.layers.some((layer) => layer.type === "imagelayer")).toBe(false)
    expect(fromTiledSector(written)).toEqual(bare)
    const renamed = edited("ground", (ravine) => {
      ravine.class = ravine.type
      delete ravine.type
      delete ravine.name
    })
    expect(fromTiledSector(renamed).ravines[0]?.name).toBe("")
  })

  it("refuse a class that isn't a name, and wire that isn't distances", () => {
    expect(() => fromTiledSector(edited("ground", (ravine) => (ravine.type = 5)))).toThrow("class 5")
    const json = fleury()
    if (isObject(json) && Array.isArray(json.layers)) {
      for (const layer of json.layers) {
        if (isObject(layer) && layer.name === "trenches" && Array.isArray(layer.objects)) {
          const front = layer.objects.find((object) => isObject(object) && object.name === "french front")
          if (isObject(front)) {
            front.properties = [
              { name: "side", value: "french" },
              { name: "line", value: "front" },
              { name: "wire", value: 22 }
            ]
          }
        }
      }
    }
    expect(() => fromTiledSector(json)).toThrow("wire as distances")
  })
})
