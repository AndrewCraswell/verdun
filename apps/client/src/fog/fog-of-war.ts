import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { Scene } from "@babylonjs/core/scene"
import { mapDepth, mapWidth } from "@verdun/map"
import type { EntityId, LineOfSight, Simulation, Squad } from "@verdun/sim"
import { FogOfWarPlugin } from "./fog-of-war-plugin.ts"
import { createSightModel } from "./sight-model.ts"
import { createFogGrid } from "./viewshed.ts"

/** What the squad can see, worked out elsewhere (the simulation's worker) and sent: the ground's cells, and who's in sight. */
export interface SightFeed {
  /** The latest look, once: null when there's nothing new since the last call. */
  take(): { readonly ground: Uint8Array; readonly enemies: Int32Array } | null
  /** Whether the fog is shown, and so wants looks: none are worked out while it isn't, and one at once when it's back. */
  watch?(on: boolean): void
}

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
  /** Recomputes sight when it's due, or takes what was sent. Returns true when it changed, so soldiers need redrawing. */
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
 * only while a squad member has a clear sight line to them. Worked out here from `sight` (sight lines), a few times a
 * second and spread over frames; or, given a feed, worked out beside the simulation in its worker and only drawn here.
 */
export function createFogOfWar(
  scene: Scene,
  sim: Simulation,
  sight: LineOfSight | SightFeed,
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
  const fed = "take" in sight ? sight : null
  const model = "take" in sight ? null : createSightModel(sim, sight, squad, range)
  const grid = model?.grid ?? createFogGrid(sim.map)
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
  fed?.watch?.(enabled)
  // Turned on with a feed, the fog waits for a fresh look before darkening anything: the last one may be minutes old.
  let awaitingLook = false
  const darken = (value: boolean) => {
    for (const each of plugins) {
      each.darkenUnseen = value
    }
  }
  const fedEnemies = new Set<EntityId>()
  const visibleEnemies: ReadonlySet<EntityId> = model?.visibleEnemies ?? fedEnemies
  const interval = 1 / updatesPerSecond
  let sinceUpdate = interval
  // Soldiers need redrawing on the next update, as after fog is turned on or off.
  let redraw = false

  /**
   * Takes the latest look sent, if any. Returns whether any enemy came into or went out of sight, or null when nothing
   * new came.
   */
  function takeFed(feed: SightFeed): boolean | null {
    const look = feed.take()
    if (!look) {
      return null
    }
    grid.values.set(look.ground)
    texture.update(grid.values)
    const now = new Set(look.enemies)
    const changed = now.size !== fedEnemies.size || [...now].some((soldier) => !fedEnemies.has(soldier))
    fedEnemies.clear()
    for (const soldier of now) {
      fedEnemies.add(soldier)
    }
    return changed
  }

  /** This frame's share of the look worked out here. */
  function look(frameSeconds: number): boolean {
    if (!model) {
      return false
    }
    sinceUpdate += frameSeconds
    if (!model.looking && sinceUpdate >= interval) {
      sinceUpdate = 0
      model.begin()
    }
    const { finished, groundDone, changed } = model.advance(framesPerUpdate)
    if (groundDone) {
      texture.update(grid.values)
    }
    return finished || changed
  }

  return {
    visibleEnemies,
    plugin,
    plugins,
    get enabled() {
      return plugin.darkenUnseen || awaitingLook
    },
    set enabled(value) {
      fed?.watch?.(value)
      if (fed && value && !plugin.darkenUnseen) {
        awaitingLook = true
      } else {
        awaitingLook = false
        darken(value)
      }
      // Redraw soldiers on the next update either way, and look again at once when it's back on.
      redraw = true
      sinceUpdate = interval
    },
    update(frameSeconds) {
      // With fog off nothing is sent, nor taken: no grid to copy, no texture to upload.
      const taken = fed && (plugin.darkenUnseen || awaitingLook) ? takeFed(fed) : null
      if (awaitingLook && taken !== null) {
        awaitingLook = false
        darken(true)
        redraw = true
      }
      const fedChanged = taken === true
      if (!plugin.darkenUnseen) {
        // Fog is off: everyone is shown and nothing need be worked out.
        const changed = redraw
        redraw = false
        return changed
      }
      const changed = fedChanged || look(frameSeconds) || redraw
      redraw = false
      return changed
    },
    isShown(soldier) {
      return !plugin.darkenUnseen || sim.soldiers.side.value[soldier] === squad.side || visibleEnemies.has(soldier)
    }
  }
}
