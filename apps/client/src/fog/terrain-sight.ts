import { type BattlefieldMap, heightAt } from "@verdun/map"
import type { LineOfSight } from "@verdun/sim"
import { sceneryTopAt } from "./viewshed.ts"

/** Sight lines are walked this often along their length, in metres: the map's own sample spacing. */
const STEP = 0.5
/** They stop this short of their target, as the simulation's do, so a man lying down isn't hidden by the ground under him. */
const TARGET_CLEARANCE = 0.1

/**
 * Sight lines for the page, without physics: a line is clear when it passes above the ground and above the tops of the
 * scenery's footprints (the same heights the simulation's sight shapes give them) all along its length. The page asks
 * only light questions (where the player's aim falls, whether a sound comes muffled through the ground); the battle's
 * own sight, and the fog of war, are worked out in the simulation's worker with its physics. It reads the map as it is,
 * craters and all, so there is nothing to rebuild.
 */
export function createTerrainSight(map: BattlefieldMap): LineOfSight {
  // The scenery's tops, looked up once rather than at every half-metre step of every sight line.
  const topAt = sceneryTopAt(map)
  return {
    isClear(from, to) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const dz = to.z - from.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (distance <= TARGET_CLEARANCE) {
        return true
      }
      const reach = (distance - TARGET_CLEARANCE) / distance
      const steps = Math.ceil((distance - TARGET_CLEARANCE) / STEP)
      for (let step = 1; step <= steps; step++) {
        const along = (step / steps) * reach
        const x = from.x + dx * along
        const y = from.y + dy * along
        const z = from.z + dz * along
        if (y < heightAt(map, x, z) || y < topAt(x, z)) {
          return false
        }
      }
      return true
    },
    rebuildRegion() {
      // The heights are read as they are: craters need no rebuilding.
      return 1
    },
    setSightHeight() {
      // Ruins brought down stand at their old height here: the page's questions are light, and the worker knows better.
    },
    dispose() {
      // Nothing held.
    }
  }
}
