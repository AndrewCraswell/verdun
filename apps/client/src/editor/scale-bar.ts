import type { Camera } from "@babylonjs/core/Cameras/camera"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"

/** Round lengths, in metres, the ruler is marked at: ones, twos and fives of each power of ten. */
const LENGTHS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000]
/** The ruler is about this many pixels long at most; marks closer together than this are left out. */
const RULER_PIXELS = 240
const MARK_GAP = 34
/** The ruler is worked out afresh this often, in milliseconds: often enough to follow the camera. */
const EVERY = 150

/** Writes a length as a person would: metres under a kilometre, kilometres above. */
export function lengthLabel(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`
}

/**
 * The ruler at `metresPerPixel`: its whole length, the longest round length within `pixels`, and its marks, the round
 * lengths along it far enough apart to read, each with how far along it is in pixels.
 */
export function rulerFor(
  metresPerPixel: number,
  pixels = RULER_PIXELS
): { metres: number; pixels: number; marks: { metres: number; at: number }[] } {
  const fits = LENGTHS.filter((length) => length / metresPerPixel <= pixels)
  const metres = fits.at(-1) ?? LENGTHS[0] ?? 1
  const marks: { metres: number; at: number }[] = [{ metres: 0, at: 0 }]
  for (const length of LENGTHS.filter((candidate) => candidate <= metres)) {
    const at = length / metresPerPixel
    const last = marks.at(-1)
    if (last && at - last.at >= MARK_GAP) {
      marks.push({ metres: length, at })
    }
  }
  // The ruler's end is always marked, taking the place of a mark too close to it.
  const end = metres / metresPerPixel
  const last = marks.at(-1)
  if (last && last.metres !== metres) {
    if (end - last.at < MARK_GAP && marks.length > 1) {
      marks.pop()
    }
    marks.push({ metres, at: end })
  }
  return { metres, pixels: end, marks }
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
