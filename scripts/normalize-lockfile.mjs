// Makes pnpm-lock.yaml installable from the public npm registry.
//
// Machines on a VPN that forces installs through a corporate npm mirror record the mirror's tarball URLs, and sometimes
// only SHA-1 integrity hashes, in the lockfile. CI installs from registry.npmjs.org and rejects those entries. Mirrors
// serve the original npm packages, so this script checks each entry against the mirror's package metadata and rewrites
// it to a SHA-512 integrity with no tarball URL. It uses the published SHA-512 when the mirror has one, and otherwise
// downloads the tarball (cached on the mirror, since this machine installed it) and hashes it.
// pnpm then resolves the tarball from whichever registry it is configured to use.
//
// Usage: node scripts/normalize-lockfile.mjs [path/to/pnpm-lock.yaml]

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

const lockfilePath = process.argv[2] ?? "pnpm-lock.yaml"
const PUBLIC_REGISTRY = "https://registry.npmjs.org/"
const CONCURRENCY = 8
const RESOLUTION = /resolution: \{integrity: (?<integrity>[^,}]+), tarball: (?<tarball>[^}]+)\}/g

/** The registry this machine installs from, such as a corporate mirror. */
function configuredRegistry() {
  const registry =
    process.env.npm_config_registry ?? execFileSync("npm config get registry", { shell: true, encoding: "utf8" })
  const trimmed = registry.trim()
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`
}

/** Package name and version from a registry tarball URL: `.../<name>/-/<basename>-<version>.tgz`. */
function parseTarball(tarball) {
  const path = decodeURIComponent(tarball.split("/registry/").at(-1) ?? tarball)
  const [name, file] = path.split("/-/")
  const basename = name.split("/").at(-1)
  const version = file.slice(basename.length + 1, -".tgz".length)
  return { name, version }
}

const packuments = new Map()
function packument(registry, name) {
  if (!packuments.has(name)) {
    const url = `${registry}${name.replace("/", "%2F")}`
    packuments.set(
      name,
      fetch(url, { headers: { accept: "application/json" } }).then((response) => {
        if (!response.ok) {
          throw new Error(`GET ${url} failed with ${response.status}`)
        }
        return response.json()
      })
    )
  }
  return packuments.get(name)
}

async function sha512Of(tarball, registry) {
  // Mirrors don't always serve a tarball from the URL they recorded, so fall back to the registry's standard path.
  const candidates = [tarball, `${registry}${tarball.split("/registry/").at(-1)}`]
  for (const url of candidates) {
    const response = await fetch(url, { redirect: "follow" })
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer())
      return { sha512: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, bytes }
    }
  }
  throw new Error(`Could not download ${tarball}`)
}

function sha1Integrity(hexShasum) {
  return `sha1-${Buffer.from(hexShasum, "hex").toString("base64")}`
}

async function normalizedResolution({ integrity, tarball }, registry) {
  const { name, version } = parseTarball(tarball)
  const dist = (await packument(registry, name)).versions?.[version]?.dist
  const matches = dist && (integrity === dist.integrity || (dist.shasum && integrity === sha1Integrity(dist.shasum)))
  if (!matches) {
    throw new Error(`${name}@${version}: lockfile integrity ${integrity} doesn't match the published package`)
  }
  if (dist.integrity?.startsWith("sha512-")) {
    return `resolution: {integrity: ${dist.integrity}}`
  }
  const { sha512, bytes } = await sha512Of(tarball, registry)
  if (`sha1-${createHash("sha1").update(bytes).digest("base64")}` !== integrity) {
    throw new Error(`${name}@${version}: downloaded tarball doesn't match the lockfile's ${integrity}`)
  }
  return `resolution: {integrity: ${sha512}}`
}

const lockfile = await readFile(lockfilePath, "utf8")
const entries = [...lockfile.matchAll(RESOLUTION)].filter((match) => !match.groups.tarball.startsWith(PUBLIC_REGISTRY))

if (entries.length > 0) {
  const registry = configuredRegistry()
  const replacements = new Map()
  for (let start = 0; start < entries.length; start += CONCURRENCY) {
    const batch = entries.slice(start, start + CONCURRENCY)
    const results = await Promise.all(batch.map((match) => normalizedResolution(match.groups, registry)))
    batch.forEach((match, index) => replacements.set(match[0], results[index]))
  }
  await writeFile(
    lockfilePath,
    lockfile.replace(RESOLUTION, (match) => replacements.get(match) ?? match)
  )
  process.stdout.write(`Normalized ${replacements.size} mirrored lockfile entries for the public npm registry.\n`)
}
