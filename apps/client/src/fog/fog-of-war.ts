import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { Scene } from "@babylonjs/core/scene"
import { mapDepth, mapWidth } from "@verdun/map"
import { type EntityId, eyeAt, isAlive, type LineOfSight, type Simulation, soldierIds, type Squad } from "@verdun/sim"
import { FogOfWarPlugin } from "./fog-of-war-plugin.ts"
import { computeViewshed, createFogGrid } from "./viewshed.ts"

export interface FogOfWarOptions {
  /**
   * The player's squad. The ground shows what its leader (the soldier under control) can see; an enemy shows when any
   * living member can see them. Soldiers of the squad's side are always shown.
   */
  readonly squad: Squad
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
 * What the player's squad can see: ground the controlled soldier can see stays lit and the rest darkens, and enemies show
 * only while a squad member has a clear sight line to them.
 */
export function createFogOfWar(
  scene: Scene,
  sim: Simulation,
  lineOfSight: LineOfSight,
  { squad, groundMaterial, range = 300, updatesPerSecond = 4 }: FogOfWarOptions
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
    visibleEnemies.clear()
    const viewer = squad.leader
    if (viewer < 0) {
      grid.values.fill(0)
      texture.update(grid.values)
      return
    }
    computeViewshed(
      sim.map,
      eyeAt(sim.map, sim.soldiers.position.x[viewer], sim.soldiers.position.z[viewer]),
      range,
      grid
    )
    texture.update(grid.values)

    const spotters = squad.members
      .filter((member) => isAlive(sim, member))
      .map((member) => eyeAt(sim.map, sim.soldiers.position.x[member], sim.soldiers.position.z[member]))
    const rangeSquared = range * range
    for (const soldier of soldierIds(sim)) {
      if (sim.soldiers.side.value[soldier] === squad.side) {
        continue
      }
      const head = eyeAt(sim.map, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])
      const spotted = spotters.some(
        (eye) => (head.x - eye.x) ** 2 + (head.z - eye.z) ** 2 <= rangeSquared && lineOfSight.isClear(eye, head)
      )
      if (spotted) {
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
      return sim.soldiers.side.value[soldier] === squad.side || visibleEnemies.has(soldier)
    }
  }
}
