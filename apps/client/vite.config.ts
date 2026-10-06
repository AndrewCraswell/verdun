/// <reference types="node" />
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs"
import type { ServerResponse } from "node:http"
import { extname, resolve, sep } from "node:path"
import { pipeline } from "node:stream"
import { defineConfig, type Plugin } from "vite"

/** Where scripts/build-level-kit.py writes the level kit. Git-ignored: paid Synty art that must never ship raw. */
const LEVEL_KIT_DIR = resolve(import.meta.dirname, "../../.asset-cache/level")
const CONTENT_TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".json": "application/json"
}

/**
 * Streams a file into a response. When the browser gives up on it first (a reload, a hot update), the file is closed
 * too: Windows locks a file while it's open, and a leaked handle stops the kit's build scripts replacing it.
 */
function sendFile(file: string, response: ServerResponse): void {
  pipeline(createReadStream(file), response, () => undefined)
}

/**
 * Serves the raw level kit at /level-kit/ from the dev server only. Production builds get the kit from the encrypted
 * asset pack instead (assetPack below); the game falls back to greybox when the kit is missing.
 */
function levelKit(): Plugin {
  return {
    name: "verdun-level-kit",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/level-kit", (request, response, next) => {
        const file = resolve(LEVEL_KIT_DIR, `.${decodeURIComponent(request.url?.split("?")[0] ?? "")}`)
        const contentType = CONTENT_TYPES[extname(file)]
        if (!file.startsWith(LEVEL_KIT_DIR + sep) || !contentType || !existsSync(file)) {
          next()
          return
        }
        response.setHeader("Content-Type", contentType)
        sendFile(file, response)
      })
    }
  }
}

/** Where scripts/build-asset-pack.mjs writes the encrypted asset pack and its key. Git-ignored. */
const PACK_FILE = resolve(import.meta.dirname, "../../.asset-cache/pack/level.pack")
const PACK_KEY_FILE = resolve(import.meta.dirname, "../../.asset-cache/pack/level.key.json")
const DEV_PACK_ROUTE = "/level-pack"

function hasPack(): boolean {
  return existsSync(PACK_FILE) && existsSync(PACK_KEY_FILE)
}

/** The pack's base64 key, from the key file the pack script writes alongside it. */
function readPackKey(): string {
  const parsed: unknown = JSON.parse(readFileSync(PACK_KEY_FILE, "utf8"))
  if (typeof parsed !== "object" || parsed === null || !("key" in parsed) || typeof parsed.key !== "string") {
    throw new Error(`${PACK_KEY_FILE}: no key; rebuild the pack with pnpm assets:pack`)
  }
  return parsed.key
}

/**
 * Ships the encrypted asset pack (docs/level-design.md). A build emits the pack under a content-hashed name and bakes
 * its URL and key into the bundle as import.meta.env.VERDUN_LEVEL_PACK_URL and _KEY, which src/level/kit-files.ts
 * reads. Without a pack, as in CI, the build defines neither and the game stays greybox. The dev server serves the pack
 * and a source.json naming it and its key under /level-pack/, read when the page is opened with `?pack`.
 */
function assetPack(): Plugin {
  let fileName: string | null = null
  return {
    name: "verdun-asset-pack",
    config(config, { command }) {
      if (command !== "build" || !hasPack()) {
        return
      }
      const hash = createHash("sha256").update(readFileSync(PACK_FILE)).digest("hex").slice(0, 16)
      fileName = `${config.build?.assetsDir ?? "assets"}/${hash}.bin`
      return {
        define: {
          "import.meta.env.VERDUN_LEVEL_PACK_URL": JSON.stringify(`${config.base ?? "/"}${fileName}`),
          "import.meta.env.VERDUN_LEVEL_PACK_KEY": JSON.stringify(readPackKey())
        }
      }
    },
    configResolved(config) {
      if (config.command === "build") {
        config.logger.info(
          fileName
            ? `Asset pack: shipping ${PACK_FILE} as ${fileName}`
            : "Asset pack: none in .asset-cache/pack, so the build has no level kit and stays greybox"
        )
      }
    },
    generateBundle() {
      if (fileName) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(PACK_FILE) })
      }
    },
    configureServer(server) {
      server.middlewares.use(DEV_PACK_ROUTE, (request, response, next) => {
        const path = request.url?.split("?")[0]
        if (!hasPack() || (path !== "/source.json" && path !== "/level.pack")) {
          next()
          return
        }
        if (path === "/source.json") {
          response.setHeader("Content-Type", "application/json")
          response.end(JSON.stringify({ url: `${DEV_PACK_ROUTE}/level.pack`, key: readPackKey() }))
          return
        }
        response.setHeader("Content-Type", "application/octet-stream")
        sendFile(PACK_FILE, response)
      })
    }
  }
}

/** Where scripts/build-music.mjs writes the soundtrack. Git-ignored, but our own work, so it ships raw. */
const MUSIC_DIR = resolve(import.meta.dirname, "../../.asset-cache/music")
const MUSIC_ROUTE = "/music"
const MUSIC_TYPES: Record<string, string> = { ".ogg": "audio/ogg", ".json": "application/json" }

/**
 * Serves the soundtrack at /music/ in dev, and copies it into a build's music/ when it has been built
 * (src/audio/music.ts). Without it, as in CI, the game has no music.
 */
function music(): Plugin {
  return {
    name: "verdun-music",
    configureServer(server) {
      server.middlewares.use(MUSIC_ROUTE, (request, response, next) => {
        const file = resolve(MUSIC_DIR, `.${decodeURIComponent(request.url?.split("?")[0] ?? "")}`)
        const contentType = MUSIC_TYPES[extname(file)]
        if (!file.startsWith(MUSIC_DIR + sep) || !contentType || !existsSync(file)) {
          next()
          return
        }
        response.setHeader("Content-Type", contentType)
        sendFile(file, response)
      })
    },
    generateBundle() {
      if (!existsSync(MUSIC_DIR)) {
        return
      }
      for (const name of readdirSync(MUSIC_DIR)) {
        if (MUSIC_TYPES[extname(name)]) {
          this.emitFile({ type: "asset", fileName: `music/${name}`, source: readFileSync(resolve(MUSIC_DIR, name)) })
        }
      }
    }
  }
}

/** The sector files and the images their Tiled maps lay out on (packages/map/sectors), for the sector editor. */
const SECTORS_DIR = resolve(import.meta.dirname, "../../packages/map/sectors")
const SECTORS_ROUTE = "/sectors"
const SECTOR_TYPES: Record<string, string> = { ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" }

/**
 * Serves the sector files at /sectors/ in dev only, for the sector editor (editor.html): the Tiled maps and their image
 * layers (the LiDAR survey, the generated preview, historical maps traced over). The editor's page isn't built: it
 * reads and writes the repository's own files through the dev server.
 */
function sectorFiles(): Plugin {
  return {
    name: "verdun-sector-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(SECTORS_ROUTE, (request, response, next) => {
        const file = resolve(SECTORS_DIR, `.${decodeURIComponent(request.url?.split("?")[0] ?? "")}`)
        const contentType = SECTOR_TYPES[extname(file)]
        if (!file.startsWith(SECTORS_DIR + sep) || !contentType || !existsSync(file)) {
          next()
          return
        }
        response.setHeader("Content-Type", contentType)
        response.setHeader("Cache-Control", "no-store")
        sendFile(file, response)
      })
    }
  }
}

/** The build's name for the menu's footer: the commit it was built from, or "dev" where git can't say. */
function buildName(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()
  } catch {
    return "dev"
  }
}

export default defineConfig(({ command }) => ({
  plugins: [levelKit(), assetPack(), music(), sectorFiles()],
  define: {
    "import.meta.env.VERDUN_BUILD": JSON.stringify(command === "build" ? buildName() : "dev"),
    // The sector server multiplayer is played on, as CI builds the live game: none here unless given, so a local
    // build plays alone by default (settings/mode.ts).
    "import.meta.env.VERDUN_SERVER": JSON.stringify(process.env["VERDUN_SERVER"] ?? "")
  },
  server: {
    port: 5173,
    strictPort: true,
    // Test coverage reports land in coverage/; writing them shouldn't reload the game.
    watch: { ignored: ["**/coverage/**"] }
  },
  optimizeDeps: {
    // The dev-only Inspector is imported lazily; pre-bundle it at startup so opening it doesn't reload the page.
    include: ["@babylonjs/inspector"]
  },
  build: {
    target: "es2024"
  },
  // The workers are modules (src/sim/sim-host.ts, src/level/kit-files.ts), so they can load what they import lazily,
  // like a region's weather records, when it's asked for: bundled as scripts, every region came inlined.
  worker: {
    format: "es"
  }
}))
