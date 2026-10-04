// Exports the Fleury sector's layout (trenches, wire and scenery) as a Tiled map, or checks an edited one.
//
// Usage:
//   node scripts/export-tiled.mjs [out.tmj]       writes maps/fleury.tmj by default
//   node scripts/export-tiled.mjs --check file.tmj  reads an edited map and lists anything the trench kit can't line
//
// The file is written for version control: keys in Tiled's alphabetical order, numbers rounded by toTiledMap, and one
// line per Tiled object so a moved tree or trench is a one-line diff. Re-saving in Tiled reformats it in Tiled's style.
// See docs/level-design.md, "Editing in Tiled".

import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { checkTrenchKit, fromTiledMap, generateFleurySector, toTiledMap } from "../packages/map/src/index.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** JSON with every layer object on its own line and everything else indented. */
function format(value, indent = "", key = "") {
  if (key === "objects" && Array.isArray(value)) {
    if (value.length === 0) {
      return "[]"
    }
    const inner = `${indent}  `
    return `[\n${value.map((item) => inner + JSON.stringify(item)).join(",\n")}\n${indent}]`
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]"
    }
    const inner = `${indent}  `
    return `[\n${value.map((item) => inner + format(item, inner)).join(",\n")}\n${indent}]`
  }
  if (typeof value === "object" && value !== null) {
    const inner = `${indent}  `
    const entries = Object.entries(value).map(
      ([name, item]) => `${inner}${JSON.stringify(name)}: ${format(item, inner, name)}`
    )
    return `{\n${entries.join(",\n")}\n${indent}}`
  }
  return JSON.stringify(value)
}

function report(warnings) {
  for (const warning of warnings) {
    console.warn(`warning: ${warning}`)
  }
}

const args = process.argv.slice(2)
if (args[0] === "--check") {
  const path = resolve(args[1] ?? resolve(root, "maps/fleury.tmj"))
  const layout = fromTiledMap(JSON.parse(await readFile(path, "utf8")))
  report(layout.warnings)
  process.stdout.write(
    `${path}: ${layout.trenches.length} trenches, ${layout.wire.length} wire belts, ${layout.scenery.length} scenery, ` +
      `${layout.objectives ? `${layout.objectives.length} objectives` : "the generated objectives"}, ` +
      `${layout.warnings.length} warnings\n`
  )
} else {
  const path = resolve(args[0] ?? resolve(root, "maps/fleury.tmj"))
  const map = generateFleurySector()
  report(checkTrenchKit(map.trenches).map(({ trench, message }) => `trench ${trench}: ${message}`))
  await writeFile(path, `${format(toTiledMap(map))}\n`)
  process.stdout.write(`Wrote ${path}\n`)
}
