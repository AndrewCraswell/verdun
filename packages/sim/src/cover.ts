import { heightAt, mapDepth, mapWidth } from "@verdun/map"
import { groundVersion } from "./navigation.ts"
import type { Simulation } from "./simulation.ts"
import { wirePace } from "./wire.ts"

/** A hollow is measured against the ground this far around it, in metres: a shell hole's lip, a fold in the ground. */
const RING = 2.5
/** A man looks for cover this far from where he was sent, in metres, a metre at a time. */
const REACH = 3
/** Hollows shallower than this, in metres, are no cover: lying in them, a man is as much in view as on the flat. */
const SHALLOWEST = 0.3
/** Depth counts for no more than this, in metres: a deep crater shelters a man no better than one his own depth. */
const DEEPEST = 1
/** Each metre further from where he was sent costs this much depth: of two holes alike, he takes the nearer. */
const PER_METRE = 0.1
/** A spot within this far of wire, in metres, is in it: a man lying there is caught on it. */
const WIRE_MARGIN = 0.4
/** Wire this intact or worse, as a fraction of walking pace, catches a man. */
const WIRE_SNAG = 0.5
/** At most this many spots are remembered before the store starts afresh. */
const MAX_REMEMBERED = 8192

/** How far a point lies below the ground around it, in metres: a crater's bottom is well below its lip. */
export function hollowDepth(sim: Simulation, x: number, z: number): number {
  let around = 0
  for (let eighth = 0; eighth < 8; eighth++) {
    const angle = (eighth * Math.PI) / 4
    around += heightAt(sim.map, x + Math.cos(angle) * RING, z + Math.sin(angle) * RING)
  }
  return around / 8 - heightAt(sim.map, x, z)
}

function inWire(sim: Simulation, x: number, z: number): boolean {
  const caught = (px: number, pz: number) => wirePace(sim.wire, px, pz) < WIRE_SNAG
  return (
    caught(x, z) ||
    caught(x - WIRE_MARGIN, z) ||
    caught(x + WIRE_MARGIN, z) ||
    caught(x, z - WIRE_MARGIN) ||
    caught(x, z + WIRE_MARGIN)
  )
}

interface Remembered {
  version: number
  readonly spots: Map<number, { x: number; z: number }>
}

const remembered = new WeakMap<Simulation, Remembered>()

/**
 * Where a man sent to a point takes cover: the deepest hollow within a few metres of it (a shell hole, a fold in the
 * ground, a trench), or the point itself where there's none, and never in the wire. Squads waiting behind a barrage
 * or arrived at an advance lie in the craters, as men did, rather than in a line on the open ground between them.
 * Worked out once for each spot, to the metre, until craters or the wire change the ground.
 */
export function coverNear(sim: Simulation, x: number, z: number): { x: number; z: number } {
  const cx = Math.round(x)
  const cz = Math.round(z)
  const version = groundVersion(sim)
  let store = remembered.get(sim)
  if (!store || store.version !== version || store.spots.size > MAX_REMEMBERED) {
    store = { version, spots: new Map() }
    remembered.set(sim, store)
  }
  const key = cx * 65536 + cz
  const known = store.spots.get(key)
  if (known) {
    return known
  }
  const width = mapWidth(sim.map)
  const depth = mapDepth(sim.map)
  let best: { x: number; z: number } | null = null
  let bestScore = -Infinity
  for (let dz = -REACH; dz <= REACH; dz++) {
    for (let dx = -REACH; dx <= REACH; dx++) {
      const distance = Math.sqrt(dx * dx + dz * dz)
      const px = cx + dx
      const pz = cz + dz
      if (distance > REACH || px < 0 || pz < 0 || px > width || pz > depth || inWire(sim, px, pz)) {
        continue
      }
      const hollow = hollowDepth(sim, px, pz)
      const score = (hollow >= SHALLOWEST ? Math.min(DEEPEST, hollow) : 0) - PER_METRE * distance
      if (score > bestScore) {
        bestScore = score
        best = { x: px, z: pz }
      }
    }
  }
  const spot = best ?? { x, z }
  store.spots.set(key, spot)
  return spot
}
