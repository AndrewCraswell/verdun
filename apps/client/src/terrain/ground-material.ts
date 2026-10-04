import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import type { Scene } from "@babylonjs/core/scene"
import { type SplatLayers, TerrainSplatPlugin } from "./terrain-splat-plugin.ts"

/** CC0 ground textures from Poly Haven, served from `public/textures/ground/`. See docs/assets/register.md. */
const GROUND_TEXTURES = {
  grass: "grass_ground.jpg",
  mud: "muddy_tracks.jpg",
  chalk: "rock_ground_02.jpg",
  churned: "burned_ground_01.jpg"
} as const

/** Loads the four ground layers. Anisotropic filtering keeps them sharp at the camera's low viewing angle. */
export function loadGroundLayers(scene: Scene, baseUrl = `${import.meta.env.BASE_URL}textures/ground/`): SplatLayers {
  const load = (file: string) => {
    const texture = new Texture(`${baseUrl}${file}`, scene)
    texture.anisotropicFilteringLevel = 8
    return texture
  }
  return {
    grass: load(GROUND_TEXTURES.grass),
    mud: load(GROUND_TEXTURES.mud),
    chalk: load(GROUND_TEXTURES.chalk),
    churned: load(GROUND_TEXTURES.churned)
  }
}

export interface GroundMaterial {
  readonly material: StandardMaterial
  /** The splat plugin attached to the material, for tuning tiling and tints. */
  readonly splat: TerrainSplatPlugin
}

/** Matte ground: textures splatted by surface, lit and fogged like everything else. */
export function createGroundMaterial(scene: Scene, layers: SplatLayers): GroundMaterial {
  const material = new StandardMaterial("ground", scene)
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  const splat = new TerrainSplatPlugin(material, layers)
  return { material, splat }
}
