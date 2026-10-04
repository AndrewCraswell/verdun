import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Surface } from "@verdun/map"

/** Muted documentary realism: mud and overcast sky, with uniform colours as the only saturated accents. */
export const palette = {
  sky: new Color4(0.557, 0.576, 0.561, 1),
  fog: new Color3(0.557, 0.576, 0.561),
  skyLight: new Color3(0.86, 0.87, 0.88),
  groundLight: new Color3(0.28, 0.25, 0.21),
  horizonBlue: Color3.FromHexString("#7d93ad"),
  feldgrau: Color3.FromHexString("#6a6f5c")
} as const

/** Ground colours per surface, blended across the terrain until textured materials replace them. */
export const surfaceColors: Readonly<Record<Surface, Color3>> = {
  [Surface.Grass]: new Color3(0.37, 0.38, 0.26),
  [Surface.Mud]: new Color3(0.34, 0.28, 0.21),
  [Surface.Chalk]: new Color3(0.63, 0.61, 0.55),
  [Surface.Churned]: new Color3(0.26, 0.21, 0.16)
}
