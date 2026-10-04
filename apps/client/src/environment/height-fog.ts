import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector4 } from "@babylonjs/core/Maths/math.vector"
import type { Weather } from "@verdun/sim"

/**
 * Fog that lies low, as real fog does: thickest at the base height and thinning exponentially above it, so ravines and
 * valleys fill, ridges and tree tops stand out of it, and a camera high above a fog bank looks down through only its
 * thin top. Babylon's own fog thickens with distance from the camera alone, which from above makes it flat.
 *
 * Density at a height y is `density × exp(−falloff × (y − base))` per metre. The light reaching the eye from a point
 * through it is `exp(−∫ density ds)` along the ray, which has a closed form (`heightFogTransmittance`), the same in both
 * shader languages, shared by the ground and props (weather-surface-plugin.ts) and the particles (level/soft-particles.ts).
 */
export interface HeightFog {
  /** Extinction at the base height, per metre: 3.912 / visibility there (Koschmieder, 2% contrast). */
  density: number
  /** How fast the fog thins with height, per metre: 1 / its scale height. */
  falloff: number
  /** The height the fog lies on, in metres: the low ground of the map. */
  base: number
  /** The haze's colour, as the scene's fog colour. */
  readonly color: Color3
}

/** A thick radiation fog lies this deep, in metres, its scale height; a haze or rain fills the air this high. */
const SCALE_HEIGHT = { fog: 40, haze: 600 } as const

/** The fog's density and how fast it thins, from the weather: thin, low layers in fog; deep, even air in haze and rain. */
export function heightFogFor(weather: Pick<Weather, "visibility" | "precipitation">): {
  density: number
  falloff: number
} {
  const visibility = Math.max(30, weather.visibility)
  // From fog (1 km and under) to clear haze (5 km and over), on a log scale; falling rain or snow fills the air evenly.
  const foggy = Math.min(1, Math.max(0, Math.log(5000 / visibility) / Math.log(5)))
  const layered = weather.precipitation > 0.3 ? 0 : foggy
  const scale = Math.exp(
    Math.log(SCALE_HEIGHT.haze) + (Math.log(SCALE_HEIGHT.fog) - Math.log(SCALE_HEIGHT.haze)) * layered
  )
  return { density: 3.912 / visibility, falloff: 1 / scale }
}

/** The fog as a shader's `vec4`: (density, falloff, base, 0). */
export function heightFogVector(fog: HeightFog, into = new Vector4()): Vector4 {
  return into.set(fog.density, fog.falloff, fog.base, 0)
}

/**
 * `float heightFogTransmittance(vec3 eye, vec3 point, vec4 fog)`: the share of light from `point` that reaches `eye`
 * through the fog, from 0 (hidden) to 1 (clear). Mix as `mix(fogColour, colour, transmittance)`.
 */
export const HEIGHT_FOG_GLSL = `
float heightFogTransmittance(vec3 eye, vec3 point, vec4 fog) {
  vec3 ray = point - eye;
  float rise = clamp(fog.y * ray.y, -60.0, 60.0);
  float along = abs(rise) > 1e-4 ? (1.0 - exp(-rise)) / rise : 1.0 - 0.5 * rise;
  float depth = fog.x * exp(-fog.y * (eye.y - fog.z)) * length(ray) * along;
  return exp(-max(depth, 0.0));
}
`

/** The same in WGSL. */
export const HEIGHT_FOG_WGSL = `
fn heightFogTransmittance(eye: vec3f, point: vec3f, fog: vec4f) -> f32 {
  let ray: vec3f = point - eye;
  let rise: f32 = clamp(fog.y * ray.y, -60.0, 60.0);
  var along: f32 = 1.0 - 0.5 * rise;
  if (abs(rise) > 1e-4) {
    along = (1.0 - exp(-rise)) / rise;
  }
  let depth: f32 = fog.x * exp(-fog.y * (eye.y - fog.z)) * length(ray) * along;
  return exp(-max(depth, 0.0));
}
`

/** The same on the CPU, for tests and for anything that needs the fog's answer outside a shader. */
export function heightFogTransmittance(
  eye: { readonly x: number; readonly y: number; readonly z: number },
  point: { readonly x: number; readonly y: number; readonly z: number },
  fog: Pick<HeightFog, "density" | "falloff" | "base">
): number {
  const ray = { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z }
  const rise = Math.min(60, Math.max(-60, fog.falloff * ray.y))
  const along = Math.abs(rise) > 1e-4 ? (1 - Math.exp(-rise)) / rise : 1 - 0.5 * rise
  const length = Math.sqrt(ray.x * ray.x + ray.y * ray.y + ray.z * ray.z)
  const depth = fog.density * Math.exp(-fog.falloff * (eye.y - fog.base)) * length * along
  return Math.exp(-Math.max(depth, 0))
}

/** A fresh fog, clear until the environment view sets it each frame. */
export function createHeightFog(base: number): HeightFog {
  return { density: 0, falloff: 1 / SCALE_HEIGHT.haze, base, color: new Color3(0.56, 0.58, 0.56) }
}
