// Checks a sector's Tiled file and draws what the generator makes of it, for laying a sector out in Tiled:
//
// - reads packages/map/sectors/<name>.json, naming any object it can't read;
// - generates the battlefield from it on the surveyed ground, and sums up its trenches, wire and scenery;
// - draws <name>-generated.png, the "generated" layer of the file (hidden until switched on in Tiled): the ground the
//   generator dug and heaped (trenches, shell holes, gun pits) over the survey, the wire, and each piece of scenery's
//   footprint;
// - writes sectors/verdun.tiled-project, which gives each class of object a form in Tiled (open it with File > Open
//   Project), from the table the reader takes its defaults from.
//
// Usage: pnpm map:check [name]   (default fleury). Only Fleury generates as yet; any file is read and checked.

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  decodeElevation,
  elevationAt,
  footprintRadius,
  fromTiledSector,
  generateFleurySector,
  toTiledProject,
  toTiledSector
} from "../packages/map/src/index.ts"
import { writePng } from "./png.mjs"

const print = (line) => process.stdout.write(`${line}\n`)

const name = process.argv[2] ?? "fleury"
const folder = "packages/map/sectors"
const file = join(folder, `${name}.json`)
const PIXELS_PER_METRE = 10

writeFileSync(join(folder, "verdun.tiled-project"), `${JSON.stringify(toTiledProject(), null, 1)}\n`)

let features
try {
  features = fromTiledSector(JSON.parse(readFileSync(file, "utf8")))
} catch (error) {
  print(`${file}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
const count = (list) => list.length
print(
  `${file}: ${features.name}, ${features.width} m x ${features.depth} m. ` +
    `${count(features.sides)} sides, ${count(features.villages)} villages, ${count(features.woods)} woods, ` +
    `${count(features.roads)} roads, ${count(features.railways)} railways, ${count(features.batteries)} batteries, ` +
    `${count(features.placed)} placed, ${count(features.objectives)} objectives`
)
if (name !== "fleury") {
  print("Read without errors. Only Fleury generates as yet.")
  process.exit(0)
}

const bytes = readFileSync(`packages/map/data/${name}-elevation.bin`)
const elevation = decodeElevation(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
const started = performance.now()
const map = generateFleurySector({ seed: 1916, elevation })
const kinds = new Map()
for (const item of map.scenery) {
  kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1)
}
print(
  `Generated in ${Math.round(performance.now() - started)} ms: ${map.trenches.length} trenches, ` +
    `${map.wire.length} belts of wire, ${map.scenery.length} pieces of scenery ` +
    `(${[...kinds]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => `${n} ${kind}`)
      .join(", ")})`
)

// The preview: transparent but for what the generator made. North at the top.
const width = features.width * PIXELS_PER_METRE
const height = features.depth * PIXELS_PER_METRE
const pixels = new Uint8Array(width * height * 4)
const paint = (px, py, [r, g, b], alpha) => {
  if (px < 0 || py < 0 || px >= width || py >= height) {
    return
  }
  const i = (py * width + px) * 4
  const a = alpha / 255
  pixels[i] = Math.round(r * a + pixels[i] * (1 - a))
  pixels[i + 1] = Math.round(g * a + pixels[i + 1] * (1 - a))
  pixels[i + 2] = Math.round(b * a + pixels[i + 2] * (1 - a))
  pixels[i + 3] = Math.max(pixels[i + 3], alpha)
}
const toPixel = (x, z) => [Math.round(x * PIXELS_PER_METRE), Math.round((features.depth - z) * PIXELS_PER_METRE)]

// Dug ground dark, heaped ground pale, by how far the generator moved it from the survey.
for (let py = 0; py < height; py++) {
  for (let px = 0; px < width; px++) {
    const x = px / PIXELS_PER_METRE
    const z = features.depth - py / PIXELS_PER_METRE
    const column = Math.min(map.columns, Math.round(x / map.cellSize))
    const row = Math.min(map.rows, Math.round(z / map.cellSize))
    const moved = (map.heights[row * (map.columns + 1) + column] ?? 0) - elevationAt(elevation, x, z)
    if (moved < -0.15) {
      paint(px, py, [40, 28, 18], Math.min(230, Math.round(-moved * 110)))
    } else if (moved > 0.15) {
      paint(px, py, [235, 220, 190], Math.min(200, Math.round(moved * 140)))
    }
  }
}
const line = (points, colour, alpha, thickness) => {
  for (let index = 1; index < points.length; index++) {
    const [ax, ay] = toPixel(...points[index - 1])
    const [bx, by] = toPixel(...points[index])
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)))
    for (let step = 0; step <= steps; step++) {
      const cx = Math.round(ax + ((bx - ax) * step) / steps)
      const cy = Math.round(ay + ((by - ay) * step) / steps)
      for (let dy = -thickness; dy <= thickness; dy++) {
        for (let dx = -thickness; dx <= thickness; dx++) {
          paint(cx + dx, cy + dy, colour, alpha)
        }
      }
    }
  }
}
for (const belt of map.wire) {
  line(belt.points, [190, 40, 40], 220, 1)
}
// Each piece of scenery's footprint, the ground it takes from the walking and the eye.
for (const item of map.scenery) {
  const [cx, cy] = toPixel(item.x, item.z)
  const radius = Math.max(2, Math.round(footprintRadius(item) * PIXELS_PER_METRE))
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const edge = Math.hypot(dx, dy)
      if (edge <= radius) {
        paint(cx + dx, cy + dy, [30, 90, 150], edge > radius - 2 ? 230 : 70)
      }
    }
  }
}
const preview = `${name}-generated.png`
writePng(join(folder, preview), width, height, 4, pixels)
if (features.preview !== preview) {
  writeFileSync(file, `${JSON.stringify(toTiledSector({ ...features, preview }), null, 1)}\n`)
  print(`Added the "generated" layer to ${file}: switch it on in Tiled to see the battlefield as generated`)
}
print(`Drew ${join(folder, preview)}: dug ground dark, heaped ground pale, wire red, scenery blue`)
