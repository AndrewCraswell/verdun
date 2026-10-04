import type { AssetContainer } from "@babylonjs/core/assetContainer"
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader"
import type { Material } from "@babylonjs/core/Materials/material"
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import type { Scene } from "@babylonjs/core/scene"
import type { GroundLayers } from "../terrain/ground-splat-plugin.ts"
import { AMBIENCE_FILES, type AmbienceAudio } from "./ambience.ts"
import type { EffectSprites } from "./atmosphere.ts"
import { type KitFiles, openKitFiles } from "./kit-files.ts"

export interface LevelKit {
  /** Kit meshes by piece name, baked in place and disabled: the sources every prop is instanced from. */
  readonly pieces: ReadonlyMap<string, Mesh>
  /** The kit's materials, for effects layered on every prop such as fog of war. */
  readonly materials: readonly Material[]
  /** The ground textures for the terrain splat material. */
  readonly ground: GroundLayers
  /** Smoke and mist sprites. */
  readonly fx: EffectSprites
  /** Ambience, or null when this kit was built without it. */
  readonly audio: AmbienceAudio | null
}

/** Reads the kit's ambience, all of it or none. */
async function loadAudio(files: KitFiles): Promise<AmbienceAudio | null> {
  try {
    const read = (name: (typeof AMBIENCE_FILES)[number]) => files.read(`audio/${name}.ogg`)
    const [noMansLand, wood, rear, ruins, guns1, guns2] = await Promise.all([
      read("no-mans-land"),
      read("wood"),
      read("rear"),
      read("ruins"),
      read("guns-far-1"),
      read("guns-far-2")
    ])
    return { "no-mans-land": noMansLand, wood, rear, ruins, "guns-far-1": guns1, "guns-far-2": guns2 }
  } catch {
    return null
  }
}

const WATER_MATERIAL = "Crater_Water"

/** The kit build adds a decimated copy of each heavy piece under this suffix, drawn beyond `FAR_DISTANCE`. */
const FAR_SUFFIX = "_LOD1"
const FAR_DISTANCE = 110

/** glTF splits a mesh with several materials into one primitive each, named after the mesh. */
const PRIMITIVE_SUFFIX = /_primitive\d+$/

async function loadTexture(scene: Scene, files: KitFiles, path: string, linear = false): Promise<Texture> {
  const url = URL.createObjectURL(new Blob([await files.read(path)], { type: "image/png" }))
  return new Promise<Texture>((resolve, reject) => {
    const texture: Texture = new Texture(url, scene, {
      forcedExtension: ".png",
      onLoad: () => resolve(texture),
      onError: (message) => reject(new Error(`${path}: ${message ?? "failed to load"}`))
    })
    texture.name = path
    // Normal maps hold directions, not colours.
    texture.gammaSpace = !linear
    texture.anisotropicFilteringLevel = 8
  }).finally(() => URL.revokeObjectURL(url))
}

/** Checks by class name, so the PBR material code stays in the lazily loaded glTF loader's chunk. */
function isPbrMaterial(material: Material): material is PBRMaterial {
  return material.getClassName() === "PBRMaterial"
}

/** Matte flat colour from the palette texture, lit like the terrain: Synty art has no use for PBR. */
function toMatte(scene: Scene, source: Material): Material {
  if (!isPbrMaterial(source)) {
    return source
  }
  const material = new StandardMaterial(source.name, scene)
  material.diffuseTexture = source.albedoTexture
  material.diffuseColor = source.albedoTexture ? Color3.White() : source.albedoColor
  material.alpha = source.alpha
  material.specularColor = Color3.Black()
  material.backFaceCulling = false
  if (source.name.startsWith(WATER_MATERIAL)) {
    // Standing water in shell holes: thick with mud, catching a little of the sky.
    material.diffuseColor = Color3.FromHexString("#2b2620")
    material.alpha = 0.9
    material.specularColor = new Color3(0.3, 0.3, 0.3)
    material.specularPower = 96
  }
  source.albedoTexture = null
  source.dispose()
  return material
}

/**
 * Readies a loaded kit's meshes as instancing sources: matte materials, transforms baked into the vertices, each
 * piece's primitives merged back into one mesh named after it, and every source disabled until something places it.
 */
export function prepareKitPieces(
  scene: Scene,
  container: AssetContainer
): {
  pieces: Map<string, Mesh>
  materials: Material[]
} {
  // Disposing a material detaches it from its meshes and its container, so note who used which first.
  const meshes = container.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0)
  const used = meshes.map((mesh) => mesh.material)
  const matte = new Map([...container.materials].map((material) => [material, toMatte(scene, material)]))
  const parts = new Map<string, Mesh[]>()
  for (const [index, mesh] of meshes.entries()) {
    const material = used[index]
    mesh.material = material ? (matte.get(material) ?? material) : null
    // Bake the glTF root's handedness conversion and the node transform into the vertices.
    mesh.setParent(null)
    mesh.bakeCurrentTransformIntoVertices()
    const piece = mesh.name.replace(PRIMITIVE_SUFFIX, "")
    parts.set(piece, [...(parts.get(piece) ?? []), mesh])
  }
  const pieces = new Map<string, Mesh>()
  for (const [piece, primitives] of parts) {
    const mesh =
      primitives.length === 1 ? primitives[0] : Mesh.MergeMeshes(primitives, true, true, undefined, false, true)
    if (mesh) {
      mesh.name = piece
      mesh.setEnabled(false)
      mesh.isPickable = false
      pieces.set(piece, mesh)
    }
  }
  // Far copies become their piece's distance level of detail rather than pieces of their own.
  for (const [name, far] of pieces) {
    const near = name.endsWith(FAR_SUFFIX) ? pieces.get(name.slice(0, -FAR_SUFFIX.length)) : undefined
    if (near) {
      near.addLODLevel(FAR_DISTANCE, far)
      pieces.delete(name)
    }
  }
  // Disposing removes a node from the container's list, so walk copies of the lists.
  for (const node of container.transformNodes.slice()) {
    node.dispose()
  }
  for (const mesh of container.meshes.slice()) {
    if (mesh.getTotalVertices() === 0) {
      mesh.dispose()
    }
  }
  return { pieces, materials: [...matte.values()] }
}

/**
 * Loads the level kit, or resolves null when it isn't available: production builds until the encrypted asset pack
 * exists, and checkouts that haven't run the kit build. The game then stays greybox.
 */
export async function loadLevelKit(scene: Scene, files: KitFiles | null = openKitFiles()): Promise<LevelKit | null> {
  if (!files) {
    return null
  }
  try {
    await import("@babylonjs/loaders/glTF/2.0/glTFLoader")
    const layer = async (name: string) => ({
      albedo: await loadTexture(scene, files, `ground/${name}.png`),
      normal: await loadTexture(scene, files, `ground/${name}_normal.png`, true)
    })
    const [container, grass, mud, chalk, churned, smoke, mist, audio] = await Promise.all([
      files
        .read("kit.glb")
        .then((glb) => LoadAssetContainerAsync(new Uint8Array(glb), scene, { pluginExtension: ".glb" })),
      layer("grass"),
      layer("mud"),
      layer("chalk"),
      layer("churned"),
      loadTexture(scene, files, "fx/smoke.png"),
      loadTexture(scene, files, "fx/mist.png"),
      loadAudio(files)
    ])
    files.close?.()
    container.addAllToScene()
    return { ...prepareKitPieces(scene, container), ground: { grass, mud, chalk, churned }, fx: { smoke, mist }, audio }
  } catch (error) {
    files.close?.()
    console.warn(
      "Level kit not available, so the battlefield stays greybox. Build it with scripts/build-level-kit.py.",
      error
    )
    return null
  }
}
