// Downloads the real ground of the Fleury sector from IGN's LiDAR HD terrain model and writes it as the map package's
// elevation grid (packages/map/data/fleury-elevation.bin; format in packages/map/src/elevation.ts).
//
// LiDAR HD "MNT" is the bare-earth model: vegetation and buildings filtered out, sampled every 0.5 m, the simulation's
// own resolution. A century on, the shell holes of 1916 are still in it. Data © IGN, Licence Ouverte 2.0 (Etalab):
// free to reuse, credit "IGN – LiDAR HD".
//
// Usage: node scripts/fetch-elevation.mjs

import { writeFile } from "node:fs/promises"

/** The sector's south-west corner in Lambert-93 (EPSG:2154), metres. Fleury-devant-Douaumont lies in its east. */
const ORIGIN = { x: 876_773, y: 6_902_290 }
const WIDTH = 600
const DEPTH = 400
const CELL = 0.5
const LAYER = "IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93"
const OUTPUT = new URL("../packages/map/data/fleury-elevation.bin", import.meta.url)

const columns = WIDTH / CELL
const rows = DEPTH / CELL
// Samples sit on the grid corners, so the request covers half a cell beyond each edge, one pixel per sample.
const bbox = [ORIGIN.x - CELL / 2, ORIGIN.y - CELL / 2, ORIGIN.x + WIDTH + CELL / 2, ORIGIN.y + DEPTH + CELL / 2]
const url = new URL("https://data.geopf.fr/wms-r/wms")
url.search = new URLSearchParams({
  SERVICE: "WMS",
  VERSION: "1.3.0",
  REQUEST: "GetMap",
  LAYERS: LAYER,
  STYLES: "",
  CRS: "EPSG:2154",
  BBOX: bbox.join(","),
  WIDTH: String(columns + 1),
  HEIGHT: String(rows + 1),
  FORMAT: "image/x-bil;bits=32"
}).toString()

const response = await fetch(url)
if (!response.ok) {
  throw new Error(`IGN elevation request failed: ${response.status} ${response.statusText}`)
}
const raw = new Float32Array(await response.arrayBuffer())
if (raw.length !== (columns + 1) * (rows + 1)) {
  throw new Error(`Expected ${(columns + 1) * (rows + 1)} samples, got ${raw.length}`)
}
// The image's first row is the north edge; the map's first row is the south edge (z = 0).
const heights = new Float32Array(raw.length)
for (let row = 0; row <= rows; row++) {
  heights.set(raw.subarray((rows - row) * (columns + 1), (rows - row + 1) * (columns + 1)), row * (columns + 1))
}
const lowest = heights.reduce((low, height) => Math.min(low, height), Infinity)
const highest = heights.reduce((high, height) => Math.max(high, height), -Infinity)
const base = Math.floor(lowest)
if (highest - base > 650 || heights.some((height) => !Number.isFinite(height) || height < -100)) {
  throw new Error("Elevation has gaps or a range too large for centimetre storage")
}

// Header: magic, version, columns, rows, cell size, base height; then one unsigned centimetre per sample above base.
const header = new DataView(new ArrayBuffer(20))
header.setUint32(0, 0x4c45_4456, true) // "VDEL"
header.setUint16(4, 1, true)
header.setUint16(6, columns, true)
header.setUint16(8, rows, true)
header.setFloat32(12, CELL, true)
header.setFloat32(16, base, true)
const samples = new Uint16Array(heights.length)
heights.forEach((height, index) => {
  samples[index] = Math.round((height - base) * 100)
})
await writeFile(OUTPUT, Buffer.concat([new Uint8Array(header.buffer), new Uint8Array(samples.buffer)]))
console.log(`Wrote ${OUTPUT.pathname}: ${columns + 1} x ${rows + 1} samples, ${base} m to ${highest.toFixed(1)} m`)
