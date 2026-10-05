// Builds the ground the war map of the Western Front is drawn on: the coast, the borders of 1914 and the rivers the
// front crossed, from the North Sea to Switzerland, as apps/client/src/ui/front/front-geography.json.
//
// The coast, borders and most rivers come from Natural Earth's 1:10m data (public domain, naturalearthdata.com), cut to
// the front's box and simplified. Two things in it are drawn by hand from period maps, since Natural Earth has no
// equivalent: the Franco-German border of 1871-1918 (Alsace and part of Lorraine were German until the armistice, so
// today's border along the Rhine is left out), and the Aisne and the Oise, which its 1:10m rivers leave out.
//
// Usage: node scripts/build-front-map.mjs

import { writeFile } from "node:fs/promises"

const SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
const OUTPUT = new URL("../apps/client/src/ui/front/front-geography.json", import.meta.url)

/** The front's box, west, south, east, north, in degrees: the Channel coast to the Rhine, Paris to the Yser. */
const BOX = [1.2, 47.25, 8.4, 51.45]
/** Simplification tolerance in degrees of latitude: about 400 m, finer than the Verdun map's view needs. */
const TOLERANCE = 0.0035
/** Degrees of longitude are shorter than degrees of latitude here; lines are simplified in true proportion. */
const LONGITUDE_SCALE = Math.cos((49.3 * Math.PI) / 180)

/** Rivers to keep, by their name in Natural Earth, and the name the map gives them. */
const RIVERS = new Map([
  ["Maas", "Meuse"],
  ["Marne", "Marne"],
  ["Seine", "Seine"],
  ["Mosel", "Moselle"],
  ["Rhin", "Rhine"],
  ["Rhine", "Rhine"],
  ["Somme", "Somme"],
  ["Schelde", "Escaut"],
  ["Ill", "Ill"]
])

/** Rivers sketched from period maps through the towns on their banks, west to east or downstream. */
const SKETCHED_RIVERS = [
  {
    name: "Aisne",
    points: [
      [4.9, 49.09],
      [4.82, 49.2],
      [4.72, 49.4],
      [4.55, 49.47],
      [4.37, 49.51],
      [4.12, 49.46],
      [3.9, 49.4],
      [3.75, 49.39],
      [3.52, 49.41],
      [3.32, 49.385],
      [3.1, 49.4],
      [2.83, 49.42]
    ]
  },
  {
    name: "Oise",
    points: [
      [4.08, 49.92],
      [3.63, 49.9],
      [3.45, 49.75],
      [3.36, 49.66],
      [3.22, 49.61],
      [3.0, 49.58],
      [2.83, 49.42],
      [2.48, 49.26],
      [2.1, 49.05],
      [2.09, 48.99]
    ]
  }
]

/** The Franco-German border of the Treaty of Frankfurt, 1871, from Luxembourg to Switzerland, along the Vosges crest. */
const BORDER_1871 = [
  [5.98, 49.45],
  [5.95, 49.3],
  [5.92, 49.12],
  [6.02, 48.98],
  [6.23, 48.89],
  [6.42, 48.77],
  [6.62, 48.68],
  [6.8, 48.64],
  [7.08, 48.55],
  [7.17, 48.51],
  [7.1, 48.35],
  [7.1, 48.17],
  [7.02, 48.06],
  [6.93, 47.92],
  [6.83, 47.82],
  [6.94, 47.7],
  [7.03, 47.6],
  [7.08, 47.49]
]

const inBox = ([lon, lat]) => lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3]

/** A geometry's lines. */
function linesOf(geometry) {
  if (geometry.type === "LineString") {
    return [geometry.coordinates]
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates
  }
  return []
}

/** The runs of a line inside the box, each with one point beyond either end so it reaches the box's edge. */
function clip(line) {
  const runs = []
  let run = null
  for (let index = 0; index < line.length; index++) {
    if (inBox(line[index])) {
      if (!run) {
        run = index > 0 ? [line[index - 1]] : []
        runs.push(run)
      }
      run.push(line[index])
    } else if (run) {
      run.push(line[index])
      run = null
    }
  }
  return runs.filter((each) => each.length >= 2)
}

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const x = (value) => value * LONGITUDE_SCALE
  const dx = x(bx) - x(ax)
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x(px) - x(ax)) * dx + (py - ay) * dy) / length))
  return Math.hypot(x(px) - (x(ax) + t * dx), py - (ay + t * dy))
}

/** Douglas-Peucker. */
function simplify(points, tolerance = TOLERANCE) {
  if (points.length <= 2) {
    return points
  }
  let farthest = 0
  let at = 0
  for (let index = 1; index < points.length - 1; index++) {
    const distance = distanceToSegment(points[index], points[0], points[points.length - 1])
    if (distance > farthest) {
      farthest = distance
      at = index
    }
  }
  if (farthest <= tolerance) {
    return [points[0], points[points.length - 1]]
  }
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)]
}

/** A line as a flat list of longitudes and latitudes, to three places (about 100 m). */
const flat = (points) => points.flatMap(([lon, lat]) => [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000])

async function features(name) {
  const response = await fetch(`${SOURCE}/${name}.geojson`)
  if (!response.ok) {
    throw new Error(`${name}: ${response.status}`)
  }
  return (await response.json()).features
}

const coast = (await features("ne_10m_coastline")).flatMap((feature) => linesOf(feature.geometry).flatMap(clip))

const borders = (await features("ne_10m_admin_0_boundary_lines_land"))
  .filter((feature) => {
    const sides = [feature.properties.ADM0_LEFT, feature.properties.ADM0_RIGHT]
    // France and Germany met along the 1871 line in the war, not today's.
    return !(sides.includes("France") && sides.includes("Germany"))
  })
  .flatMap((feature) => linesOf(feature.geometry).flatMap(clip))

const rivers = new Map()
for (const file of ["ne_10m_rivers_lake_centerlines", "ne_10m_rivers_europe"]) {
  for (const feature of await features(file)) {
    const name = RIVERS.get(feature.properties.name)
    if (name) {
      rivers.set(name, [...(rivers.get(name) ?? []), ...linesOf(feature.geometry).flatMap(clip)])
    }
  }
}
for (const { name, points } of SKETCHED_RIVERS) {
  rivers.set(name, [points])
}

const geography = {
  source: "Natural Earth 1:10m (public domain); the 1871 border, the Aisne and the Oise sketched from period maps",
  box: BOX,
  coast: coast.map((line) => flat(simplify(line))),
  borders: [...borders.map((line) => flat(simplify(line))), flat(BORDER_1871)],
  rivers: [...rivers].map(([name, lines]) => ({ name, lines: lines.map((line) => flat(simplify(line))) }))
}
const text = JSON.stringify(geography)
await writeFile(OUTPUT, `${text}\n`)
process.stdout.write(`${OUTPUT.pathname}: ${(text.length / 1024).toFixed(1)} KiB\n`)
