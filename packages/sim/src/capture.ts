import { mapDepth } from "@verdun/map"
import { addComponent, type EntityId, removeComponent } from "bitecs"
import { BROKEN_MORALE, shakeSquad } from "./combat.ts"
import { Side, Stance } from "./components.ts"
import { type Simulation, soldierIds } from "./simulation.ts"

/** Surrenders are considered this often, in steps. */
const CAPTURE_INTERVAL = 5
/** Attackers this close to men down a dugout are at the top of its steps with grenades ready. */
const DUGOUT_CAPTURE_RANGE = 8
/**
 * Chance that men caught down a dugout give up rather than fight their way up the steps. Most did: dugout garrisons
 * were the bulk of the thousands of prisoners a successful Verdun attack took.
 */
const DUGOUT_SURRENDER_CHANCE = 0.75
/** A broken soldier gives up when enemies this close outnumber friends. */
const BROKEN_SURRENDER_RANGE = 15

/** A soldier giving up, for renderers and the battle report. */
export interface CaptureEvent {
  readonly type: "capture"
  readonly soldier: EntityId
}

/**
 * Takes a soldier prisoner: out of the fight for good, and sent back through the captors' lines to the rear. Their
 * squad is shaken as if they had fallen.
 */
export function surrender(sim: Simulation, soldier: EntityId): void {
  const { soldiers } = sim
  addComponent(sim.world, soldier, soldiers.captured)
  removeComponent(sim.world, soldier, soldiers.steer)
  soldiers.target.id[soldier] = -1
  soldiers.stance.value[soldier] = Stance.Standing
  soldiers.suppression.value[soldier] = 0
  // French captors send prisoners south, German captors north.
  const rearZ = soldiers.side.value[soldier] === Side.German ? 0 : mapDepth(sim.map)
  addComponent(sim.world, soldier, soldiers.moveOrder)
  soldiers.moveOrder.x[soldier] = soldiers.position.x[soldier]
  soldiers.moveOrder.z[soldier] = rearZ
  soldiers.moveOrder.run[soldier] = 0
  shakeSquad(sim, soldier)
  sim.events.push({ type: "capture", soldier })
}

function playerControlled(sim: Simulation, soldier: EntityId): boolean {
  const squad = sim.squads[sim.soldiers.squad.id[soldier]]
  return squad?.controller === "player" && squad.leader === soldier
}

/**
 * Who gives up, a few times a second. Men caught down a dugout by attackers at its entrance mostly surrender; the rest
 * come up fighting. Broken soldiers surrender when the enemy close by outnumbers their friends.
 */
export function captureSystem(sim: Simulation): void {
  if (sim.tick % CAPTURE_INTERVAL !== 2) {
    return
  }
  const { position, side, stance, morale, shelter } = sim.soldiers
  const living = Array.from(soldierIds(sim))
  const near = (soldier: EntityId, range: number) => {
    let enemies = 0
    let friends = 0
    for (const other of living) {
      if (other === soldier) {
        continue
      }
      const dx = position.x[other] - position.x[soldier]
      const dz = position.z[other] - position.z[soldier]
      if (dx * dx + dz * dz <= range * range) {
        if (side.value[other] === side.value[soldier]) {
          friends++
        } else {
          enemies++
        }
      }
    }
    return { enemies, friends }
  }

  for (const soldier of living) {
    if (playerControlled(sim, soldier)) {
      continue
    }
    if (stance.value[soldier] === Stance.Sheltering) {
      if (near(soldier, DUGOUT_CAPTURE_RANGE).enemies > 0) {
        if (sim.rng.next() < DUGOUT_SURRENDER_CHANCE) {
          surrender(sim, soldier)
        } else {
          // Up the steps fighting.
          stance.value[soldier] = Stance.Standing
          shelter.emergeAt[soldier] = -1
        }
      }
      continue
    }
    if (morale.value[soldier] < BROKEN_MORALE) {
      const { enemies, friends } = near(soldier, BROKEN_SURRENDER_RANGE)
      if (enemies > friends) {
        surrender(sim, soldier)
      }
    }
  }
}
