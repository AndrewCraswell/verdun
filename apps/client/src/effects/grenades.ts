import { VertexBuffer } from "@babylonjs/core/Buffers/buffer"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder"
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { Side, type SimEvent, type Simulation, STEP_SECONDS } from "@verdun/sim"
import { type GrenadeWay, grenadeWay, thrownTick } from "./grenade-way.ts"
import { type InstanceBuffer, instanceBuffer } from "./instance-buffer.ts"

/**
 * Grenades on their way: out of the thrower's hand, tumbling along their arc, rolling back off what they struck, and
 * lying there until they burst. The French throw the F1, the cast-iron "citron"; the Germans the M1916 stick grenade,
 * a tin can of explosive on a wooden handle. Rifle grenades go up from the grenadier's cup in a high lob and burst
 * where they come down.
 */

/** Grenades on their way at once, at most. */
const MAX_GRENADES = 64
/** A grenade is drawn no smaller than this many pixels long, so a throw can be followed from the usual view. */
const LEAST_PIXELS = 10
/** A rifle grenade leaves the cup this high above the ground the grenadier stands on, in metres. */
const MUZZLE = 1.5
/** Its speed along the ground, in metres a second, when the simulation's own landing can't be found. */
const RIFLE_GRENADE_SPEED = 40
const GRAVITY = 9.81

interface Model {
  readonly mesh: Mesh
  /** Its length, end to end, in metres. */
  readonly length: number
  /** How high its middle sits above the ground, lying on its side, in metres. */
  readonly lying: number
  readonly instances: InstanceBuffer
}

interface Live {
  readonly way: GrenadeWay
  readonly thrown: number
  readonly model: Model
}

/** A rifle grenade in the air: up from the cup and down where it bursts, nose first. */
interface Lob {
  readonly from: { readonly x: number; readonly y: number; readonly z: number }
  readonly to: { readonly x: number; readonly y: number; readonly z: number }
  readonly fired: number
  readonly seconds: number
  readonly model: Model
}

/** Paints every vertex of a part one colour, for a model drawn with one material. */
function painted(mesh: Mesh, color: Color3): Mesh {
  const count = mesh.getTotalVertices()
  const colors = new Float32Array(count * 4)
  for (let index = 0; index < count; index++) {
    colors.set([color.r, color.g, color.b, 1], index * 4)
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors)
  return mesh
}

/** Parts built standing on y, merged into one mesh lying along +z, with a dull painted-metal material. */
function model(scene: Scene, name: string, parts: Mesh[], length: number, lying: number): Model {
  const merged = Mesh.MergeMeshes(parts, true)
  if (!merged) {
    throw new Error(`grenade model ${name}: nothing to merge`)
  }
  merged.name = name
  merged.rotation.x = Math.PI / 2
  merged.bakeCurrentTransformIntoVertices()
  const material = new StandardMaterial(name, scene)
  material.diffuseColor = Color3.White()
  // A little sheen, as worn metal has: it catches the light against the mud.
  material.specularColor = new Color3(0.3, 0.3, 0.28)
  material.specularPower = 24
  merged.material = material
  merged.isPickable = false
  merged.alwaysSelectAsActiveMesh = true
  return { mesh: merged, length, lying, instances: instanceBuffer(merged, MAX_GRENADES) }
}

/** The F1: a ridged cast-iron egg 55 mm across with the igniter on top, about 90 mm in all. */
function citron(scene: Scene): Model {
  const body = painted(CreateSphere("f1-body", { diameter: 0.055, segments: 6 }, scene), new Color3(0.27, 0.28, 0.27))
  body.scaling.y = 1.22
  body.position.y = -0.008
  body.bakeCurrentTransformIntoVertices()
  const igniter = painted(
    CreateCylinder("f1-igniter", { diameter: 0.016, height: 0.032, tessellation: 6 }, scene),
    new Color3(0.34, 0.33, 0.3)
  )
  igniter.position.y = 0.034
  igniter.bakeCurrentTransformIntoVertices()
  return model(scene, "grenades-french", [body, igniter], 0.09, 0.028)
}

/** The M1916 stick grenade: a steel can 70 mm across and 100 mm tall on a 23 cm wooden handle. */
function stickGrenade(scene: Scene): Model {
  const head = painted(
    CreateCylinder("stick-head", { diameter: 0.07, height: 0.1, tessellation: 8 }, scene),
    new Color3(0.26, 0.28, 0.24)
  )
  head.position.y = 0.115
  head.bakeCurrentTransformIntoVertices()
  const handle = painted(
    CreateCylinder("stick-handle", { diameter: 0.026, height: 0.23, tessellation: 6 }, scene),
    new Color3(0.45, 0.33, 0.2)
  )
  handle.position.y = -0.05
  handle.bakeCurrentTransformIntoVertices()
  return model(scene, "grenades-german", [head, handle], 0.33, 0.035)
}

export interface GrenadeView {
  /** Takes the grenades thrown in a simulation step. Call after every step. */
  add(events: readonly SimEvent[]): void
  /** Draws each where it is now. Call once a frame. */
  update(): void
}

export function createGrenadeView(
  scene: Scene,
  { sim, tick }: { readonly sim: Simulation; readonly tick: () => number }
): GrenadeView {
  const french = citron(scene)
  const german = stickGrenade(scene)
  let live: Live[] = []
  let lobs: Lob[] = []
  const scale = new Vector3()
  const rotation = new Quaternion()
  const place = new Vector3()
  const matrix = new Matrix()
  const ground = (x: number, z: number) => heightAt(sim.map, x, z)

  /** How many metres a pixel spans at a point, seen from the camera: for keeping something small in sight. */
  function metresPerPixel(x: number, y: number, z: number): number {
    const camera = scene.activeCamera
    if (!camera) {
      return 0
    }
    const eye = camera.globalPosition
    const distance = Math.hypot(x - eye.x, y - eye.y, z - eye.z)
    const height = Math.max(1, scene.getEngine().getRenderHeight())
    return (2 * distance * Math.tan(camera.fov / 2)) / height
  }

  return {
    add(events) {
      for (const event of events) {
        if (event.type === "rifle-grenade") {
          const { x, z } = sim.soldiers.position
          const from = {
            x: x[event.soldier],
            y: ground(x[event.soldier], z[event.soldier]) + MUZZLE,
            z: z[event.soldier]
          }
          const to = { x: event.x, y: ground(event.x, event.z), z: event.z }
          // It bursts when the simulation's shell lands: found by where it lands, else by its speed.
          const shell = sim.artillery.shells.find((landing) => landing.x === event.x && landing.z === event.z)
          const range = Math.hypot(to.x - from.x, to.z - from.z)
          lobs.push({
            from,
            to,
            fired: sim.tick,
            seconds: shell ? (shell.landsAtTick - sim.tick) * STEP_SECONDS : range / RIFLE_GRENADE_SPEED,
            model: sim.soldiers.side.value[event.soldier] === Side.German ? german : french
          })
          continue
        }
        if (event.type !== "throw" || !event.grenade) {
          continue
        }
        live.push({
          way: grenadeWay(event.grenade, ground),
          thrown: thrownTick(event.grenade),
          model: sim.soldiers.side.value[event.soldier] === Side.German ? german : french
        })
      }
      live = live.slice(-MAX_GRENADES)
    },
    update() {
      const now = tick()
      // Gone when it bursts: the burst is drawn from there.
      live = live.filter((grenade) => (now - grenade.thrown) * STEP_SECONDS < grenade.way.bursts)
      const drawn = new Map<Model, number>([
        [french, 0],
        [german, 0]
      ])
      for (const grenade of live) {
        const at = grenade.way.at((now - grenade.thrown) * STEP_SECONDS)
        if (at.phase === "hand") {
          continue
        }
        const { model } = grenade
        const index = drawn.get(model) ?? 0
        const enlarge = Math.max(1, (LEAST_PIXELS * metresPerPixel(at.x, at.y, at.z)) / model.length)
        scale.setAll(enlarge)
        Quaternion.RotationYawPitchRollToRef(grenade.way.heading, at.tumble, 0, rotation)
        // Down, it lies on its side on the ground, however much it's drawn larger than life.
        place.set(at.x, at.phase === "air" ? at.y : at.y + model.lying * enlarge, at.z)
        Matrix.ComposeToRef(scale, rotation, place, matrix)
        model.instances.reserve(index + 1)
        matrix.copyToArray(model.instances.data, index * 16)
        drawn.set(model, index + 1)
      }
      lobs = lobs.filter((lob) => (now - lob.fired) * STEP_SECONDS < lob.seconds)
      for (const lob of lobs) {
        const { from, to, model } = lob
        const seconds = Math.max(0, (now - lob.fired) * STEP_SECONDS)
        const share = seconds / Math.max(lob.seconds, 1e-6)
        // A ballistic arc: the straight line between, lifted by what gravity hasn't yet taken back.
        const y = from.y + (to.y - from.y) * share + 0.5 * GRAVITY * seconds * (lob.seconds - seconds)
        const x = from.x + (to.x - from.x) * share
        const z = from.z + (to.z - from.z) * share
        const along = Math.hypot(to.x - from.x, to.z - from.z) / Math.max(lob.seconds, 1e-6)
        const rising = (to.y - from.y) / Math.max(lob.seconds, 1e-6) + GRAVITY * (lob.seconds / 2 - seconds)
        const index = drawn.get(model) ?? 0
        const enlarge = Math.max(1, (LEAST_PIXELS * metresPerPixel(x, y, z)) / model.length)
        scale.setAll(enlarge)
        // Nose first along its flight: up on the way out, down on the way in.
        Quaternion.RotationYawPitchRollToRef(
          Math.atan2(to.x - from.x, to.z - from.z),
          -Math.atan2(rising, along),
          0,
          rotation
        )
        place.set(x, y, z)
        Matrix.ComposeToRef(scale, rotation, place, matrix)
        model.instances.reserve(index + 1)
        matrix.copyToArray(model.instances.data, index * 16)
        drawn.set(model, index + 1)
      }
      for (const [model, count] of drawn) {
        model.instances.commit(count)
      }
    }
  }
}
