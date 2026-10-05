import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { fromTiledSector, lineZ, toTiledSector } from "./sector-file.ts"

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
    expect(() => fromTiledSector(edited("ground", (ravine) => (ravine.properties = [])))).toThrow(
      /object 1 in layer "ground" needs a positive halfWidth/
    )
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
    expect(french?.wire).toEqual([22, 33])
    expect(german?.wire).toEqual([18, 30, 42])
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
          isObject(property) && property.name === "wire" ? { ...property, value: "22 lots" } : property
        )
      }
    })
    expect(() => fromTiledSector(wire)).toThrow("wire as distances")
    const marker = (object: Record<string, unknown>) => object.type === "communication"
    expect(() =>
      fromTiledSector(editing(marker, (object) => (object.properties = [{ name: "side", value: "french" }])))
    ).toThrow("from of support or reserve")
    expect(() => fromTiledSector(editing(marker, (object) => (object.type = "tunnel")))).toThrow('class "tunnel"')
    expect(() => fromTiledSector(editing(marker, (object) => (object.properties = [])))).toThrow(
      "side of french or german"
    )
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
