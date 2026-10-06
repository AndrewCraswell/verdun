// The sector editor: the sector as its file makes it, drawn with the level's own art where it lies in the whole front
// round Verdun, under a free camera, with maps of the country draped over the ground and the forts, villages and town
// marked. A dev tool (editor.html), served only by the dev server, which also hands it the sector files and IGN's maps.
// Saving the sector in Tiled reloads the page, which keeps its view.
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateRibbon } from "@babylonjs/core/Meshes/Builders/ribbonBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import { Scene } from "@babylonjs/core/scene"
import { decodeElevation, generateFleurySector, heightAt, mapDepth, mapWidth } from "@verdun/map"
import elevationUrl from "@verdun/map/data/fleury-elevation.bin?url"
import placesFile from "@verdun/map/data/verdun-places.json" with { type: "json" }
import { installInspectorToggle } from "../dev/inspector.ts"
import { dressLevel } from "../level/dress-battlefield.ts"
import { openKitFiles } from "../level/kit-files.ts"
import { palette, surfaceColors } from "../palette.ts"
import { selectEnabledMeshes } from "../render/active-meshes.ts"
import { createEngine } from "../render/create-engine.ts"
import { createTerrainChunks } from "../terrain/terrain-chunks.ts"
import { type CameraPose, createEditorCamera, initialPose } from "./editor-camera.ts"
import { createMarkers, isPlaceKind, PLACE_KINDS, type Place } from "./markers.ts"
import { createImageOverlay, type ImageOverlay, type ImagePlacement } from "./overlay.ts"
import { BASE_MAPS, BATTLE_BOUNDS, createTheatreGround, mapImageUrl, TERRAIN, THEATRE } from "./theatre/ground.ts"
import { createWaterTexture } from "./theatre/water.ts"

/** The sector file the editor shows. Only Fleury generates as yet. */
const SECTOR = "fleury"
/** Where the view is kept across the reloads that saving the sector brings. */
const VIEW_KEY = "verdun.editor.camera"
const OVERLAY_KEY = "verdun.editor.overlay"
const MARKERS_KEY = "verdun.editor.markers"
const RIVERS_KEY = "verdun.editor.rivers"
/**
 * Where the sector lies: its south-west corner in Lambert-93, the one scripts/fetch-elevation.mjs fetched its ground for.
 * The sector files will carry their own.
 */
const SECTOR_CORNER = { west: 876_773, south: 6_902_290 }

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id)
  if (!(found instanceof type)) {
    throw new Error(`editor.html has no ${type.name} #${id}`)
  }
  return found
}

const canvas = element("battlefield", HTMLCanvasElement)
const status = element("status", HTMLElement)
const mapSelect = element("overlay-map", HTMLSelectElement)
const layerSelect = element("overlay-layer", HTMLSelectElement)
const opacityInput = element("overlay-opacity", HTMLInputElement)

async function download(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`)
  }
  return response.arrayBuffer()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** The image layers of the sector's Tiled map, as the editor can lay them over the ground. */
async function imageLayers(): Promise<{ name: string; placement: ImagePlacement }[]> {
  const file: unknown = await (await fetch(`/sectors/${SECTOR}.json`)).json()
  const layers = isRecord(file) && Array.isArray(file.layers) ? file.layers : []
  return layers.flatMap((layer: unknown) => {
    if (!isRecord(layer) || layer.type !== "imagelayer" || typeof layer.image !== "string") {
      return []
    }
    const offset = (value: unknown) => (typeof value === "number" ? value : 0)
    return [
      {
        name: typeof layer.name === "string" ? layer.name : layer.image,
        placement: {
          url: `/sectors/${layer.image}`,
          offsetX: offset(layer.offsetx),
          offsetY: offset(layer.offsety)
        }
      }
    ]
  })
}

/** The named places round Verdun (scripts/fetch-places.mjs). */
function places(): Place[] {
  const list: unknown = isRecord(placesFile) ? placesFile.places : []
  return (Array.isArray(list) ? list : []).flatMap((place: unknown) =>
    isRecord(place) &&
    typeof place.name === "string" &&
    isPlaceKind(place.kind) &&
    typeof place.x === "number" &&
    typeof place.y === "number"
      ? [{ name: place.name, kind: place.kind, x: place.x, y: place.y }]
      : []
  )
}

function readStored(key: string): unknown {
  try {
    const stored = sessionStorage.getItem(key)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function store(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private windows: the view isn't kept, which is all.
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** The camera's pose as last kept, if there is one. */
function keptPose(key = VIEW_KEY): CameraPose | null {
  const kept = readStored(key)
  if (!isRecord(kept) || !Array.isArray(kept.position) || !kept.position.every(isNumber)) {
    return null
  }
  const [x, y, z] = kept.position
  const { yaw, pitch, speed } = kept
  if (!isNumber(x) || !isNumber(y) || !isNumber(z) || !isNumber(yaw) || !isNumber(pitch) || !isNumber(speed)) {
    return null
  }
  return { position: [x, y, z], yaw, pitch, speed }
}

async function start(): Promise<void> {
  status.textContent = "Generating the sector"
  const elevation = decodeElevation(await download(elevationUrl))
  const map = generateFleurySector({ seed: 1916, elevation })
  element("sector-name", HTMLElement).textContent = map.name
  document.title = `${map.name}: sector editor`

  const engine = await createEngine(canvas)
  const scene = new Scene(engine)
  scene.clearColor = palette.sky
  const width = mapWidth(map)
  const depth = mapDepth(map)
  const groundY = heightAt(map, width / 2, depth / 2)
  const editorCamera = createEditorCamera(scene, canvas, keptPose() ?? initialPose(width, groundY), () =>
    editorCamera.frame(0, 0, width, depth, groundY)
  )
  const camera = editorCamera.camera
  camera.maxZ = 80_000
  element("face-north", HTMLButtonElement).addEventListener("click", () => editorCamera.faceNorth())
  element("compass", HTMLButtonElement).addEventListener("click", () => editorCamera.faceNorth())
  element("reset-view", HTMLButtonElement).addEventListener("click", () =>
    editorCamera.reset(initialPose(width, groundY))
  )
  element("frame-sector", HTMLButtonElement).addEventListener("click", () =>
    editorCamera.frame(0, 0, width, depth, groundY)
  )
  const needle = element("compass-needle", HTMLElement)
  let keepAt = 0
  camera.onViewMatrixChangedObservable.add(() => {
    const now = performance.now()
    if (now - keepAt > 250) {
      keepAt = now
      store(VIEW_KEY, editorCamera.pose())
    }
  })

  // The battle's light: the atmosphere finds the sky and the sun by these names.
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene)
  sky.diffuse = palette.skyLight
  sky.groundColor = palette.groundLight
  sky.intensity = 0.75
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.3), scene)
  sun.intensity = 0.45
  const groundMaterial = new StandardMaterial("ground", scene)
  groundMaterial.specularColor = Color3.Black()
  const terrain = createTerrainChunks(scene, map, { material: groundMaterial, surfaceColors, renderStep: 2 })
  selectEnabledMeshes(scene)
  // Drawing from the start: the level's warm-up waits on frames.
  addEventListener("resize", () => engine.resize())
  // What follows the camera each frame, as it comes: the theatre's finer ground and the place labels.
  const everyFrame: ((x: number, z: number) => void)[] = []
  engine.runRenderLoop(() => {
    editorCamera.update(engine.getDeltaTime() / 1000)
    // The ground's detail follows where the camera looks: the point straight ahead, or below it when looking up.
    const ahead = camera.getDirection(Vector3.Forward())
    const reach = ahead.y < -0.05 ? Math.min(20_000, (camera.position.y - groundY) / -ahead.y) : 0
    const lookX = camera.position.x + ahead.x * reach
    const lookZ = camera.position.z + ahead.z * reach
    terrain.flush(lookX, lookZ)
    for (const follow of everyFrame) {
      follow(lookX, lookZ)
    }
    // The compass's needle points north as the camera turns.
    needle.style.transform = `rotate(${-editorCamera.yaw}rad)`
    scene.render()
  })

  status.textContent = "Dressing the battlefield"
  const files = openKitFiles()
  // The whole front's ground stands in for the game's backdrop round the sector.
  const level = await dressLevel({ scene, camera, groundMaterial, terrain }, map, { files })
  void Promise.resolve(level?.sfx).finally(() => files?.close?.())
  // Shadows and the sky compile as they come; the editor needn't wait on them.
  void level?.atmosphere?.warmUp()
  // The game's miniature focus follows its camera's target; an editor wants the whole view sharp.
  if (level?.postProcess) {
    level.postProcess.pipeline.depthOfFieldEnabled = false
  }
  installInspectorToggle(scene)
  // For inspecting the editor from the console, as window.verdun is for the game.
  Object.assign(window, { editor: { engine, scene, camera, map, level } })

  // The whole front round Verdun, its frame placed in the sector's, with a hole where the sector's own ground is drawn.
  status.textContent = "Fetching the ground round the sector"
  const theatreFrame = new TransformNode("theatre", scene)
  theatreFrame.position.set(
    THEATRE.west - SECTOR_CORNER.west,
    THEATRE.base - elevation.base,
    THEATRE.south - SECTOR_CORNER.south
  )
  const ground = await createTheatreGround(scene, TERRAIN, {
    parent: theatreFrame,
    hole: { x0: 0.5, z0: 0.5, x1: width - 0.5, z1: depth - 0.5 }
  })
  everyFrame.push((x, z) => ground.update(x - theatreFrame.position.x, z - theatreFrame.position.z))
  const sectorBox = {
    west: SECTOR_CORNER.west,
    south: SECTOR_CORNER.south,
    east: SECTOR_CORNER.west + width,
    north: SECTOR_CORNER.south + depth
  }

  // The places, marked where they lie on the ground.
  const toScene = (x: number, y: number) => {
    const tx = x - THEATRE.west
    const tz = y - THEATRE.south
    return new Vector3(
      tx + theatreFrame.position.x,
      ground.heightAt(tx, tz) + theatreFrame.position.y + 20,
      tz + theatreFrame.position.z
    )
  }
  // Where the battle was fought, and the sector, each fenced by a translucent curtain standing on the ground round it,
  // tall enough that no hill hides it.
  const outline = (
    name: string,
    box: { readonly west: number; readonly south: number; readonly east: number; readonly north: number },
    colour: Color3,
    tall: number
  ) => {
    const corners: [number, number][] = [
      [box.west, box.south],
      [box.east, box.south],
      [box.east, box.north],
      [box.west, box.north],
      [box.west, box.south]
    ]
    const foot: Vector3[] = []
    const head: Vector3[] = []
    for (let index = 1; index < corners.length; index++) {
      const [ax, ay] = corners[index - 1] ?? [0, 0]
      const [bx, by] = corners[index] ?? [0, 0]
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 25))
      for (let step = 0; step <= steps; step++) {
        // toScene stands 20 m above the ground: the curtain starts below it, so it meets the ground everywhere.
        const at = toScene(ax + ((bx - ax) * step) / steps, ay + ((by - ay) * step) / steps)
        foot.push(at.subtractFromFloats(0, 40, 0))
        head.push(at.add(new Vector3(0, tall - 20, 0)))
      }
    }
    const curtain = CreateRibbon(name, { pathArray: [foot, head], sideOrientation: 2 }, scene)
    const material = new StandardMaterial(name, scene)
    material.emissiveColor = colour
    material.disableLighting = true
    material.alpha = 0.4
    material.backFaceCulling = false
    curtain.material = material
    curtain.isPickable = false
  }
  outline("battle-bounds", BATTLE_BOUNDS, new Color3(0.9, 0.2, 0.15), 150)
  outline("sector-bounds", sectorBox, new Color3(1, 0.78, 0.3), 30)

  // The rivers, canals and ponds, bright over whatever map is down, when asked for.
  const riversBox = element("rivers", HTMLInputElement)
  const keptRivers = readStored(RIVERS_KEY)
  riversBox.checked = keptRivers === true
  let rivers: Mesh | null = null
  const showRivers = async () => {
    store(RIVERS_KEY, riversBox.checked)
    if (riversBox.checked && !rivers) {
      rivers = ground.drape("rivers", await createWaterTexture(scene), 3)
    }
    rivers?.setEnabled(riversBox.checked)
  }
  riversBox.addEventListener("change", () => void showRivers())
  void showRivers()
  const battleLabel: Place = {
    name: "Battle of Verdun, 1916",
    kind: "area",
    x: BATTLE_BOUNDS.west + 400,
    y: BATTLE_BOUNDS.north - 300
  }
  const markers = createMarkers(scene, camera, canvas, [battleLabel, ...places()], toScene)
  everyFrame.push(() => markers.update())
  const keptMarkers = readStored(MARKERS_KEY)
  const markerList = element("markers", HTMLElement)
  for (const [kind, { label }] of Object.entries(PLACE_KINDS)) {
    if (!isPlaceKind(kind)) {
      continue
    }
    const box = document.createElement("input")
    box.type = "checkbox"
    box.checked =
      isRecord(keptMarkers) && kind in keptMarkers ? keptMarkers[kind] === true : kind !== "village" && kind !== "hill"
    markers.show(kind, box.checked)
    box.addEventListener("change", () => {
      markers.show(kind, box.checked)
      const kept = readStored(MARKERS_KEY)
      store(MARKERS_KEY, { ...(isRecord(kept) ? kept : {}), [kind]: box.checked })
    })
    const row = document.createElement("label")
    row.append(box, ` ${label}`)
    markerList.append(row)
  }

  // The map draped over everything, and over the sector one of its file's own images, at the chosen opacity.
  mapSelect.replaceChildren(
    new Option("Terrain (no map)", ""),
    ...BASE_MAPS.map((base) => new Option(base.name, base.name))
  )
  const layers = await imageLayers()
  layerSelect.replaceChildren(new Option("None", ""), ...layers.map((layer) => new Option(layer.name, layer.name)))
  const keptOverlay = readStored(OVERLAY_KEY)
  if (isRecord(keptOverlay)) {
    mapSelect.value = typeof keptOverlay.map === "string" ? keptOverlay.map : ""
    layerSelect.value = typeof keptOverlay.layer === "string" ? keptOverlay.layer : ""
    opacityInput.value = typeof keptOverlay.opacity === "number" ? String(keptOverlay.opacity) : opacityInput.value
  }
  const keepOverlay = () =>
    store(OVERLAY_KEY, { map: mapSelect.value, layer: layerSelect.value, opacity: Number(opacityInput.value) })
  let overlays: ImageOverlay[] = []
  const showOverlays = async () => {
    keepOverlay()
    for (const overlay of overlays) {
      overlay.dispose()
    }
    overlays = []
    const base = BASE_MAPS.find((candidate) => candidate.name === mapSelect.value)
    ground.setBaseMap(base ?? TERRAIN)
    const placements: ImagePlacement[] = []
    if (base) {
      // The map over the sector itself, at a quarter of a metre a pixel.
      placements.push({
        url: mapImageUrl(base, sectorBox, width * 4, depth * 4),
        offsetX: 0,
        offsetY: 0,
        metresPerPixel: 0.25
      })
    }
    const layer = layers.find((candidate) => candidate.name === layerSelect.value)
    if (layer) {
      placements.push(layer.placement)
    }
    overlays = await Promise.all(
      placements.map((placement) => createImageOverlay(scene, map, placement, Number(opacityInput.value)))
    )
  }
  mapSelect.addEventListener("change", () => void showOverlays())
  layerSelect.addEventListener("change", () => void showOverlays())
  opacityInput.addEventListener("input", () => {
    keepOverlay()
    for (const overlay of overlays) {
      overlay.setOpacity(Number(opacityInput.value))
    }
  })
  await showOverlays()

  status.textContent = `${width} m by ${depth} m, ${map.trenches.length} trenches, ${map.scenery.length} pieces of scenery`
}

start().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error)
  throw error
})
