import type { Simulation } from "@verdun/sim"

/** A direction on the ground plane, a unit vector. */
interface Heading {
  readonly x: number
  readonly z: number
}

const headings = new WeakMap<Simulation, Heading>()

/**
 * The way the action key acts for the man under the player's control (control/player-control.ts sets it each frame):
 * the way he walks while he's steered, or else the way the camera looks. Not the way he faces, which is where he aims,
 * so a fence he walks up to is climbed whatever he's pointing his rifle at. The HUD's prompt reads it to say the same.
 */
export function noteActionHeading(sim: Simulation, heading: Heading): void {
  headings.set(sim, heading)
}

/** The way the action key acts now, or undefined before the player control has said. */
export function actionHeading(sim: Simulation): Heading | undefined {
  return headings.get(sim)
}
