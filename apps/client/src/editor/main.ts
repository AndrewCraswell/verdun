// The sector editor: the sector as its file makes it, drawn with the level's own art under a free camera, with the
// LiDAR survey and historical maps laid over the ground to place things by. A dev tool (editor.html), served only by
// the dev server, which also hands it the sector files. Saving the sector in Tiled reloads the page, which keeps its
// view.
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
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
import { createImageOverlay, type ImageOverlay, type ImagePlacement } from "./overlay.ts"

/** The sector file the editor shows. Only Fleury generates as yet. */
const SECTOR = "fleury"
/** Where the view is kept across the reloads that saving the sector brings. */
const VIEW_KEY = "verdun.editor.view"
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
  const middle = new Vector3(width / 2, heightAt(map, width / 2, depth / 2), depth / 2)
  const camera = new ArcRotateCamera("editor", -Math.PI / 2, 0.75, 260, middle, scene)
  const kept = readStored(VIEW_KEY)
  if (isRecord(kept) && Array.isArray(kept.target) && kept.target.every((value) => typeof value === "number")) {
    const [x = middle.x, y = middle.y, z = middle.z] = kept.target
    camera.target = new Vector3(x, y, z)
    camera.alpha = typeof kept.alpha === "number" ? kept.alpha : camera.alpha
    camera.beta = typeof kept.beta === "number" ? kept.beta : camera.beta
    camera.radius = typeof kept.radius === "number" ? kept.radius : camera.radius
  }
  camera.lowerRadiusLimit = 4
  camera.upperRadiusLimit = 900
  camera.upperBetaLimit = Math.PI / 2 - 0.02
  camera.minZ = 0.3
  camera.maxZ = 4000
  camera.wheelDeltaPercentage = 0.02
  camera.panningSensibility = 40
  camera.attachControl(canvas, true)
  let keepAt = 0
  camera.onViewMatrixChangedObservable.add(() => {
    const now = performance.now()
    if (now - keepAt > 250) {
      keepAt = now
      const { x, y, z } = camera.target
      store(VIEW_KEY, { target: [x, y, z], alpha: camera.alpha, beta: camera.beta, radius: camera.radius })
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
    terrain.flush(camera.target.x, camera.target.z)
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

start().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error)
  throw error
})
