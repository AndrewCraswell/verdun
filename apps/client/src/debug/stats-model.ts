import { capturedIds, fallenIds, Side, type Simulation, soldierIds, TICK_RATE } from "@verdun/sim"

/** What's on the battlefield, for the debug overlay. */
export interface WorldStats {
  readonly clock: string
  readonly soldiers: string
  readonly fallen: string
  readonly prisoners: string
  readonly artillery: string
  readonly clouds: string
  readonly wind: string
}

function perSide(ids: readonly number[], sim: Simulation): string {
  const french = ids.filter((id) => sim.soldiers.side.value[id] === Side.French).length
  return `${french} French, ${ids.length - french} German`
}

/** Battlefield counts: soldiers, the fallen, prisoners, artillery, clouds and wind. */
export function worldStats(sim: Simulation): WorldStats {
  const seconds = Math.floor(sim.tick / TICK_RATE)
  const minutes = Math.floor(seconds / 60)
  const activeCells = (concentration: Float32Array) =>
    concentration.reduce((count, value) => count + (value > 0 ? 1 : 0), 0)
  const missions = sim.artillery.missions.filter((mission) => !mission.finished).length
  const windSpeed = Math.sqrt(sim.wind.x ** 2 + sim.wind.z ** 2)
  return {
    clock: `Tick ${sim.tick}, ${minutes}:${String(seconds % 60).padStart(2, "0")} of battle`,
    soldiers: perSide(soldierIds(sim), sim),
    fallen: perSide(fallenIds(sim), sim),
    prisoners: perSide(capturedIds(sim), sim),
    artillery: `${missions} fire missions, ${sim.artillery.shells.length} shells in flight`,
    clouds: `Gas ${activeCells(sim.gas.concentration)} cells, smoke ${activeCells(sim.smoke.concentration)} cells`,
    wind: `Wind ${windSpeed.toFixed(1)} m/s`
  }
}
