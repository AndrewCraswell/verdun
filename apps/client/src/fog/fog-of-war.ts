import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { Scene } from "@babylonjs/core/scene"
import { mapDepth, mapWidth } from "@verdun/map"
import {
  type EntityId,
  isAlive,
  isSheltering,
  type LineOfSight,
  seesThroughSmoke,
  sightReach,
  type Simulation,
  soldierEye,
  soldierIds,
  type Squad
} from "@verdun/sim"
import { FogOfWarPlugin } from "./fog-of-war-plugin.ts"
import { computeViewshed, createFogGrid } from "./viewshed.ts"

/** However dark it is, the viewer sees the ground this far around, in metres: his own trench bay. */
const MIN_GROUND_RANGE = 30

export interface FogOfWarOptions {
  /**
   * The player's squad. The ground shows what its leader (the soldier under control) can see; an enemy shows when any
   * living member can see them. Soldiers of the squad's side are always shown.
   */
  readonly squad: Squad
  /** The ground material to darken where the viewer can't see. */
  readonly groundMaterial: Material
  /** Other materials darkened the same way, such as the props standing on the ground. */
  readonly materials?: readonly Material[]
  /** How far the viewer can see by day, in metres. Night, fog and falling rain or snow shorten it. */
  readonly range?: number
  /** How often sight is recomputed, per second. */
  readonly updatesPerSecond?: number
  /** Whether fog starts on. When off, all ground is lit and every soldier is shown. */
  readonly enabled?: boolean
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
  /** Every plugin darkening a material, the ground's first. */
  readonly plugins: readonly FogOfWarPlugin[]
  /** Whether fog is on. Turning it off lights all ground and shows every soldier. */
  enabled: boolean
}

/**
 * What the player's squad can see: ground the controlled soldier can see stays lit and the rest darkens, and enemies show
 * only while a squad member has a clear sight line to them.
 */
export function createFogOfWar(
  scene: Scene,
  sim: Simulation,
  lineOfSight: LineOfSight,
  { squad, groundMaterial, materials = [], range = 300, updatesPerSecond = 4, enabled = true }: FogOfWarOptions
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
  // One plugin per material, all reading the same visibility texture.
  const settings = { texture, mapWidth: mapWidth(sim.map), mapDepth: mapDepth(sim.map) }
  const plugins = [groundMaterial, ...materials].map((material) => new FogOfWarPlugin(material, settings))
  const [plugin = new FogOfWarPlugin(groundMaterial, settings)] = plugins
  for (const each of plugins) {
    each.darkenUnseen = enabled
  }
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
    // The ground shows as far as the light and weather let the viewer see, but never under a few tens of metres.
    const seen = Math.min(range, Math.max(MIN_GROUND_RANGE, sim.environment.sightRange))
    computeViewshed(sim.map, soldierEye(sim, viewer), seen, grid)
    texture.update(grid.values)

    const spotters = squad.members.filter((member) => isAlive(sim, member)).map((member) => soldierEye(sim, member))
    for (const soldier of soldierIds(sim)) {
      // Men down a dugout can't be seen.
      if (sim.soldiers.side.value[soldier] === squad.side || isSheltering(sim, soldier)) {
        continue
      }
      // As the simulation decides sight: by the light on him, a flare overhead or his muzzle flash, through the weather.
      const head = soldierEye(sim, soldier)
      const reach = Math.min(range, sightReach(sim, soldier))
      const spotted = spotters.some(
        (eye) =>
          (head.x - eye.x) ** 2 + (head.z - eye.z) ** 2 <= reach * reach &&
          lineOfSight.isClear(eye, head) &&
          seesThroughSmoke(sim, eye, head)
      )
      if (spotted) {
        visibleEnemies.add(soldier)
      }
    }
  }

  return {
    visibleEnemies,
    plugin,
    plugins,
    get enabled() {
      return plugin.darkenUnseen
    },
    set enabled(value) {
      for (const each of plugins) {
        each.darkenUnseen = value
      }
      // Redraw soldiers on the next update either way.
      sinceUpdate = interval
    },
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
      return !plugin.darkenUnseen || sim.soldiers.side.value[soldier] === squad.side || visibleEnemies.has(soldier)
    }
  }
}
