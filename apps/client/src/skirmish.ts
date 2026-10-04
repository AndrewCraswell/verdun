import { mapDepth, mapWidth } from "@verdun/map"
import { enqueueCommand, type EntityId, Side, type Simulation, spawnSoldier } from "@verdun/sim"

export interface Skirmish {
  readonly french: readonly EntityId[]
  readonly german: readonly EntityId[]
}

/**
 * Placeholder scenario until trenches and bots land: a French line at the south end of the map advances on a German
 * line at the north end.
 */
export function setupSkirmish(sim: Simulation, soldiersPerSide = 200): Skirmish {
  const width = mapWidth(sim.map)
  const depth = mapDepth(sim.map)
  const frontage = width * 0.6
  const left = (width - frontage) / 2
  const spacing = frontage / soldiersPerSide

  const french: EntityId[] = []
  const german: EntityId[] = []
  for (let index = 0; index < soldiersPerSide; index++) {
    const x = left + index * spacing
    french.push(spawnSoldier(sim, { side: Side.French, x, z: depth * 0.15 + sim.rng.next() * 6 }))
    german.push(spawnSoldier(sim, { side: Side.German, x, z: depth * 0.85 - sim.rng.next() * 6 }))
  }

  for (const soldier of french) {
    enqueueCommand(sim, { type: "move-to", soldier, x: sim.soldiers.position.x[soldier], z: depth * 0.8 })
  }
  return { french, german }
}
