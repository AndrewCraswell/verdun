// Fetches the named places round Verdun the sector editor marks, in Lambert-93 (EPSG:2154) as the sectors and the
// theatre are, and writes them to packages/map/data/verdun-places.json:
//
// - from Wikidata (CC0): the forts and ouvrages of the fortress of Verdun, the villages (the ones destroyed in 1916
//   among them) and the town;
// - from IGN's BD TOPO (Licence Ouverte 2.0), the names on the official map: the summits and slopes the battle was
//   fought for (Cote 304, le Mort Homme, Côte de Talou, Côte du Poivre, Froideterre), the ravines (la Caillette, la
//   Poudrière, les Vignes, Bazil) and the woods (la Caillette, Nawé, Fumin, Vaux-Chapitre, the Caures).
//
// Usage: pnpm map:places

import { writeFile } from "node:fs/promises"

const print = (line) => process.stdout.write(`${line}\n`)

/**
 * The theatre round Verdun in Lambert-93 (apps/client/src/editor/theatre/ground.ts), and a box of latitude and
 * longitude a little beyond it, for Wikidata.
 */
const THEATRE = { west: 852_000, south: 6_892_000, east: 890_000, north: 6_917_000 }
const BOX = { south: 49.07, west: 5.07, north: 49.34, east: 5.6 }
/** Wikidata classes, by the kind of place the editor marks them as. */
const KINDS = {
  fort: ["Q1785071", "Q57821", "Q57831", "Q20202269"],
  village: ["Q484170", "Q532", "Q19730508"]
}
const inTheatre = (x, y) => x >= THEATRE.west && x <= THEATRE.east && y >= THEATRE.south && y <= THEATRE.north
/** The town the battle was fought for, marked apart from the villages. */
const TOWN = "Q154748"

/** Latitude and longitude (RGF93, as near WGS84 as matters here) to Lambert-93: IGN's conformal conic on GRS80. */
function toLambert93(latitude, longitude) {
  const a = 6_378_137
  const flattening = 1 / 298.257222101
  const e = Math.sqrt(2 * flattening - flattening * flattening)
  const radians = (degrees) => (degrees * Math.PI) / 180
  const m = (phi) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2)
  const t = (phi) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2)
  const [phi1, phi2, phi0, lambda0] = [radians(44), radians(49), radians(46.5), radians(3)]
  const n = (Math.log(m(phi1)) - Math.log(m(phi2))) / (Math.log(t(phi1)) - Math.log(t(phi2)))
  const f = m(phi1) / (n * t(phi1) ** n)
  const r0 = a * f * t(phi0) ** n
  const r = a * f * t(radians(latitude)) ** n
  const theta = n * (radians(longitude) - lambda0)
  return [Math.round(700_000 + r * Math.sin(theta)), Math.round(6_600_000 + r0 - r * Math.cos(theta))]
}

const classes = Object.values(KINDS)
  .flat()
  .map((id) => `wd:${id}`)
  .join(" ")
const query = `SELECT DISTINCT ?item ?label ?coord ?class WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${BOX.west} ${BOX.south})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${BOX.east} ${BOX.north})"^^geo:wktLiteral .
  }
  ?item wdt:P31 ?class .
  VALUES ?class { ${classes} }
  ?item rdfs:label ?label FILTER(LANG(?label) = "fr")
}`
const url = new URL("https://query.wikidata.org/sparql")
url.searchParams.set("query", query)
const response = await fetch(url, {
  headers: { Accept: "application/sparql-results+json", "User-Agent": "VerdunSectorEditor/0.1" }
})
if (!response.ok) {
  throw new Error(`Wikidata: ${response.status} ${response.statusText}`)
}
const { results } = await response.json()
const kindOf = (classId, itemId) =>
  itemId === TOWN ? "town" : Object.entries(KINDS).find(([, ids]) => ids.includes(classId))?.[0]
const places = new Map()
for (const row of results.bindings) {
  const id = row.item.value.split("/").pop()
  const classId = row.class.value.split("/").pop()
  const match = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord.value)
  const kind = kindOf(classId, id)
  if (!match || !kind || places.has(id)) {
    continue
  }
  const [x, y] = toLambert93(Number(match[2]), Number(match[1]))
  if (inTheatre(x, y)) {
    places.set(id, { name: row.label.value, kind, x, y, wikidata: id })
  }
}

/** A BD TOPO layer's named features over the theatre, from IGN's features service. */
async function bdTopo(typeName) {
  const service = new URL("https://data.geopf.fr/wfs/ows")
  service.search = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: `BDTOPO_V3:${typeName}`,
    SRSNAME: "EPSG:2154",
    BBOX: `${THEATRE.west},${THEATRE.south},${THEATRE.east},${THEATRE.north},EPSG:2154`,
    OUTPUTFORMAT: "application/json",
    COUNT: "10000"
  }).toString()
  const answer = await fetch(service)
  if (!answer.ok) {
    throw new Error(`BD TOPO ${typeName}: ${answer.status} ${answer.statusText}`)
  }
  return (await answer.json()).features.filter((feature) => feature.properties.toponyme)
}
/** A feature's point: a point's own, or a line's or an area's first. */
function pointOf(geometry) {
  let coordinates = geometry.coordinates
  while (Array.isArray(coordinates[0])) {
    coordinates = coordinates[0]
  }
  return coordinates.map((value) => Math.round(value))
}
function add(kind, name, [x, y]) {
  if (inTheatre(x, y)) {
    places.set(`${kind}:${name}:${x}:${y}`, { name, kind, x, y, source: "BD TOPO" })
  }
}
// Summits and crests, and the slopes the map names as côtes; the valleys it names as ravines or fonds.
for (const feature of await bdTopo("detail_orographique")) {
  const { nature, toponyme } = feature.properties
  if (nature === "Sommet" || nature === "Crête" || (nature === "Versant" && /^C[ôo]te/i.test(toponyme))) {
    add("hill", toponyme, pointOf(feature.geometry))
  } else if (nature === "Vallée" && /^(le )?(Ravin|Fond)/i.test(toponyme)) {
    add("ravine", toponyme, pointOf(feature.geometry))
  }
}
for (const feature of await bdTopo("lieu_dit_non_habite")) {
  if (feature.properties.nature === "Bois") {
    add("wood", feature.properties.toponyme, pointOf(feature.geometry))
  }
}
const sorted = [...places.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
const file = new URL("../packages/map/data/verdun-places.json", import.meta.url)
await writeFile(
  file,
  `${JSON.stringify({ source: "Wikidata (CC0); IGN BD TOPO (Licence Ouverte 2.0)", places: sorted }, null, 1)}\n`
)
const counts = Object.groupBy(sorted, (place) => place.kind)
print(
  `Wrote ${sorted.length} places: ${Object.entries(counts)
    .map(([kind, list]) => `${list.length} ${kind}`)
    .join(", ")}`
)
