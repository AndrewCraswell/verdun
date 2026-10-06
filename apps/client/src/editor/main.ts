// The sector editor: the sector as its file makes it, drawn with the level's own art under a free camera, with the
// LiDAR survey and historical maps laid over the ground to place things by. A dev tool (editor.html), served only by
// the dev server, which also hands it the sector files. Saving the sector in Tiled reloads the page, which keeps its
// view.
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { decodeElevation, generateFleurySector, heightAt, mapDepth, mapWidth } from "@verdun/map"
import elevationUrl from "@verdun/map/data/fleury-elevation.bin?url"
import surroundingsUrl from "@verdun/map/data/fleury-surroundings.bin?url"
import { installInspectorToggle } from "../dev/inspector.ts"
import { dressLevel } from "../level/dress-battlefield.ts"
import { openKitFiles } from "../level/kit-files.ts"
import { palette, surfaceColors } from "../palette.ts"
import { selectEnabledMeshes } from "../render/active-meshes.ts"
import { createEngine } from "../render/create-engine.ts"
import { createTerrainChunks } from "../terrain/terrain-chunks.ts"
import { type CameraPose, createEditorCamera, initialPose } from "./editor-camera.ts"
import { createImageOverlay, type ImageOverlay, type ImagePlacement } from "./overlay.ts"
import { startTheatre } from "./theatre/theatre.ts"

/** The sector file the editor shows. Only Fleury generates as yet. */
const SECTOR = "fleury"
/** Where the view is kept across the reloads that saving the sector brings. */
const VIEW_KEY = "verdun.editor.camera"
const OVERLAY_KEY = "verdun.editor.overlay"

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id)
  if (!(found instanceof type)) {
    throw new Error(`editor.html has no ${type.name} #${id}`)
  }
  return found
}

const canvas = element("battlefield", HTMLCanvasElement)
const status = element("status", HTMLElement)
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
  const [elevationData, surroundingsData] = await Promise.all([download(elevationUrl), download(surroundingsUrl)])
  const elevation = decodeElevation(elevationData)
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
  engine.runRenderLoop(() => {
    editorCamera.update(engine.getDeltaTime() / 1000)
    // The ground's detail follows where the camera looks: the point straight ahead, or below it when looking up.
    const ahead = camera.getDirection(Vector3.Forward())
    const reach = ahead.y < -0.05 ? Math.min(600, (camera.position.y - groundY) / -ahead.y) : 0
    terrain.flush(camera.position.x + ahead.x * reach, camera.position.z + ahead.z * reach)
    scene.render()
  })

  status.textContent = "Dressing the battlefield"
  const files = openKitFiles()
  const level = await dressLevel({ scene, camera, groundMaterial, terrain }, map, {
    files,
    surroundings: {
      elevation: decodeElevation(surroundingsData),
      sectorBase: elevation.base,
      sectorOrigin: { x: 1200, z: 1300 }
    }
  })
  void Promise.resolve(level?.sfx).finally(() => files?.close?.())
  // Shadows and the sky compile as they come; the editor needn't wait on them.
  void level?.atmosphere?.warmUp()
  // The ground beyond the sector is there for its lie, not its woods: those only crowd the view.
  for (const wood of level?.woods ?? []) {
    wood.setEnabled(false)
  }
  // The game's miniature focus follows its camera's target; an editor wants the whole view sharp.
  if (level?.postProcess) {
    level.postProcess.pipeline.depthOfFieldEnabled = false
  }
  installInspectorToggle(scene)
  // For inspecting the editor from the console, as window.verdun is for the game.
  Object.assign(window, { editor: { engine, scene, camera, map, level } })

  // The overlay: one of the sector file's image layers over the ground, or none.
  const layers = await imageLayers()
  layerSelect.replaceChildren(new Option("None", ""), ...layers.map((layer) => new Option(layer.name, layer.name)))
  const keptOverlay = readStored(OVERLAY_KEY)
  if (isRecord(keptOverlay)) {
    layerSelect.value = typeof keptOverlay.layer === "string" ? keptOverlay.layer : ""
    opacityInput.value = typeof keptOverlay.opacity === "number" ? String(keptOverlay.opacity) : opacityInput.value
  }
  let overlay: ImageOverlay | null = null
  const showOverlay = async () => {
    overlay?.dispose()
    overlay = null
    store(OVERLAY_KEY, { layer: layerSelect.value, opacity: Number(opacityInput.value) })
    const layer = layers.find((candidate) => candidate.name === layerSelect.value)
    if (layer) {
      overlay = await createImageOverlay(scene, map, layer.placement, Number(opacityInput.value))
    }
  }
  layerSelect.addEventListener("change", () => void showOverlay())
  opacityInput.addEventListener("input", () => {
    overlay?.setOpacity(Number(opacityInput.value))
    store(OVERLAY_KEY, { layer: layerSelect.value, opacity: Number(opacityInput.value) })
  })
  await showOverlay()

  status.textContent = `${width} m by ${depth} m, ${map.trenches.length} trenches, ${map.scenery.length} pieces of scenery`
}

/**
 * The sectors as they lie in the theatre. Fleury's corner is the one scripts/fetch-elevation.mjs fetched its ground
 * for; the sector files will carry their own.
 */
const SECTORS = [{ name: "Fleury", west: 876_773, south: 6_902_290, width: 600, depth: 400 }]
const THEATRE_CAMERA_KEY = "verdun.editor.theatre.camera"
const BASE_MAP_KEY = "verdun.editor.theatre.map"

/** The theatre view: the whole front, with the sectors on it. */
async function theatre(): Promise<void> {
  element("sector-name", HTMLElement).textContent = "Verdun, 1916"
  document.title = "Verdun: theatre"
  element("overlay-section", HTMLElement).hidden = true
  const engine = await createEngine(canvas)
  const kept = readStored(BASE_MAP_KEY)
  const scene = await startTheatre({
    canvas,
    engine,
    panel: element("panel", HTMLElement),
    status,
    sectors: SECTORS,
    pose: keptPose(THEATRE_CAMERA_KEY),
    keepPose: (pose) => store(THEATRE_CAMERA_KEY, pose),
    baseMap: typeof kept === "string" ? kept : null,
    keepBaseMap: (name) => store(BASE_MAP_KEY, name)
  })
  installInspectorToggle(scene)
  Object.assign(window, { editor: { engine, scene } })
}

const view = new URLSearchParams(location.search).has("theatre") ? theatre() : start()
view.catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error)
  throw error
})
