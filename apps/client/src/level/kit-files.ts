import { packKitFiles } from "../assets/pack-kit-files.ts"
import { isPackSource, type PackSource } from "../assets/pack-protocol.ts"

/** Where the level kit's files come from. */
export interface KitFiles {
  /** Reads one file of the kit, such as "kit.glb" or "ground/mud.png". Rejects when it can't. */
  read(path: string): Promise<ArrayBuffer>
  /** Releases whatever holds the files, such as the pack worker and its decrypted pack, once the kit has loaded. */
  close?(): void
}

/** The dev server serves the kit built by scripts/build-level-kit.py at this route. */
const DEV_ROUTE = "/level-kit/"

/** The dev server describes the asset pack built by scripts/build-asset-pack.mjs here (see vite.config.ts). */
const DEV_PACK_SOURCE = "/level-pack/source.json"

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`)
  }
  return response
}

/** Reads the kit from the dev server's route. */
function devKitFiles(): KitFiles {
  return {
    async read(path) {
      return (await fetchOk(`${DEV_ROUTE}${path}`)).arrayBuffer()
    }
  }
}

/** The asset pack the dev server offers, for testing the production path with `?pack`. */
async function devPackSource(): Promise<PackSource> {
  const source: unknown = await (await fetchOk(DEV_PACK_SOURCE)).json()
  if (!isPackSource(source)) {
    throw new Error(`${DEV_PACK_SOURCE}: not a pack source`)
  }
  return source
}

/** The asset pack built into a production bundle by vite.config.ts, or null when the build had none. */
function builtInPackSource(): PackSource | null {
  const url: unknown = import.meta.env.VERDUN_LEVEL_PACK_URL
  const key: unknown = import.meta.env.VERDUN_LEVEL_PACK_KEY
  return typeof url === "string" && typeof key === "string" ? { url, key } : null
}

/** Reads the kit from an encrypted asset pack, decrypted in a worker. */
function packFiles(source: PackSource | Promise<PackSource>): KitFiles {
  const worker = new Worker(new URL("../assets/pack-worker.ts", import.meta.url), { type: "module" })
  // The worker fetches from its own location, so give it an absolute URL.
  const absolute = Promise.resolve(source).then(({ url, key }) => ({ url: new URL(url, document.baseURI).href, key }))
  return { ...packKitFiles(worker, absolute), close: () => worker.terminate() }
}

/**
 * The kit's files for this build, or null when the build has none. Dev builds read the raw kit from the dev server,
 * or the encrypted asset pack with `?pack`. Production builds read the pack built into them, and stay greybox without.
 */
export function openKitFiles(): KitFiles | null {
  if (import.meta.env.DEV) {
    return new URLSearchParams(globalThis.location?.search).has("pack") ? packFiles(devPackSource()) : devKitFiles()
  }
  const source = builtInPackSource()
  return source ? packFiles(source) : null
}
