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
import { createMarkers, DEFAULT_KINDS, isPlaceKind, PLACE_KINDS, type Place } from "./markers.ts"
import { createImageOverlay, type ImageOverlay, type ImagePlacement } from "./overlay.ts"
import { createScaleBar } from "./scale-bar.ts"
import { createAlignment } from "./theatre/align.ts"
import { BATTLE_MAPS, type BattleMap, type BattleMapDrape, drapeBattleMap } from "./theatre/battle-maps.ts"
import { BATTLE_AREA, FRONT_LINE_DATES, FRONT_LINES } from "./theatre/front-lines.ts"
import { BASE_MAPS, createTheatreGround, mapImageUrl, TERRAIN, THEATRE } from "./theatre/ground.ts"
import { createWaterTexture } from "./theatre/water.ts"

/** The sector file the editor shows. Only Fleury generates as yet. */
const SECTOR = "fleury"
/** Where the view is kept across the reloads that saving the sector brings. */
const VIEW_KEY = "verdun.editor.camera"
const OVERLAY_KEY = "verdun.editor.overlay"
const MARKERS_KEY = "verdun.editor.markers"
const RIVERS_KEY = "verdun.editor.rivers"
const RELIEF_KEY = "verdun.editor.relief"
const BATTLE_MAP_KEY = "verdun.editor.battle-map"
const FRONT_LINES_KEY = "verdun.editor.front-lines"
const SECTOR_KEY = "verdun.editor.sector"
/**
 * The camera layer the sector is drawn on, its ground, trenches, scenery and the images laid over it: the camera leaves
 * it out to hide the sector, so the theatre's ground shows through where it was.
 */
const SECTOR_LAYER = 0x0100_0000
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
      ? [
          {
            name: place.name,
            kind: place.kind,
            x: place.x,
            y: place.y,
            ...(typeof place.wikipedia === "string" ? { wikipedia: place.wikipedia } : {})
          }
        ]
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
  const scaleBar = createScaleBar(scene, camera, canvas)
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
    scaleBar.update()
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

  // Everything drawn so far is the sector.
  for (const mesh of scene.meshes) {
    mesh.layerMask = SECTOR_LAYER
  }

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
  everyFrame.push(() => ground.update(camera))
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
      ground.heightAt(tx, tz) * theatreFrame.scaling.y + theatreFrame.position.y + 20,
      tz + theatreFrame.position.z
    )
  }
  // Where the battle was fought, and the sector, each fenced by a translucent curtain standing on the ground round it,
  // tall enough that no hill hides it.
  /** A translucent curtain standing `tall` metres over the ground along a line of Lambert-93 points. */
  const curtain = (name: string, corners: readonly (readonly [number, number])[], colour: Color3, tall: number) => {
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
    const ribbon = CreateRibbon(name, { pathArray: [foot, head], sideOrientation: 2 }, scene)
    const material = new StandardMaterial(name, scene)
    material.emissiveColor = colour
    material.disableLighting = true
    material.alpha = 0.4
    material.backFaceCulling = false
    ribbon.material = material
    ribbon.isPickable = false
  }
  /** A band `wide` metres across lying on the ground along a line, seen from above as the curtain isn't. */
  const band = (name: string, points: readonly (readonly [number, number])[], colour: Color3, wide: number) => {
    const left: Vector3[] = []
    const right: Vector3[] = []
    points.forEach(([x, y], index) => {
      const [ax, ay] = points[Math.max(0, index - 1)] ?? [x, y]
      const [bx, by] = points[Math.min(points.length - 1, index + 1)] ?? [x, y]
      const length = Math.hypot(bx - ax, by - ay) || 1
      const [nx, ny] = [(-(by - ay) / length) * (wide / 2), ((bx - ax) / length) * (wide / 2)]
      left.push(toScene(x + nx, y + ny).subtractFromFloats(0, 12, 0))
      right.push(toScene(x - nx, y - ny).subtractFromFloats(0, 12, 0))
    })
    const ribbon = CreateRibbon(name, { pathArray: [left, right], sideOrientation: 2 }, scene)
    const material = new StandardMaterial(name, scene)
    material.emissiveColor = colour
    material.disableLighting = true
    material.alpha = 0.85
    material.backFaceCulling = false
    material.zOffset = -8
    ribbon.material = material
    ribbon.isPickable = false
  }
  const outline = (
    name: string,
    box: { readonly west: number; readonly south: number; readonly east: number; readonly north: number },
    colour: Color3,
    tall: number
  ) =>
    curtain(
      name,
      [
        [box.west, box.south],
        [box.east, box.south],
        [box.east, box.north],
        [box.west, box.north],
        [box.west, box.south]
      ],
      colour,
      tall
    )
  // The front lines of a date: German in blue, French in red.
  const frontSelect = element("front-lines", HTMLSelectElement)
  const frontNote = element("front-lines-note", HTMLElement)
  const lineDate = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  frontSelect.replaceChildren(
    new Option("None", ""),
    ...FRONT_LINE_DATES.map((date) => new Option(lineDate(date), date))
  )
  const keptFront = readStored(FRONT_LINES_KEY)
  frontSelect.value = typeof keptFront === "string" && FRONT_LINE_DATES.includes(keptFront) ? keptFront : ""
  const drawFrontLines = () => {
    for (const mesh of scene.meshes.filter((candidate) => candidate.name.startsWith("front-line-"))) {
      mesh.dispose(false, true)
    }
    const shown = FRONT_LINES.filter((line) => line.date === frontSelect.value)
    for (const line of shown) {
      const colour = line.side === "german" ? new Color3(0.15, 0.35, 0.95) : new Color3(0.95, 0.15, 0.12)
      curtain(`front-line-${line.id}`, line.points, colour, 60)
      band(`front-line-${line.id}-band`, line.points, colour, 60)
    }
    const kilometres = shown.reduce(
      (sum, line) =>
        sum +
        line.points.slice(1).reduce((total, [x, y], index) => {
          const [px, py] = line.points[index] ?? [x, y]
          return total + Math.hypot(x - px, y - py)
        }, 0),
      0
    )
    frontNote.textContent = shown.length
      ? `${shown.map((line) => line.note).join(" ")} ${Math.round(kilometres / 100) / 10} km traced.`
      : ""
  }
  frontSelect.addEventListener("change", () => {
    store(FRONT_LINES_KEY, frontSelect.value)
    drawFrontLines()
  })
  const drawOutlines = () => {
    scene.getMeshByName("battle-bounds")?.dispose(false, true)
    scene.getMeshByName("battle-bounds-band")?.dispose(false, true)
    scene.getMeshByName("sector-bounds")?.dispose(false, true)
    // Violet: red and blue are the armies' colours on the maps and in the front lines.
    const battleColour = new Color3(0.6, 0.25, 0.9)
    curtain("battle-bounds", BATTLE_AREA, battleColour, 150)
    band("battle-bounds-band", BATTLE_AREA, battleColour, 90)
    outline("sector-bounds", sectorBox, new Color3(1, 0.78, 0.3), 30)
    drawFrontLines()
  }
  drawOutlines()

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
    // Over the battlefield's middle: the Côte du Talou, between the banks.
    x: BATTLE_AREA.reduce((sum, [x]) => sum + x, 0) / Math.max(1, BATTLE_AREA.length),
    y: BATTLE_AREA.reduce((sum, [, y]) => sum + y, 0) / Math.max(1, BATTLE_AREA.length)
  }
  // Choosing a place from a label's list takes the camera to it, a kilometre and a half off.
  const flyTo = (place: Place) => {
    const at = toScene(place.x, place.y)
    editorCamera.frame(at.x - 600, at.z - 600, at.x + 600, at.z + 600, at.y)
  }
  const markers = createMarkers(scene, camera, canvas, [battleLabel, ...places()], toScene, flyTo)

  // The battle maps: a dated map of the battle laid over the ground, at its own opacity.
  const battleSelect = element("battle-map", HTMLSelectElement)
  const battleOpacity = element("battle-map-opacity", HTMLInputElement)
  const battleNote = element("battle-map-note", HTMLElement)
  const dateOf = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  battleSelect.replaceChildren(
    new Option("None", ""),
    ...BATTLE_MAPS.map((battle) => {
      const when = battle.from === battle.to ? dateOf(battle.from) : `${dateOf(battle.from)} to ${dateOf(battle.to)}`
      return new Option(`${when}: ${battle.name}`, battle.id)
    })
  )
  const keptBattle = readStored(BATTLE_MAP_KEY)
  if (isRecord(keptBattle)) {
    battleSelect.value = typeof keptBattle.id === "string" ? keptBattle.id : ""
    battleOpacity.value = isNumber(keptBattle.opacity) ? String(keptBattle.opacity) : battleOpacity.value
  }
  let battleDrape: BattleMapDrape | null = null
  // The maps as aligned this session, by id: control points added or deleted by hand, not yet saved.
  const aligned = new Map<string, BattleMap>()
  const chosenMap = () => {
    const id = battleSelect.value
    return aligned.get(id) ?? BATTLE_MAPS.find((battle) => battle.id === id) ?? null
  }
  const drawBattleMap = () => {
    battleDrape?.dispose()
    battleDrape = null
    const chosen = chosenMap()
    battleNote.textContent = ""
    if (chosen) {
      try {
        battleDrape = drapeBattleMap(scene, chosen, theatreFrame, ground.heightAt, Number(battleOpacity.value))
        battleNote.textContent = `${chosen.title}. ${chosen.source}. ${chosen.credit}. Fitted to within ${Math.round(battleDrape.rms)} m.`
      } catch (error) {
        battleNote.textContent = error instanceof Error ? error.message : String(error)
      }
    }
  }
  const alignButton = element("align-battle-map", HTMLButtonElement)
  const saveButton = element("save-battle-map", HTMLButtonElement)
  const alignment = createAlignment({
    scene,
    camera,
    canvas,
    frame: theatreFrame,
    list: element("align-points", HTMLElement),
    status: element("align-status", HTMLElement),
    heightAt: ground.heightAt,
    onChange: (map) => {
      aligned.set(map.id, map)
      saveButton.disabled = false
      drawBattleMap()
    }
  })
  let aligning = false
  alignButton.addEventListener("click", () => {
    aligning = !aligning
    alignButton.textContent = aligning ? "Done aligning" : "Align"
    element("align-panel", HTMLElement).hidden = !aligning
    alignment.setActive(aligning)
  })
  saveButton.addEventListener("click", () => {
    const chosen = chosenMap()
    if (!chosen) {
      return
    }
    void fetch("/battle-maps/catalogue", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: chosen.id, controlPoints: chosen.controlPoints })
    }).then((answer) => {
      saveButton.disabled = answer.ok
      element("align-status", HTMLElement).textContent = answer.ok
        ? "Saved to packages/map/data/battle-maps.json"
        : `Couldn't save: ${answer.status}`
    })
  })
  const showBattleMap = () => {
    store(BATTLE_MAP_KEY, { id: battleSelect.value, opacity: Number(battleOpacity.value) })
    alignment.setMap(chosenMap())
    alignButton.disabled = !chosenMap()
    drawBattleMap()
  }
  battleSelect.addEventListener("change", showBattleMap)
  battleOpacity.addEventListener("input", () => {
    store(BATTLE_MAP_KEY, { id: battleSelect.value, opacity: Number(battleOpacity.value) })
    battleDrape?.setOpacity(Number(battleOpacity.value))
  })
  showBattleMap()

  // Seeing the lie of the land: the hillshade multiplied into the map, the ground round the sector raised by a factor
  // (about the sector's own height, so the sector stays where it is), and the labels thinned where they'd overlap.
  const reliefInput = element("relief", HTMLInputElement)
  const shadeBox = element("shade-relief", HTMLInputElement)
  const declutterBox = element("declutter", HTMLInputElement)
  const keptRelief = readStored(RELIEF_KEY)
  if (isRecord(keptRelief)) {
    reliefInput.value = isNumber(keptRelief.scale) ? String(keptRelief.scale) : reliefInput.value
    shadeBox.checked = keptRelief.shade === true
    declutterBox.checked = keptRelief.declutter !== false
  }
  const sectorHeight = groundY + elevation.base - THEATRE.base
  const applyRelief = () => {
    const scale = Number(reliefInput.value)
    store(RELIEF_KEY, { scale, shade: shadeBox.checked, declutter: declutterBox.checked })
    element("relief-value", HTMLElement).textContent = `×${scale}`
    theatreFrame.scaling.y = scale
    theatreFrame.position.y = groundY - scale * sectorHeight
    markers.relocate()
    drawOutlines()
  }
  reliefInput.addEventListener("input", applyRelief)
  shadeBox.addEventListener("change", () => {
    ground.setShading(shadeBox.checked)
    applyRelief()
  })
  declutterBox.addEventListener("change", () => {
    markers.declutter(declutterBox.checked)
    applyRelief()
  })
  ground.setShading(shadeBox.checked)
  markers.declutter(declutterBox.checked)
  applyRelief()
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
      isRecord(keptMarkers) && kind in keptMarkers ? keptMarkers[kind] === true : DEFAULT_KINDS.includes(kind)
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
    for (const overlay of overlays) {
      overlay.mesh.layerMask = SECTOR_LAYER
    }
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

  // The sector shown, or hidden for the lie of the land under it.
  const sectorToggle = element("show-sector", HTMLInputElement)
  sectorToggle.checked = readStored(SECTOR_KEY) !== false
  const showSector = () => {
    store(SECTOR_KEY, sectorToggle.checked)
    camera.layerMask = sectorToggle.checked ? camera.layerMask | SECTOR_LAYER : camera.layerMask & ~SECTOR_LAYER
    ground.setHole(sectorToggle.checked)
  }
  sectorToggle.addEventListener("change", showSector)
  showSector()

  status.textContent = `${width} m by ${depth} m, ${map.trenches.length} trenches, ${map.scenery.length} pieces of scenery`
}

start().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error)
  throw error
})
