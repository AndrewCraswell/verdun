import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import "@babylonjs/core/ShadersWGSL/ShadersInclude/lightFragment"
import "@babylonjs/core/ShadersWGSL/ShadersInclude/lightUboDeclaration"
import "@babylonjs/core/ShadersWGSL/ShadersInclude/lightVxUboDeclaration"

/** Babylon's cascaded shadows allow up to four cascades. */
const MAX_CASCADES = 4

/** Wraps a cascade's code in a test of the light's cascade count, which Babylon's preprocessor resolves per light. */
const forCascade = (cascade: number, code: string) => `\n#if SHADOWCSMNUM_CASCADES{X}>${cascade}\n${code}\n#endif\n`

/** The cascade varyings as Babylon's WGSL declares them. */
const declaration = (cascade: number) =>
  `varying vPositionFromLight{X}_${cascade}: vec4f;varying vDepthMetric{X}_${cascade}: f32;`

/** Where the pixel shader copies them into its arrays: positions first, then depths. */
const positionRead = (cascade: number) =>
  `vPositionFromLight{X}[${cascade}]=fragmentInputs.vPositionFromLight{X}_${cascade};`
const depthRead = (cascade: number) => `vDepthMetric{X}[${cascade}]=fragmentInputs.vDepthMetric{X}_${cascade};`

/** An include with each of `pieces` wrapped in its cascade's test, or null if any is missing. */
function guarded(include: string, pieces: readonly ((cascade: number) => string)[]): string | null {
  let source = ShaderStore.IncludesShadersStoreWGSL[include]
  for (const piecesOf of pieces) {
    for (let cascade = 0; cascade < MAX_CASCADES; cascade++) {
      const piece = piecesOf(cascade)
      if (!source?.includes(piece)) {
        return null
      }
      source = source.replace(piece, forCascade(cascade, piece))
    }
  }
  return source ?? null
}

/** The includes to change, and how. All change or none: a vertex shader and pixel shader that disagree won't compile. */
const INCLUDES: readonly [string, readonly ((cascade: number) => string)[]][] = [
  ["lightVxUboDeclaration", [declaration]],
  ["lightUboDeclaration", [declaration]],
  ["lightFragment", [positionRead, depthRead]]
]

let trimmed: boolean | null = null

/**
 * On WebGPU, Babylon's cascaded shadows pass every receiving vertex's position in light space, and its depth, for four
 * cascades, whatever the light's cascade count, and every pixel reads all four. With the sun's two cascades that's nine
 * interpolated outputs where five do, written by every receiving vertex and interpolated for every receiving pixel:
 * receiving shadows cost the ground about 3.5 ms a frame at 1080p on an integrated GPU however the shadows were
 * filtered. This declares and reads only the cascades a light has. Its WebGL shaders already size them to the count.
 *
 * Call before the first shadow-receiving material compiles. Returns whether Babylon's shaders were as expected and are
 * now trimmed; after a Babylon upgrade changes them, it changes nothing and returns false.
 */
export function trimCascadeVaryings(): boolean {
  if (trimmed === null) {
    const sources = INCLUDES.map(([include, pieces]) => guarded(include, pieces))
    trimmed = sources.every((source) => source !== null)
    if (trimmed) {
      INCLUDES.forEach(([include], index) => {
        ShaderStore.IncludesShadersStoreWGSL[include] = sources[index] ?? ""
      })
    }
  }
  return trimmed
}
