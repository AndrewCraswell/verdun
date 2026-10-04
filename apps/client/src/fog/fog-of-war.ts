import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { Scene } from "@babylonjs/core/scene"
import { mapDepth, mapWidth } from "@verdun/map"
import { type EntityId, eyeAt, type LineOfSight, type Side, type Simulation, soldierIds } from "@verdun/sim"
import { FogOfWarPlugin } from "./fog-of-war-plugin.ts"
import { computeViewshed, createFogGrid } from "./viewshed.ts"

export interface FogOfWarOptions {
  /** The soldier whose eyes the player sees through. */
  readonly viewer: EntityId
  /** The player's side: its soldiers are always shown. */
  readonly side: Side
  /** The ground material to darken where the viewer can't see. */
  readonly groundMaterial: Material
  /** How far the viewer can see, in metres. */
  readonly range?: number
  /** How often sight is recomputed, per second. */
  readonly updatesPerSecond?: number
}

export interface FogOfWar {
  /** Recomputes sight when it's due. Returns true when it changed, so soldiers need redrawing. */
  update(frameSeconds: number): boolean
  /** Whether a soldier should be drawn: always for the player's side, for enemies only when in sight. */
  isShown(soldier: EntityId): boolean
  /** Enemy soldiers currently in sight. */
  readonly visibleEnemies: ReadonlySet<EntityId>
  /** The plugin darkening the ground material. */
  readonly plugin: FogOfWarPlugin
}

/**
 * What the player's soldier can see: the ground they can see stays lit and the rest darkens, and enemies show only when
 * a sight line from the viewer's eye to theirs is clear.
 */
export function createFogOfWar(
  scene: Scene,
  sim: Simulation,
  lineOfSight: LineOfSight,
  { viewer, side, groundMaterial, range = 300, updatesPerSecond = 4 }: FogOfWarOptions
): FogOfWar {
  const grid = createFogGrid(sim.map)
  const texture = new RawTexture(
    grid.values,
    grid.columns,
    grid.rows,
    Constants.TEXTUREFORMAT_R,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE
  )
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  const plugin = new FogOfWarPlugin(groundMaterial, {
    texture,
    mapWidth: mapWidth(sim.map),
    mapDepth: mapDepth(sim.map)
  })

  const visibleEnemies = new Set<EntityId>()
  const interval = 1 / updatesPerSecond
  let sinceUpdate = interval

  function recompute(): void {
    const eye = eyeAt(sim.map, sim.soldiers.position.x[viewer], sim.soldiers.position.z[viewer])
    computeViewshed(sim.map, eye, range, grid)
    texture.update(grid.values)

    visibleEnemies.clear()
    const rangeSquared = range * range
    for (const soldier of soldierIds(sim)) {
      if (sim.soldiers.side.value[soldier] === side) {
        continue
      }
      const head = eyeAt(sim.map, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])
      const distanceSquared = (head.x - eye.x) ** 2 + (head.z - eye.z) ** 2
      if (distanceSquared <= rangeSquared && lineOfSight.isClear(eye, head)) {
        visibleEnemies.add(soldier)
      }
    }
  }

  return {
    visibleEnemies,
    plugin,
    update(frameSeconds) {
      sinceUpdate += frameSeconds
      if (sinceUpdate < interval) {
        return false
      }
      sinceUpdate = 0
      recompute()
      return true
    },
    isShown(soldier) {
      return sim.soldiers.side.value[soldier] === side || visibleEnemies.has(soldier)
    }
  }
}
