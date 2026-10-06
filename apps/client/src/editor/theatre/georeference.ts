/**
 * Fitting a scanned map to the ground: from control points, places seen on the scan (a fort, a village's church, a
 * crossroads) whose position on the ground is known, a transform from Lambert-93 metres to the scan's pixels, by least
 * squares. Three points or more fit an affine transform (shift, scale, rotation, shear); six or more a second-order
 * polynomial too, which takes up a sheet's bending. Each point's residual says how far the fitted scan misses it.
 *
 * With many points spread over the sheet, such as every crossing of its printed kilometre grid, the fit can be made
 * exact: the scan is then also stretched like a rubber sheet, each point's residual eased in around it, so the scan
 * passes through every point and takes up a paper's local creases and stretch, which no polynomial follows.
 */

/** A place on a scan: its pixel (from the image's top-left), and where it lies in Lambert-93 metres. */
export interface ControlPoint {
  readonly name: string
  readonly pixel: readonly [number, number]
  readonly ground: readonly [number, number]
}

export interface Georeference {
  /** The scan's pixel at a point of the ground, in Lambert-93 metres. */
  toPixel(x: number, y: number): [number, number]
  /** How far, in metres on the ground, the fit misses each control point, and their root mean square. */
  readonly residuals: readonly { readonly name: string; readonly metres: number }[]
  readonly rms: number
  readonly order: 1 | 2
}

/** How sharply a rubber sheet's correction falls off with distance from each point: inverse distance to this power. */
const SHEET_POWER = 3

/** The terms of the transform's polynomial at a point: 1, x, y for affine; with x², xy, y² for second order. */
function terms(x: number, y: number, order: 1 | 2): number[] {
  return order === 1 ? [1, x, y] : [1, x, y, x * x, x * y, y * y]
}

/** Solves the normal equations of a least-squares fit, by Gaussian elimination with partial pivoting. */
function leastSquares(rows: readonly number[][], values: readonly number[]): number[] {
  const n = rows[0]?.length ?? 0
  const a = Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => 0))
  rows.forEach((row, index) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        a[i]![j]! += (row[i] ?? 0) * (row[j] ?? 0)
      }
      a[i]![n]! += (row[i] ?? 0) * (values[index] ?? 0)
    }
  })
  for (let column = 0; column < n; column++) {
    let pivot = column
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) {
        pivot = row
      }
    }
    if (Math.abs(a[pivot]![column]!) < 1e-12) {
      throw new Error("The control points don't fix the transform: they lie on a line, or too few")
    }
    ;[a[column], a[pivot]] = [a[pivot]!, a[column]!]
    for (let row = 0; row < n; row++) {
      if (row !== column) {
        const factor = a[row]![column]! / a[column]![column]!
        for (let k = column; k <= n; k++) {
          a[row]![k]! -= factor * a[column]![k]!
        }
      }
    }
  }
  return a.map((row, index) => row[n]! / row[index]!)
}

/**
 * Fits the scan to the ground from its control points. Coordinates are taken about their mean, in kilometres, so the
 * polynomial's squares stay well conditioned. `order` 2 needs six points or more; by default it's used from eight.
 */
export function georeference(points: readonly ControlPoint[], order?: 1 | 2, exact = false): Georeference {
  const chosen: 1 | 2 = order ?? (points.length >= 8 ? 2 : 1)
  const needed = chosen === 1 ? 3 : 6
  if (points.length < needed) {
    throw new Error(`An order ${chosen} fit needs ${needed} control points or more, not ${points.length}`)
  }
  const meanX = points.reduce((sum, point) => sum + point.ground[0], 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.ground[1], 0) / points.length
  const local = (x: number, y: number) => terms((x - meanX) / 1000, (y - meanY) / 1000, chosen)
  const rows = points.map((point) => local(point.ground[0], point.ground[1]))
  const u = leastSquares(
    rows,
    points.map((point) => point.pixel[0])
  )
  const v = leastSquares(
    rows,
    points.map((point) => point.pixel[1])
  )
  const polynomial = (x: number, y: number): [number, number] => {
    const t = local(x, y)
    return [
      t.reduce((sum, term, index) => sum + term * (u[index] ?? 0), 0),
      t.reduce((sum, term, index) => sum + term * (v[index] ?? 0), 0)
    ]
  }
  // The rubber sheet: what the polynomial misses at each point, in pixels, eased in by inverse distance.
  const misses = points.map((point) => {
    const [px, py] = polynomial(point.ground[0], point.ground[1])
    return { x: point.ground[0], y: point.ground[1], du: point.pixel[0] - px, dv: point.pixel[1] - py }
  })
  const toPixel = (x: number, y: number): [number, number] => {
    const [px, py] = polynomial(x, y)
    if (!exact) {
      return [px, py]
    }
    let weights = 0
    let du = 0
    let dv = 0
    for (const miss of misses) {
      const distance = Math.hypot(x - miss.x, y - miss.y)
      if (distance < 1e-6) {
        return [px + miss.du, py + miss.dv]
      }
      const weight = distance ** -SHEET_POWER
      weights += weight
      du += weight * miss.du
      dv += weight * miss.dv
    }
    return [px + du / weights, py + dv / weights]
  }
  // A residual in pixels, turned into metres by the scan's local scale near the point.
  // A residual is the polynomial's: how much the sheet is bent or stretched there, even when the fit is made exact.
  const residuals = points.map((point) => {
    const [px, py] = polynomial(point.ground[0], point.ground[1])
    const [ex, ey] = polynomial(point.ground[0] + 100, point.ground[1])
    const metresPerPixel = 100 / Math.hypot(ex - px, ey - py)
    return { name: point.name, metres: Math.hypot(px - point.pixel[0], py - point.pixel[1]) * metresPerPixel }
  })
  const rms = Math.sqrt(residuals.reduce((sum, { metres }) => sum + metres * metres, 0) / residuals.length)
  return { toPixel, residuals, rms, order: chosen }
}
