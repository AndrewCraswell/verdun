import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder"
import { Scene } from "@babylonjs/core/scene"
import { type CameraPose, createEditorCamera } from "../editor-camera.ts"
import { BASE_MAPS, createTheatreGround, THEATRE } from "./ground.ts"

/** A sector placed in the theatre: its south-west corner in Lambert-93 and its size, metres. */
export interface PlacedSector {
  readonly name: string
  readonly west: number
  readonly south: number
  readonly width: number
  readonly depth: number
}

export interface TheatreOptions {
  readonly canvas: HTMLCanvasElement
  readonly engine: AbstractEngine
  readonly panel: HTMLElement
  readonly status: HTMLElement
  readonly sectors: readonly PlacedSector[]
  readonly pose: CameraPose | null
  readonly keepPose: (pose: CameraPose) => void
  readonly baseMap: string | null
  readonly keepBaseMap: (name: string) => void
}

/**
 * The theatre view: the ground of the whole front round Verdun, with a map of the country drawn over it, chosen from
 * the list, and each sector outlined where it lies.
 */
export async function startTheatre(options: TheatreOptions): Promise<Scene> {
  const { canvas, engine, panel, status } = options
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.72, 0.75, 0.78, 1)
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene)
  sky.intensity = 0.8
  sky.groundColor = new Color3(0.45, 0.43, 0.4)
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene)
  sun.intensity = 0.55

  const groundY = 150
  const editorCamera = createEditorCamera(
    scene,
    canvas,
    options.pose ?? {
      position: [THEATRE.width / 2, groundY + 9000, -6000],
      yaw: 0,
      pitch: 0.95,
      speed: 400
    },
    () => editorCamera.frame(0, 0, THEATRE.width, THEATRE.depth, groundY)
  )
  const camera = editorCamera.camera
  camera.maxZ = 80_000
  camera.minZ = 2

  const initial = BASE_MAPS.find((map) => map.name === options.baseMap) ?? BASE_MAPS[0]
  if (!initial) {
    throw new Error("No base maps")
  }
  status.textContent = "Fetching the ground"
  const ground = await createTheatreGround(scene, initial)

  // The panel: which map the ground is drawn with.
  const section = document.createElement("section")
  const heading = document.createElement("h2")
  heading.textContent = "Base map"
  const select = document.createElement("select")
  select.append(...BASE_MAPS.map((map) => new Option(map.name, map.name)))
  select.value = initial.name
  select.addEventListener("change", () => {
    const chosen = BASE_MAPS.find((map) => map.name === select.value)
    if (chosen) {
      ground.setBaseMap(chosen)
      options.keepBaseMap(chosen.name)
    }
  })
  const label = document.createElement("label")
  label.append("Map ", select)
  const credit = document.createElement("div")
  credit.className = "muted"
  credit.textContent = "Ground and maps: IGN, Licence Ouverte 2.0"
  section.append(heading, label, credit)
  panel.querySelector("section")?.before(section)

  // Each sector outlined on the ground, a little above it.
  for (const sector of options.sectors) {
    const x0 = sector.west - THEATRE.west
    const z0 = sector.south - THEATRE.south
    const corners: [number, number][] = [
      [x0, z0],
      [x0 + sector.width, z0],
      [x0 + sector.width, z0 + sector.depth],
      [x0, z0 + sector.depth],
      [x0, z0]
    ]
    const points: Vector3[] = []
    for (let index = 1; index < corners.length; index++) {
      const [ax, az] = corners[index - 1] ?? [0, 0]
      const [bx, bz] = corners[index] ?? [0, 0]
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 10)
      for (let step = 0; step <= steps; step++) {
        const x = ax + ((bx - ax) * step) / steps
        const z = az + ((bz - az) * step) / steps
        points.push(new Vector3(x, ground.heightAt(x, z) + 4, z))
      }
    }
    const outline = CreateLines(`sector-${sector.name}`, { points }, scene)
    outline.color = new Color3(0.95, 0.75, 0.3)
    outline.isPickable = false
  }

  let keepAt = 0
  camera.onViewMatrixChangedObservable.add(() => {
    const now = performance.now()
    if (now - keepAt > 250) {
      keepAt = now
      options.keepPose(editorCamera.pose())
    }
  })
  addEventListener("resize", () => engine.resize())
  engine.runRenderLoop(() => {
    editorCamera.update(engine.getDeltaTime() / 1000)
    // The finer ground follows the point the camera looks at, or the point below it looking up.
    const ahead = camera.getDirection(Vector3.Forward())
    const above = camera.position.y - ground.heightAt(camera.position.x, camera.position.z)
    const reach = ahead.y < -0.05 ? Math.min(20_000, above / -ahead.y) : 0
    ground.update(camera.position.x + ahead.x * reach, camera.position.z + ahead.z * reach)
    const { shown, loading } = ground.detail
    status.textContent = `${THEATRE.width / 1000} km by ${THEATRE.depth / 1000} km round Verdun. ${shown} tiles in detail${loading > 0 ? `, ${loading} loading` : ""}`
    scene.render()
  })
  return scene
}
