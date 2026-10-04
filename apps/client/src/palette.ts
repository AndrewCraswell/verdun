import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"

/** Muted documentary realism: mud and overcast sky, with uniform colours as the only saturated accents. */
export const palette = {
  sky: new Color4(0.557, 0.576, 0.561, 1),
  fog: new Color3(0.557, 0.576, 0.561),
  skyLight: new Color3(0.86, 0.87, 0.88),
  groundLight: new Color3(0.28, 0.25, 0.21),
  horizonBlue: Color3.FromHexString("#7d93ad"),
  feldgrau: Color3.FromHexString("#6a6f5c")
} as const
