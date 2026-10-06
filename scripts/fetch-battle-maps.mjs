// Fetches the scans of the dated battle maps the sector editor lays over the ground (packages/map/data/battle-maps.json)
// into the asset library's .asset-cache/battle-maps, the ones not there yet. The archives rate-limit, so one at a time,
// a few seconds apart. `pnpm assets:backup` keeps them on E: with the rest.
//
// Usage: pnpm map:battle-maps

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"

const print = (line) => process.stdout.write(`${line}\n`)
const catalogue = JSON.parse(await readFile(new URL("../packages/map/data/battle-maps.json", import.meta.url), "utf8"))
const folder = new URL("../.asset-cache/battle-maps/", import.meta.url)
await mkdir(folder, { recursive: true })
for (const map of catalogue.maps) {
  const file = new URL(map.file, folder)
  if (existsSync(file)) {
    continue
  }
  print(`Fetching ${map.title}`)
  const response = await fetch(map.image, { headers: { "User-Agent": "VerdunSectorEditor/0.1" } })
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
    print(`  ${map.image}: ${response.status} ${response.statusText}; try again later`)
    continue
  }
  await writeFile(file, Buffer.from(await response.arrayBuffer()))
  await new Promise((resolve) => setTimeout(resolve, 3000))
}
print("Battle maps in .asset-cache/battle-maps")
