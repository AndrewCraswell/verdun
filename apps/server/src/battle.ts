import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { type BattlefieldMap, decodeElevation, generateFleurySector } from "@verdun/map"
import {
  createSimulation,
  enqueueCommand,
  loadWeatherRegion,
  PLAYTEST_OPERATION,
  planOperation,
  restoreSimulation,
  setupSkirmish,
  type Simulation,
  type SimulationSnapshot,
  WEATHER_REGIONS,
  type WeatherRegion
} from "@verdun/sim"
import { createLineOfSight } from "@verdun/sim/physics"

/** The seeds the battle is made from: the client's own, so the server's battle starts as a local one does. */
const MAP_SEED = 1916
const SIM_SEED = 1916
const WEATHER_SEED = 1916

/** The Fleury sector, generated from IGN's survey of the real ground as the client generates it. */
export async function loadSectorMap(): Promise<BattlefieldMap> {
  const survey = createRequire(import.meta.url).resolve("@verdun/map/data/fleury-elevation.bin")
  return generateFleurySector({ seed: MAP_SEED, elevation: decodeElevation(await readFile(survey)) })
}

/** History's weather the map's battle is fought in. */
function regionOf(map: BattlefieldMap): WeatherRegion {
  return WEATHER_REGIONS.find((name) => name === map.weatherRegion) ?? "fleury"
}

/** Sight lines through the ground and the scenery: the server's battle runs with the physics, as the worker's does. */
async function withSightLines(sim: Simulation): Promise<Simulation> {
  sim.lineOfSight = await createLineOfSight(sim.map)
  return sim
}

/**
 * A fresh battle on the map: both lines manned with `soldiersPerSide` men each (the local game's 200 unless given), the
 * playtest's operation planned, and every squad fighting by its own orders until a player joins it.
 */
export async function newBattle(map: BattlefieldMap, soldiersPerSide = 200): Promise<Simulation> {
  const region = regionOf(map)
  await loadWeatherRegion(region)
  const sim = createSimulation({
    map,
    seed: SIM_SEED,
    environment: { forecast: { kind: "records", seed: WEATHER_SEED, region } }
  })
  // The skirmish hands one squad to the local player; on the server no one leads it until a player joins.
  const { playerSquad } = setupSkirmish(sim, soldiersPerSide)
  enqueueCommand(sim, { type: "squad-controller", squad: playerSquad.id, controller: "ai" })
  planOperation(sim, PLAYTEST_OPERATION)
  return withSightLines(sim)
}

/**
 * A saved battle taken up again on the map, which must already have the saved ground's craters. Every region's weather
 * is loaded first: the battle may have been sent another region's (the `forecast` command).
 */
export async function resumeBattle(map: BattlefieldMap, snapshot: SimulationSnapshot): Promise<Simulation> {
  await Promise.all(WEATHER_REGIONS.map((region) => loadWeatherRegion(region)))
  return withSightLines(restoreSimulation(map, snapshot))
}
