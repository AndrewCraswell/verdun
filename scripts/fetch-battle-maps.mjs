// Fetches the scans of the battle maps into the asset library's .asset-cache/battle-maps: the dated maps the sector
// editor lays over the ground (packages/map/data/battle-maps.json) and the wider collection of trench maps and front
// lines, French and German, gathered to trace the battlefield from (packages/map/data/battle-map-library.json). Only
// those not there yet are fetched, so a run can be stopped and started again.
//
// The archives are public services, so this is a slow, polite client: one request at a time, at least `--gap` seconds
// apart on any one host (other hosts' turns come in between), a wait as long as a server asks for when it says it's
// busy, and no more requests that run to a host that refuses three times. `pnpm assets:backup` keeps the scans on E:.
//
// Usage: pnpm map:battle-maps [--gap <seconds>] [--only <host or id fragment>] [--limit <count>]

import { existsSync } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"

const print = (line) => process.stdout.write(`${line}\n`)
const option = (name, fallback) => {
  const flag = process.argv.indexOf(`--${name}`)
  return flag >= 0 && process.argv[flag + 1] ? process.argv[flag + 1] : fallback
}
const GAP = Number(option("gap", "3")) * 1000
/**
 * Hosts given longer between requests than the gap, in milliseconds: one whose robots.txt asks for a crawl delay, and
 * Mémoire des hommes, which has turned this client away before when asked too often.
 */
const HOST_GAPS = new Map([
  ["iiif.digitalcommonwealth.org", 5000],
  ["www.memoiredeshommes.defense.gouv.fr", 5000]
])
const ONLY = option("only", "")
const LIMIT = Number(option("limit", "Infinity"))
/** Waits after a refusal, longer each time, and how many a host gets before it's left for another run. */
const BACKOFF = [60_000, 180_000, 600_000]
const USER_AGENT =
  "VerdunSectorEditor/0.1 (historical research for a game of the Battle of Verdun; one request at a time)"

const folder = new URL("../.asset-cache/battle-maps/", import.meta.url)
await mkdir(folder, { recursive: true })
const read = async (name) =>
  JSON.parse(await readFile(new URL(`../packages/map/data/${name}`, import.meta.url), "utf8")).maps
/** An archive file of many scanned pages is one entry with `pages`, its image and file named with `{page}`. */
const pagesOf = (map) =>
  map.pages
    ? Array.from({ length: map.pages }, (_, index) => {
        const page = String(index + 1)
        return {
          ...map,
          id: `${map.id}-${page.padStart(3, "0")}`,
          title: `${map.title}, page ${page}`,
          image: map.image.replace("{page}", page),
          file: map.file.replace("{page}", page.padStart(3, "0"))
        }
      })
    : [map]
const wanted = [...(await read("battle-maps.json")), ...(await read("battle-map-library.json"))]
  // Files of reports, with only a few maps among their pages, wait until asked for by name.
  .filter((map) => map.kind !== "reports" || (ONLY && map.id.includes(ONLY)))
  .flatMap(pagesOf)
  .filter((map) => map.image && map.file && !existsSync(new URL(map.file, folder)))
  .filter((map) => !ONLY || map.id.includes(ONLY) || new URL(map.image).host.includes(ONLY))
  .slice(0, LIMIT)
print(`${wanted.length} scans to fetch, ${GAP / 1000} s apart on each host`)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** When each host may next be asked, and how often it has refused this run. */
const hosts = new Map()
const hostOf = (map) => {
  const name = new URL(map.image).host
  if (!hosts.has(name)) {
    hosts.set(name, { next: 0, refusals: 0 })
  }
  return hosts.get(name)
}

/** The seconds a busy server asks to be left for, if it says. */
const retryAfter = (response) => {
  const seconds = Number(response.headers.get("retry-after"))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
}

const queue = [...wanted]
let fetched = 0
while (queue.length > 0) {
  // The map whose host may be asked soonest, among hosts still answering.
  queue.sort((a, b) => hostOf(a).next - hostOf(b).next)
  const map = queue[0]
  const host = hostOf(map)
  if (host.refusals >= BACKOFF.length) {
    print(`  ${new URL(map.image).host} keeps refusing; leaving its maps for another run`)
    for (let index = queue.length - 1; index >= 0; index--) {
      if (hostOf(queue[index]) === host) {
        queue.splice(index, 1)
      }
    }
    continue
  }
  await sleep(Math.max(0, host.next - Date.now()))
  host.next = Date.now() + Math.max(GAP, HOST_GAPS.get(new URL(map.image).host) ?? 0)
  print(`Fetching ${map.title} (${map.date ?? map.from ?? "undated"})`)
  try {
    const response = await fetch(map.image, { headers: { "User-Agent": USER_AGENT } })
    const type = response.headers.get("content-type") ?? ""
    if (response.status === 429 || response.status === 503 || response.status === 403) {
      const wait = Math.max(retryAfter(response), BACKOFF[host.refusals] ?? 0)
      host.refusals += 1
      host.next = Date.now() + wait
      print(`  ${response.status}: waiting ${Math.round(wait / 1000)} s before asking ${new URL(map.image).host} again`)
      continue
    }
    if (!response.ok || !type.startsWith("image/")) {
      print(`  ${response.status} ${type}: skipped; check its catalogue entry`)
      queue.shift()
      continue
    }
    const file = new URL(map.file, folder)
    await mkdir(new URL(".", file), { recursive: true })
    await writeFile(new URL(`${map.file}.part`, folder), Buffer.from(await response.arrayBuffer()))
    await rename(new URL(`${map.file}.part`, folder), file)
    host.refusals = 0
    fetched += 1
    queue.shift()
  } catch (error) {
    // A reset connection is how some archives turn a client away.
    const wait = BACKOFF[host.refusals] ?? 0
    host.refusals += 1
    host.next = Date.now() + wait
    print(`  ${error instanceof Error ? (error.cause?.code ?? error.message) : error}: waiting ${wait / 1000} s`)
  }
}
print(`Fetched ${fetched}; the scans are in .asset-cache/battle-maps`)
