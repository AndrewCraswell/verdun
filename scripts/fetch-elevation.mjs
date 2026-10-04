// Downloads the real ground of the Fleury sector from IGN's LiDAR HD terrain model and writes it as the map package's
// elevation grids (format in packages/map/src/elevation.ts):
//
// - packages/map/data/fleury-elevation.bin: the sector itself, 600 m x 400 m every 0.5 m, the simulation's own grid;
// - packages/map/data/fleury-surroundings.bin: the ground round it, 3 km square every 5 m and centred on the sector,
//   drawn beyond the sector's edges out to the horizon.
//
// LiDAR HD "MNT" is the bare-earth model: vegetation and buildings filtered out. A century on, the shell holes of 1916
// are still in it. Data © IGN, Licence Ouverte 2.0 (Etalab): free to reuse, credit "IGN – LiDAR HD".
//
// Usage: node scripts/fetch-elevation.mjs [sector|surroundings]

import { writeFile } from "node:fs/promises"

/** Writes a line of the report. */
const print = (line) =>
  process.stdout.write(`${line}
`)

/** The sector's south-west corner in Lambert-93 (EPSG:2154), metres. Fleury-devant-Douaumont lies in its east. */
const ORIGIN = { x: 876_773, y: 6_902_290 }
const SECTOR = { width: 600, depth: 400 }
const LAYER = "IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93"

const GRIDS = {
  sector: {
    origin: ORIGIN,
    width: SECTOR.width,
    depth: SECTOR.depth,
    cell: 0.5,
    output: new URL("../packages/map/data/fleury-elevation.bin", import.meta.url)
  },
  // Centred on the sector, so the sector's south-west corner sits at (1200, 1300) in it.
  surroundings: {
    origin: { x: ORIGIN.x + SECTOR.width / 2 - 1500, y: ORIGIN.y + SECTOR.depth / 2 - 1500 },
    width: 3000,
    depth: 3000,
    cell: 5,
    output: new URL("../packages/map/data/fleury-surroundings.bin", import.meta.url)
  }
}

async function fetchGrid({ origin, width, depth, cell, output }) {
  const columns = width / cell
  const rows = depth / cell
  // Samples sit on the grid corners, so the request covers half a cell beyond each edge, one pixel per sample.
  const bbox = [origin.x - cell / 2, origin.y - cell / 2, origin.x + width + cell / 2, origin.y + depth + cell / 2]
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
  header.setFloat32(12, cell, true)
  header.setFloat32(16, base, true)
  const samples = new Uint16Array(heights.length)
  heights.forEach((height, index) => {
    samples[index] = Math.round((height - base) * 100)
  })
  await writeFile(output, Buffer.concat([new Uint8Array(header.buffer), new Uint8Array(samples.buffer)]))
  print(`Wrote ${output.pathname}: ${columns + 1} x ${rows + 1} samples, ${base} m to ${highest.toFixed(1)} m`)
}

const wanted = process.argv[2]
for (const [name, grid] of Object.entries(GRIDS)) {
  if (!wanted || wanted === name) {
    await fetchGrid(grid)
  }
}
