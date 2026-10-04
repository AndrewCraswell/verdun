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
  type Squad,
  type WorldPoint
} from "@verdun/sim"
import { FogOfWarPlugin } from "./fog-of-war-plugin.ts"
import { createFogGrid, startViewshed, type ViewshedJob } from "./viewshed.ts"

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
  /**
   * How many frames each recomputation is spread over, so none of them takes it all: the ground's rays and the enemies'
   * sight lines a share at a time.
   */
  readonly framesPerUpdate?: number
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
  {
    squad,
    groundMaterial,
    materials = [],
    range = 300,
    updatesPerSecond = 4,
    framesPerUpdate = 4,
    enabled = true
  }: FogOfWarOptions
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
  // Soldiers need redrawing on the next update, as after fog is turned on or off.
  let redraw = false
  // The recomputation under way, spread over frames, or null between them.
  let cycle: {
    job: ViewshedJob | null
    spotters: WorldPoint[]
    enemies: readonly EntityId[]
    next: number
  } | null = null

  function begin(): void {
    const viewer = squad.leader
    let job: ViewshedJob | null = null
    if (viewer < 0) {
      grid.values.fill(0)
      texture.update(grid.values)
    } else {
      // The ground shows as far as the light and weather let the viewer see, but never under a few tens of metres.
      const seen = Math.min(range, Math.max(MIN_GROUND_RANGE, sim.environment.sightRange))
      job = startViewshed(sim.map, soldierEye(sim, viewer), seen, grid)
    }
    const spotters = squad.members.filter((member) => isAlive(sim, member)).map((member) => soldierEye(sim, member))
    // Men down a dugout can't be seen.
    const enemies =
      viewer < 0
        ? []
        : soldierIds(sim).filter(
            (soldier) => sim.soldiers.side.value[soldier] !== squad.side && !isSheltering(sim, soldier)
          )
    cycle = { job, spotters, enemies, next: 0 }
  }

  function spotted(soldier: EntityId, spotters: readonly WorldPoint[]): boolean {
    // As the simulation decides sight: by the light on him, a flare overhead or his muzzle flash, through the weather.
    const head = soldierEye(sim, soldier)
    const reach = Math.min(range, sightReach(sim, soldier))
    return spotters.some(
      (eye) =>
        (head.x - eye.x) ** 2 + (head.z - eye.z) ** 2 <= reach * reach &&
        lineOfSight.isClear(eye, head) &&
        seesThroughSmoke(sim, eye, head)
    )
  }

  /** Does this frame's share of the recomputation. Returns whether it finished, or any enemy came or went from sight. */
  function advance(): boolean {
    if (!cycle) {
      return false
    }
    let changed = false
    if (cycle.job?.advance(Math.ceil(cycle.job.rays / framesPerUpdate))) {
      texture.update(grid.values)
      cycle.job = null
    }
    const until = Math.min(cycle.enemies.length, cycle.next + Math.ceil(cycle.enemies.length / framesPerUpdate))
    for (; cycle.next < until; cycle.next++) {
      const soldier = cycle.enemies[cycle.next] ?? -1
      if (spotted(soldier, cycle.spotters)) {
        changed = !visibleEnemies.has(soldier) || changed
        visibleEnemies.add(soldier)
      } else {
        changed = visibleEnemies.delete(soldier) || changed
      }
    }
    if (cycle.job === null && cycle.next >= cycle.enemies.length) {
      // Whoever wasn't looked at this time round has fallen, been taken or gone down a dugout.
      const looked = new Set(cycle.enemies)
      for (const soldier of visibleEnemies) {
        if (!looked.has(soldier)) {
          visibleEnemies.delete(soldier)
          changed = true
        }
      }
      cycle = null
      return true
    }
    return changed
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
      // Redraw soldiers on the next update either way, and look again at once when it's back on.
      redraw = true
      sinceUpdate = interval
      cycle = null
    },
    update(frameSeconds) {
      if (!plugin.darkenUnseen) {
        // Fog is off: everyone is shown and nothing need be worked out.
        const changed = redraw
        redraw = false
        return changed
      }
      sinceUpdate += frameSeconds
      if (!cycle && sinceUpdate >= interval) {
        sinceUpdate = 0
        begin()
      }
      const changed = advance() || redraw
      redraw = false
      return changed
    },
    isShown(soldier) {
      return !plugin.darkenUnseen || sim.soldiers.side.value[soldier] === squad.side || visibleEnemies.has(soldier)
    }
  }
}
