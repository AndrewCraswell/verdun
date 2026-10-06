import type { Camera } from "@babylonjs/core/Cameras/camera"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"

/** The steps the ruler can be marked in, in metres: ones, twos, two and a halves and fives of each power of ten. */
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000, 25_000, 50_000]
/** The ruler is about this many pixels long, its marks at least this far apart. */
const RULER_PIXELS = 330
const MARK_GAP = 52
/** The ruler is worked out afresh this often, in milliseconds: often enough to follow the camera. */
const EVERY = 150

/** Writes a length as a person would: metres under a kilometre, kilometres above. */
export function lengthLabel(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`
}

/**
 * The ruler at `metresPerPixel`: marked every `step` metres, the smallest round step at least MARK_GAP pixels long,
 * for as many steps as fit in `pixels`; its whole length, and each mark with how far along it is in pixels.
 */
export function rulerFor(
  metresPerPixel: number,
  pixels = RULER_PIXELS
): { metres: number; pixels: number; marks: { metres: number; at: number }[] } {
  const step = STEPS.find((candidate) => candidate / metresPerPixel >= MARK_GAP) ?? STEPS.at(-1) ?? 1
  const count = Math.max(2, Math.floor(pixels / (step / metresPerPixel)))
  const marks = Array.from({ length: count + 1 }, (_, index) => ({
    metres: index * step,
    at: (index * step) / metresPerPixel
  }))
  return { metres: count * step, pixels: (count * step) / metresPerPixel, marks }
}

/**
 * A ruler in the view's bottom-left corner, true for the ground at the middle of the view: where the camera's middle
 * ray meets the ground, two points a hundred pixels apart across the view are found on the level of that ground, and
 * the ruler is marked in round lengths at that scale. Hidden when the middle of the view is sky.
 */
export function createScaleBar(scene: Scene, camera: Camera, canvas: HTMLCanvasElement): { update(): void } {
  const bar = document.createElement("div")
  bar.className = "scale-bar"
  const ruler = document.createElement("div")
  ruler.className = "scale-bar-ruler"
  bar.append(ruler)
  canvas.after(bar)
  let workedAt = 0
  let drawn = ""
  return {
    update() {
      const now = performance.now()
      if (now - workedAt < EVERY) {
        return
      }
      workedAt = now
      const engine = scene.getEngine()
      const width = engine.getRenderWidth()
      const height = engine.getRenderHeight()
      const ray = (x: number) => scene.createPickingRay(x, height / 2, Matrix.Identity(), camera)
      const hit = scene.pickWithRay(ray(width / 2), (mesh) => mesh.isPickable && mesh.isEnabled())
      if (!hit?.pickedPoint) {
        bar.hidden = true
        return
      }
      // The second ray meets the level of the ground found by the first.
      const across = ray(width / 2 + 100)
      const along = (hit.pickedPoint.y - across.origin.y) / across.direction.y
      if (!(along > 0)) {
        bar.hidden = true
        return
      }
      const other = across.origin.add(across.direction.scale(along))
      const cssPixels = 100 / (width / canvas.clientWidth)
      const { pixels, marks } = rulerFor(Vector3.Distance(hit.pickedPoint, other) / cssPixels)
      bar.hidden = false
      const key = marks.map((mark) => `${mark.metres}@${Math.round(mark.at)}`).join(" ")
      if (key === drawn) {
        return
      }
      drawn = key
      ruler.style.width = `${Math.round(pixels)}px`
      ruler.replaceChildren(
        ...marks.flatMap((mark, index) => {
          const tick = document.createElement("div")
          tick.className = "scale-bar-tick"
          tick.style.left = `${mark.at}px`
          const label = document.createElement("div")
          label.className = "scale-bar-label"
          label.style.left = `${mark.at}px`
          label.textContent = mark.metres === 0 ? "0" : lengthLabel(mark.metres)
          // The ruler's stretches between marks alternate dark and light, as on a map's scale.
          const next = marks[index + 1]
          const stretch = document.createElement("div")
          stretch.className = `scale-bar-stretch${index % 2 === 0 ? "" : " scale-bar-stretch-light"}`
          stretch.style.left = `${mark.at}px`
          stretch.style.width = next ? `${next.at - mark.at}px` : "0"
          return [stretch, tick, label]
        })
      )
    }
  }
}
