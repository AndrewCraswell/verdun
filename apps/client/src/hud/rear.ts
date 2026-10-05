import { aidPost, evacuatedIds, type Simulation, type Squad } from "@verdun/sim"

/** W9: the side's aid post, with how many men are being treated there. */
export interface RearView {
  readonly aidPost: { readonly x: number; readonly z: number; readonly patients: number }
}

export function rearView(sim: Simulation, squad: Squad): RearView {
  const post = aidPost(sim.map, squad.side)
  const patients = evacuatedIds(sim).filter(
    (soldier) => sim.soldiers.side.value[soldier] === squad.side && sim.soldiers.casualty.treatment[soldier] >= 0
  ).length
  return { aidPost: { x: post.x, z: post.z, patients } }
}
