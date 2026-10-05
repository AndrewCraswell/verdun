import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import { describe, expect, it } from "vitest"
import { trimCascadeVaryings } from "./cascade-varyings.ts"

describe("trimCascadeVaryings", () => {
  it("declares and reads each cascade's varyings only where the light has that cascade", () => {
    expect(trimCascadeVaryings()).toBe(true)
    // Once only: calling again changes nothing more.
    const vertex = ShaderStore.IncludesShadersStoreWGSL["lightVxUboDeclaration"]
    expect(trimCascadeVaryings()).toBe(true)
    expect(ShaderStore.IncludesShadersStoreWGSL["lightVxUboDeclaration"]).toBe(vertex)

    for (const include of ["lightVxUboDeclaration", "lightUboDeclaration"]) {
      const source = ShaderStore.IncludesShadersStoreWGSL[include] ?? ""
      expect(source).toContain(
        "#if SHADOWCSMNUM_CASCADES{X}>3\nvarying vPositionFromLight{X}_3: vec4f;varying vDepthMetric{X}_3: f32;\n#endif"
      )
      expect(source.match(/#if SHADOWCSMNUM_CASCADES\{X\}>\d/g)).toHaveLength(4)
    }
    expect(ShaderStore.IncludesShadersStoreWGSL["lightFragment"]).toContain(
      "#if SHADOWCSMNUM_CASCADES{X}>2\nvPositionFromLight{X}[2]=fragmentInputs.vPositionFromLight{X}_2;"
    )
  })
})
