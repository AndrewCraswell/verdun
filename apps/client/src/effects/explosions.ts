import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import type { Scene } from "@babylonjs/core/scene"
import { type BurstEvent, Shell } from "@verdun/sim"

/** How long the flash lasts, and how long smoke and dust hang in the air, in seconds. */
const FLASH_SECONDS = 0.2
const SMOKE_SECONDS = { ground: 9, air: 6 } as const
const MAX_PUFFS = 2048
/**
 * Burst sizes in metres, from photographs and film of the Western Front: a field gun's high explosive throws a column of
 * earth about 10 m high, a heavy howitzer's 20-30 m; shrapnel bursts in the air as a white ball a few metres across.
 */
const FIELD_COLUMN = { puffs: 4, radius: 3.2, step: 1.9 } as const
const HEAVY_SCALE = 2.2
/** A grenade throws up a puff of smoke and earth a couple of metres high. */
const GRENADE_SCALE = 0.4
const AIRBURST_RADIUS = 3.5

interface Puff {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Final radius, metres. */
  readonly size: number
  /** Metres per second the puff rises. */
  readonly rise: number
  readonly lifetime: number
  age: number
}

export interface Explosions {
  readonly flashes: Mesh
  /** Earth and smoke thrown up by ground bursts. */
  readonly smoke: Mesh
  /** Shrapnel's white airburst puffs. */
  readonly airbursts: Mesh
  /** Adds the flash and smoke for shells that landed in the last simulation steps. */
  add(bursts: readonly BurstEvent[]): void
  /** Ages and redraws the effects. Call once per frame. */
  update(frameSeconds: number): void
}

function writeSphere(matrices: Float32Array, offset: number, x: number, y: number, z: number, radius: number): void {
  matrices.fill(0, offset, offset + 16)
  matrices[offset] = radius
  matrices[offset + 5] = radius
  matrices[offset + 10] = radius
  matrices[offset + 12] = x
  matrices[offset + 13] = y
  matrices[offset + 14] = z
  matrices[offset + 15] = 1
}

/** Spheres drawn as thin instances, scaled to fade (greybox stand-in until proper particle effects). */
function instancedSpheres(scene: Scene, name: string, color: Color3, glowing: boolean): Mesh {
  const mesh = CreateSphere(name, { diameter: 2, segments: 8 }, scene)
  const material = new StandardMaterial(name, scene)
  if (glowing) {
    material.emissiveColor = color
    material.disableLighting = true
  } else {
    material.diffuseColor = color
    // Smoke is lit by the sky as much as the sun, so its shadowed side never goes black.
    material.emissiveColor = color.scale(0.45)
    material.specularColor = Color3.Black()
  }
  mesh.material = material
  mesh.isPickable = false
  mesh.alwaysSelectAsActiveMesh = true
  mesh.thinInstanceCount = 0
  return mesh
}

/**
 * Shell bursts: a bright flash, then for ground bursts a column of dirt and smoke that rises, swells and thins, and for
 * shrapnel a grey puff hanging in the air where it burst.
 */
export function createExplosions(scene: Scene): Explosions {
  const flashes = instancedSpheres(scene, "shell-flashes", new Color3(1, 0.8, 0.45), true)
  const smoke = instancedSpheres(scene, "shell-smoke", new Color3(0.5, 0.46, 0.4), false)
  const airbursts = instancedSpheres(scene, "shell-airbursts", new Color3(0.86, 0.85, 0.82), false)
  let flashList: Puff[] = []
  let puffs: Puff[] = []
  let airPuffs: Puff[] = []
  const flashMatrices = new Float32Array(MAX_PUFFS * 16)
  const smokeMatrices = new Float32Array(MAX_PUFFS * 16)
  const airMatrices = new Float32Array(MAX_PUFFS * 16)

  function drawPuffs(mesh: Mesh, matrices: Float32Array, list: readonly Puff[]): void {
    list.forEach((puff, index) => {
      const progress = puff.age / puff.lifetime
      // Swell quickly, then thin away.
      const radius = puff.size * Math.min(1, progress * 6) * (1 - progress)
      writeSphere(matrices, index * 16, puff.x, puff.y + puff.rise * puff.age, puff.z, radius)
    })
    mesh.thinInstanceSetBuffer("matrix", matrices, 16, false)
    mesh.thinInstanceCount = list.length
  }

  return {
    flashes,
    smoke,
    airbursts,
    add(bursts) {
      for (const burst of bursts) {
        const { x, y, z } = burst.at
        const heavy = burst.shell === Shell.HeavyHighExplosive
        const air = burst.shell === Shell.FieldShrapnel
        const grenade = burst.shell === Shell.Grenade
        let scale = 1
        if (heavy) {
          scale = HEAVY_SCALE
        } else if (grenade) {
          scale = GRENADE_SCALE
        }
        flashList.push({ x, y, z, size: 3 * scale, rise: 0, lifetime: FLASH_SECONDS, age: 0 })
        if (air) {
          airPuffs.push({ x, y, z, size: AIRBURST_RADIUS, rise: 0.3, lifetime: SMOKE_SECONDS.air, age: 0 })
        } else {
          // A column: earth thrown up, smoke above it, the top drifting higher.
          for (let level = 0; level < FIELD_COLUMN.puffs; level++) {
            puffs.push({
              x,
              y: y + level * FIELD_COLUMN.step * scale,
              z,
              size: (FIELD_COLUMN.radius - level * 0.45) * scale,
              rise: 0.5 + level * 0.25,
              lifetime: SMOKE_SECONDS.ground,
              age: 0
            })
          }
        }
      }
      flashList = flashList.slice(-MAX_PUFFS)
      puffs = puffs.slice(-MAX_PUFFS)
      airPuffs = airPuffs.slice(-MAX_PUFFS)
    },
    update(frameSeconds) {
      flashList = flashList.filter((flash) => (flash.age += frameSeconds) < flash.lifetime)
      puffs = puffs.filter((puff) => (puff.age += frameSeconds) < puff.lifetime)
      airPuffs = airPuffs.filter((puff) => (puff.age += frameSeconds) < puff.lifetime)
      flashList.forEach((flash, index) =>
        writeSphere(flashMatrices, index * 16, flash.x, flash.y, flash.z, flash.size * (1 - flash.age / flash.lifetime))
      )
      flashes.thinInstanceSetBuffer("matrix", flashMatrices, 16, false)
      flashes.thinInstanceCount = flashList.length
      drawPuffs(smoke, smokeMatrices, puffs)
      drawPuffs(airbursts, airMatrices, airPuffs)
    }
  }
}
