// Unpacks Unity Asset Store downloads into vendor/ without opening them in Unity.
//
// A .unitypackage is a gzipped tar with one folder per asset, named by the asset's GUID. Each folder holds `asset` (the
// file's bytes) and `pathname` (its path in the Unity project, such as Assets/PolygonWar/Models/SM_Prop_Crate_01.fbx).
// This script writes each asset back to its project path, minus the leading Assets/. By default it keeps only source
// models, textures and audio; Unity-specific files (materials, prefabs, scenes, scripts, shaders) are skipped. Their
// material assignments are kept in <package>/unity-materials.json (see materialManifest).
//
// Usage: pnpm assets:unpack [--all] [--out vendor/unity] [file.unitypackage ...]
//
// With no files, it extracts every package in the Asset Store download cache, which Unity's Package Manager fills when
// you click Download under My Assets. Output goes to <out>/<package name>/. vendor/ is git-ignored: never commit it.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, extname, join, resolve, sep } from "node:path"
import { gunzipSync } from "node:zlib"

const KEPT_EXTENSIONS = new Set([
  ".fbx",
  ".obj",
  ".png",
  ".tga",
  ".jpg",
  ".jpeg",
  ".psd",
  ".tif",
  ".tiff",
  ".exr",
  ".wav",
  ".ogg",
  ".mp3",
  ".aif",
  ".aiff",
  ".flac"
])
const BLOCK = 512

/** The Asset Store download cache Unity's Package Manager writes to by default. */
function assetStoreCache() {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Unity", "Asset Store-5.x")
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Unity", "Asset Store-5.x")
  }
  return join(homedir(), ".local", "share", "unity3d", "Asset Store-5.x")
}

async function findPackages(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".unitypackage"))
    .map((entry) => join(entry.parentPath, entry.name))
}

function readString(buffer, start, length) {
  const field = buffer.subarray(start, start + length)
  const end = field.indexOf(0)
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8")
}

/** The `path` record of a PAX extended header (`<length> <key>=<value>\n` records). */
function paxPath(data) {
  for (const record of data.toString("utf8").split("\n")) {
    const match = /^\d+ path=(?<path>.*)$/.exec(record)
    if (match?.groups) {
      return match.groups.path
    }
  }
  return undefined
}

/** Yields `{ name, data }` for each regular file in an uncompressed tar archive. */
function* tarEntries(tar) {
  let offset = 0
  let longName
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) {
      return
    }
    const size = Number.parseInt(readString(header, 124, 12).trim() || "0", 8)
    const type = String.fromCharCode(header[156])
    const prefix = readString(header, 345, 155)
    const name = readString(header, 0, 100)
    const data = tar.subarray(offset + BLOCK, offset + BLOCK + size)
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK

    if (type === "x") {
      longName = paxPath(data)
    } else if (type === "L") {
      longName = readString(data, 0, data.length)
    } else if (type === "0" || type === "\0") {
      yield { name: longName ?? (prefix ? `${prefix}/${name}` : name), data }
      longName = undefined
    } else if (type !== "g") {
      longName = undefined
    }
  }
}

/** Groups tar entries into `{ guid, pathname, asset, meta }` per GUID folder. */
function unityAssets(tar) {
  const byGuid = new Map()
  for (const { name, data } of tarEntries(tar)) {
    const [guid, file] = name.replace(/^\.\//, "").split("/")
    if (!guid || !["asset", "asset.meta", "pathname"].includes(file)) {
      continue
    }
    const record = byGuid.get(guid) ?? { guid }
    if (file === "asset") {
      record.asset = data
    } else if (file === "asset.meta") {
      record.meta = data.toString("utf8")
    } else {
      record.pathname = data.toString("utf8").split(/\r?\n/)[0].trim()
    }
    byGuid.set(guid, record)
  }
  return [...byGuid.values()].filter((record) => record.asset && record.pathname)
}

/** The output path of a Unity project path, relative to the package folder. */
function outputPath(pathname) {
  return pathname.replace(/^Assets\//, "")
}

// Material properties that hold the base colour texture or colour, in priority order, across Synty's shaders.
const TEXTURE_KEYS = ["_Albedo_Map", "_Base_Map", "_Main_Texture", "_BaseMap", "_MainTex"]
const COLOR_KEYS = ["_BaseColor", "_Color", "_Tint"]

/** Base colour texture GUID and colour of a Unity .mat file. */
function parseMaterial(text) {
  const textureGuid = TEXTURE_KEYS.map(
    (key) => new RegExp(String.raw`- ${key}:\s*\n\s+m_Texture: \{fileID: \d+, guid: (\w+)`).exec(text)?.[1]
  ).find(Boolean)
  const color = COLOR_KEYS.map((key) => {
    const match = new RegExp(String.raw`- ${key}: \{r: ([^,]+), g: ([^,]+), b: ([^,]+), a: ([^}]+)\}`).exec(text)
    return match ? match.slice(1, 5).map(Number) : undefined
  }).find(Boolean)
  return { textureGuid, color }
}

/** Mesh names by file ID from a model's .meta file (old `fileIDToRecycleName` and new `internalIDToNameTable`). */
function meshNames(meta) {
  const names = new Map()
  for (const match of meta.matchAll(/^\s+(43\d{5,}): (.+)$/gm)) {
    names.set(match[1], match[2].trim())
  }
  for (const match of meta.matchAll(/- first:\s*\n\s+43: (-?\d+)\s*\n\s+second: (.+)/g)) {
    names.set(match[1], match[2].trim())
  }
  return names
}

/** `{ meshGuid, meshFileId, materialGuids }` for each mesh renderer in a Unity prefab or scene. */
function prefabRenderers(text) {
  const meshes = new Map()
  const materials = new Map()
  for (const document of text.split(/^--- /m)) {
    const classId = /^!u!(\d+)/.exec(document)?.[1]
    const gameObject = /m_GameObject: \{fileID: (-?\d+)\}/.exec(document)?.[1]
    if (!gameObject) {
      continue
    }
    const mesh = /m_Mesh: \{fileID: (-?\d+), guid: (\w+)/.exec(document)
    const materialList = /m_Materials:\s*\n((?:\s+- \{[^}]*\}\s*\n)*)/.exec(document)?.[1] ?? ""
    const materialGuids = [...materialList.matchAll(/guid: (\w+)/g)].map((match) => match[1])
    // 33 MeshFilter and 137 SkinnedMeshRenderer name the mesh; 23 MeshRenderer and 137 list its materials.
    if (mesh && (classId === "33" || classId === "137")) {
      meshes.set(gameObject, { meshFileId: mesh[1], meshGuid: mesh[2] })
    }
    if (classId === "23" || classId === "137") {
      materials.set(gameObject, materialGuids)
    }
  }
  return [...meshes].flatMap(([gameObject, mesh]) =>
    materials.has(gameObject) ? [{ ...mesh, materialGuids: materials.get(gameObject) }] : []
  )
}

/**
 * How the package's prefabs material their models, for converters that never see Unity's .mat files:
 * `materials` maps a material name to its base colour texture (output path) and colour, and `meshes` maps
 * `<model output path>#<mesh name>` to material names, one per submesh. The prefab named after the model wins when
 * prefabs disagree, since colour-variant prefabs reuse the same meshes.
 */
function materialManifest(assets) {
  const byGuid = new Map(assets.map((record) => [record.guid, record]))
  const materials = {}
  const materialName = (guid) => {
    const record = byGuid.get(guid)
    if (!record?.pathname.endsWith(".mat")) {
      return undefined
    }
    const name = basename(record.pathname, ".mat")
    if (!materials[name]) {
      const { textureGuid, color } = parseMaterial(record.asset.toString("utf8"))
      const texture = byGuid.get(textureGuid)?.pathname
      materials[name] = { texture: texture ? outputPath(texture) : null, color: color ?? null }
    }
    return name
  }

  const meshes = {}
  const fromNamedPrefab = new Set()
  for (const record of assets.filter((asset) => asset.pathname.endsWith(".prefab"))) {
    const prefabName = basename(record.pathname, ".prefab")
    for (const { meshGuid, meshFileId, materialGuids } of prefabRenderers(record.asset.toString("utf8"))) {
      const model = byGuid.get(meshGuid)
      const meshName = model?.meta ? meshNames(model.meta).get(meshFileId) : undefined
      const names = materialGuids.map(materialName)
      if (!meshName || names.some((name) => !name)) {
        continue
      }
      const key = `${outputPath(model.pathname)}#${meshName}`
      const named = prefabName === meshName || prefabName === basename(model.pathname, extname(model.pathname))
      if (!meshes[key] || (named && !fromNamedPrefab.has(key))) {
        meshes[key] = names
        if (named) {
          fromNamedPrefab.add(key)
        }
      }
    }
  }
  return { materials, meshes }
}

async function extract(packagePath, outRoot, keepAll) {
  const outDirectory = resolve(outRoot, basename(packagePath, ".unitypackage"))
  const assets = unityAssets(gunzipSync(await readFile(packagePath)))
  let written = 0
  for (const { pathname, asset } of assets) {
    if (!keepAll && !KEPT_EXTENSIONS.has(extname(pathname).toLowerCase())) {
      continue
    }
    const target = resolve(outDirectory, pathname.replace(/^Assets\//, ""))
    if (!target.startsWith(outDirectory + sep)) {
      throw new Error(`${packagePath}: refusing to write outside ${outDirectory}: ${pathname}`)
    }
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, asset)
    written += 1
  }
  const manifest = materialManifest(assets)
  await mkdir(outDirectory, { recursive: true })
  await writeFile(join(outDirectory, "unity-materials.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  const mapped = Object.keys(manifest.meshes).length
  process.stdout.write(
    `${basename(packagePath)}: ${written} of ${assets.length} files, ${mapped} meshes mapped -> ${outDirectory}\n`
  )
}

const args = process.argv.slice(2)
const keepAll = args.includes("--all")
const outIndex = args.indexOf("--out")
const outRoot = outIndex === -1 ? join("vendor", "unity") : args[outIndex + 1]
const files = args.filter((arg, index) => !arg.startsWith("--") && (outIndex === -1 || index !== outIndex + 1))
const packages = files.length > 0 ? files : await findPackages(assetStoreCache())
if (packages.length === 0) {
  console.error(`No .unitypackage files given or found in ${assetStoreCache()}`)
  process.exitCode = 1
}
for (const packagePath of packages) {
  await extract(packagePath, outRoot, keepAll)
}
