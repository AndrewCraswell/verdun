/**
 * The graphics setting: how much the effects cost the graphics card. The battle is limited by the graphics card on
 * modest laptops (22 fps on a GeForce 860M at 1080p), and most of the weather and battle effects are drawn per pixel,
 * so "low" drops the ones that cost most for least: see docs/time-and-weather.md#graphics-quality.
 *
 * Read once at load, since effects choose their shaders as the battle is built: changing it takes a reload.
 */
export type GraphicsQuality = "low" | "high"

/** Where the setting is kept between visits. */
export const GRAPHICS_KEY = "verdun.graphics"

const isQuality = (value: unknown): value is GraphicsQuality => value === "low" || value === "high"

/** The little of `Storage` the setting needs; reads and writes may throw (private windows, blocked site data). */
export interface GraphicsStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * The graphics setting: `?quality=low` or `?quality=high` in the address if given (and kept), else what was kept,
 * else high.
 */
export function graphicsQuality(store: GraphicsStore | null, search?: URLSearchParams): GraphicsQuality {
  const asked = search?.get("quality")
  if (isQuality(asked)) {
    saveGraphicsQuality(store, asked)
    return asked
  }
  try {
    const kept = store?.getItem(GRAPHICS_KEY)
    return isQuality(kept) ? kept : "high"
  } catch {
    return "high"
  }
}

/** Keeps the setting for the next visit; it takes effect on reload. */
export function saveGraphicsQuality(store: GraphicsStore | null, quality: GraphicsQuality): void {
  try {
    store?.setItem(GRAPHICS_KEY, quality)
  } catch {
    // Storage blocked: the setting lasts only as long as the address says it.
  }
}
