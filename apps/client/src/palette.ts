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

/**
 * Flat ground colours per surface, in the muted version 1 palette: Synty-style flat colour, no photographic textures.
 */
export const surfaceColors: Readonly<Record<Surface, Color3>> = {
  [Surface.Grass]: Color3.FromHexString("#5f6343"),
  [Surface.Mud]: Color3.FromHexString("#574636"),
  [Surface.Chalk]: Color3.FromHexString("#a29c8b"),
  [Surface.Churned]: Color3.FromHexString("#43372b")
}
