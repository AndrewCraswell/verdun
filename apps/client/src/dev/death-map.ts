import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix } from "@babylonjs/core/Maths/math.vector"
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { fallenIds, type Simulation } from "@verdun/sim"

/** Where soldiers have fallen, kept across reloads so a playtest builds up a picture of the killing ground. */
const STORAGE_KEY = "verdun.deathMap"
const DISC_RADIUS = 1.6

function load(): [number, number][] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    return Array.isArray(stored)
      ? stored.filter(
          (point): point is [number, number] =>
            Array.isArray(point) && point.length === 2 && point.every((value) => typeof value === "number")
        )
      : []
  } catch {
    return []
  }
}

function save(points: readonly [number, number][]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(points))
  } catch {
    // Storage full or blocked: the map still works for this session.
  }
}

/**
 * Dev-only death map for level tuning: records where soldiers fall and, with J, draws every fall so far as a faint red
 * disc. Where discs pile up into solid red, the ground is a killing field. The record survives reloads; call
 * `clear()` to start a fresh playtest, or `points()` to export it.
 */
export function installDeathMap(scene: Scene, sim: Simulation) {
  const points = load()
  const seen = new Set<number>()
  const disc = CreateDisc("death-map", { radius: DISC_RADIUS, tessellation: 12 }, scene)
  const material = new StandardMaterial("death-map", scene)
  material.disableLighting = true
  material.emissiveColor = new Color3(0.9, 0.08, 0.05)
  material.alpha = 0.22
  disc.material = material
  disc.isPickable = false
  disc.alwaysSelectAsActiveMesh = true
  disc.setEnabled(false)

  function redraw(): void {
    const matrices = new Float32Array(points.length * 16)
    const flat = Matrix.RotationX(Math.PI / 2)
    for (const [index, [x, z]] of points.entries()) {
      flat.multiply(Matrix.Translation(x, heightAt(sim.map, x, z) + 0.4, z)).copyToArray(matrices, index * 16)
    }
    disc.thinInstanceSetBuffer("matrix", matrices, 16)
  }

  scene.onBeforeRenderObservable.add(() => {
    let fell = false
    for (const soldier of fallenIds(sim)) {
      if (!seen.has(soldier)) {
        seen.add(soldier)
        points.push([sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier]])
        fell = true
      }
    }
    if (fell) {
      save(points)
      if (disc.isEnabled()) {
        redraw()
      }
    }
  })
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyJ" && !event.repeat) {
      disc.setEnabled(!disc.isEnabled())
      redraw()
    }
  })

  return {
    points: () => points.map(([x, z]) => [x, z]),
    clear() {
      points.length = 0
      save(points)
      redraw()
    }
  }
}
