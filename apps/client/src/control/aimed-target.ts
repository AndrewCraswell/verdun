import { aimedTarget, type EntityId, type Simulation } from "@verdun/sim"

interface Aimed {
  readonly tick: number
  readonly shooter: EntityId
  readonly facingX: number
  readonly facingZ: number
  readonly x: number
  readonly z: number
  readonly target: EntityId
}

const lastAimed = new WeakMap<Simulation, Aimed>()

/**
 * Who the soldier's aimed shot would strike now (`aimedTarget`), worked out once while the simulation, his aim and his
 * place stand still: the squad's marker and the HUD both ask every frame, and the answer sorts every soldier in his
 * line of fire and casts sight lines to them. His facing is part of what's remembered, since the pointer turns him
 * between steps.
 */
export function aimedTargetNow(sim: Simulation, shooter: EntityId): EntityId {
  const { position, facing } = sim.soldiers
  const key = {
    tick: sim.tick,
    shooter,
    facingX: facing.x[shooter] ?? 0,
    facingZ: facing.z[shooter] ?? 0,
    x: position.x[shooter] ?? 0,
    z: position.z[shooter] ?? 0
  }
  const last = lastAimed.get(sim)
  if (
    last &&
    last.tick === key.tick &&
    last.shooter === key.shooter &&
    last.facingX === key.facingX &&
    last.facingZ === key.facingZ &&
    last.x === key.x &&
    last.z === key.z
  ) {
    return last.target
  }
  const target = aimedTarget(sim, shooter)
  lastAimed.set(sim, { ...key, target })
  return target
}
