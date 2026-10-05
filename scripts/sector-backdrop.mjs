// Draws a sector's surveyed ground as shaded relief, for its Tiled file's "survey" image layer: the ground to lay
// features out on. One pixel per Tiled pixel (10 a metre), lit from the north-west, with the hollows darkened.
// Git-ignored, so each checkout draws its own (docs/level-design.md, "Sector files").
//
// Usage: pnpm map:backdrop [elevation .bin] [out .png]
//        (defaults: packages/map/data/fleury-elevation.bin packages/map/sectors/fleury-ground.png)

import { readFileSync } from "node:fs"
import { writePng } from "./png.mjs"

const print = (line) => process.stdout.write(`${line}\n`)

const source = process.argv[2] ?? "packages/map/data/fleury-elevation.bin"
const out = process.argv[3] ?? "packages/map/sectors/fleury-ground.png"
/** Tiled pixels a metre (tiled.ts). */
const PIXELS_PER_METRE = 10

// The survey's layout (packages/map/src/elevation.ts): a 20-byte header, then centimetres above its base, south row
// first.
const bytes = readFileSync(source)
const columns = bytes.readUInt16LE(6)
const rows = bytes.readUInt16LE(8)
const cell = bytes.readFloatLE(12)
const height = (column, row) => {
  const c = Math.max(0, Math.min(columns, column))
  const r = Math.max(0, Math.min(rows, row))
  return bytes.readUInt16LE(20 + (r * (columns + 1) + c) * 2) / 100
}

const step = Math.round(cell * PIXELS_PER_METRE)
const width = columns * step
const tall = rows * step
const light = [-0.5, 0.7, 0.5]
const lightLength = Math.hypot(...light)
// Grey levels per sample, then each sample drawn as a step-by-step block of pixels.
const shade = new Uint8Array((columns + 1) * (rows + 1))
for (let row = 0; row <= rows; row++) {
  for (let column = 0; column <= columns; column++) {
    const dx = (height(column + 1, row) - height(column - 1, row)) / (2 * cell)
    const dz = (height(column, row + 1) - height(column, row - 1)) / (2 * cell)
    const normal = [-dx, 1, -dz]
    const lit =
      (normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]) / Math.hypot(...normal) / lightLength
    let around = 0
    let count = 0
    for (let a = -16; a <= 16; a += 4) {
      for (let b = -16; b <= 16; b += 4) {
        around += height(column + a, row + b)
        count++
      }
    }
    const relief = height(column, row) - around / count
    shade[row * (columns + 1) + column] = Math.round(
      255 * Math.max(0, Math.min(1, 0.5 + relief * 0.35 + (lit - 0.8) * 1.5))
    )
  }
}
// Greyscale, north at the top.
const pixels = new Uint8Array(width * tall)
for (let y = 0; y < tall; y++) {
  const row = rows - 1 - Math.floor(y / step)
  for (let x = 0; x < width; x++) {
    pixels[y * width + x] = shade[row * (columns + 1) + Math.floor(x / step)] ?? 0
  }
}
writePng(out, width, tall, 1, pixels)
print(`Drew ${width} x ${tall} px of shaded relief into ${out}`)
