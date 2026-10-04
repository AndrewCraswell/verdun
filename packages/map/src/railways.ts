import type { Railway } from "./scenery.ts"
import type { GroundPoint } from "./trenches.ts"

/**
 * A field railway's corners ease into curves this many metres in radius, near the sharpest the 60 cm lines could take,
 * or tighter where the line's legs are too short for it.
 */
const CURVE_RADIUS = 25
/** Curves are drawn as straight runs about this many metres long. */
const CURVE_STEP = 2

/**
 * The course a railway's track takes: its line, with every corner eased into a curve (see CURVE_RADIUS), since track
 * can't turn on a point. The bed is laid along it and the track drawn on it.
 */
export function railwayCourse({ points }: Railway): GroundPoint[] {
  // Repeated points have no direction to turn from.
  const line = points.filter((point, index) => {
    const before = points[index - 1]
    return !before || before[0] !== point[0] || before[1] !== point[1]
  })
  const course: GroundPoint[] = []
  // Neighbouring curves can meet at the middle of the leg between them: one point there, not two.
  const push = (x: number, z: number) => {
    const [lastX, lastZ] = course.at(-1) ?? [Number.NaN, Number.NaN]
    if (Math.hypot(x - lastX, z - lastZ) > 1e-6 || course.length === 0) {
      course.push([x, z])
    }
  }
  const [firstX, firstZ] = line[0] ?? [0, 0]
  if (line.length > 0) {
    push(firstX, firstZ)
  }
  for (let index = 1; index < line.length - 1; index++) {
    const [ax, az] = line[index - 1] ?? [0, 0]
    const [bx, bz] = line[index] ?? [0, 0]
    const [cx, cz] = line[index + 1] ?? [0, 0]
    const inLength = Math.hypot(bx - ax, bz - az)
    const outLength = Math.hypot(cx - bx, cz - bz)
    const inX = (bx - ax) / inLength
    const inZ = (bz - az) / inLength
    const outX = (cx - bx) / outLength
    const outZ = (cz - bz) / outLength
    const turn = Math.acos(Math.min(1, Math.max(-1, inX * outX + inZ * outZ)))
    if (turn < 1e-4) {
      push(bx, bz)
      continue
    }
    // The curve leaves the line this far either side of the corner, at most half of either leg so that the curves
    // of neighbouring corners don't overlap.
    const reach = Math.min(CURVE_RADIUS * Math.tan(turn / 2), inLength / 2, outLength / 2)
    const radius = reach / Math.tan(turn / 2)
    const steps = Math.max(2, Math.ceil((radius * turn) / CURVE_STEP))
    // A quadratic curve from where it leaves the first leg to where it joins the second, drawn toward the corner.
    const [fromX, fromZ] = [bx - inX * reach, bz - inZ * reach]
    const [toX, toZ] = [bx + outX * reach, bz + outZ * reach]
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const a = (1 - t) * (1 - t)
      const b = 2 * t * (1 - t)
      const c = t * t
      push(a * fromX + b * bx + c * toX, a * fromZ + b * bz + c * toZ)
    }
  }
  const [lastX, lastZ] = line.at(-1) ?? [0, 0]
  if (line.length > 1) {
    push(lastX, lastZ)
  }
  return course
}
