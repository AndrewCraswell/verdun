import { heightAt } from "@verdun/map"
import type { Simulation } from "./simulation.ts"

/** A hollow is measured against the ground this far around it, in metres: a shell hole's lip, a fold in the ground. */
const RING = 2.5
/** Hollows shallower than this, in metres, are no cover: lying in them, a man is as much in view as on the flat. */
export const SHALLOWEST = 0.3

/** How far a point lies below the ground around it, in metres: a crater's bottom is well below its lip. */
export function hollowDepth(sim: Simulation, x: number, z: number): number {
  let around = 0
  for (let eighth = 0; eighth < 8; eighth++) {
    const angle = (eighth * Math.PI) / 4
    around += heightAt(sim.map, x + Math.cos(angle) * RING, z + Math.sin(angle) * RING)
  }
  return around / 8 - heightAt(sim.map, x, z)
}

/** Whether a man here is in cover: in a hollow deep enough to shelter him, a shell hole or a trench. */
export function inCover(sim: Simulation, x: number, z: number): boolean {
  return hollowDepth(sim, x, z) >= SHALLOWEST
}
