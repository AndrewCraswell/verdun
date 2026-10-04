// The balance harness: runs headless barrage attacks across seeds and checks each scenario against its acceptance band
// (docs/design/balance.md, "Battle matrix"). Every battle runs in its own process, several at once.
//
// Usage: node scripts/balance.mjs [--map fleury|prototype] [--seeds 1916,7,42,3,99] [--scenario "three bombardments"]
//                                 [--side french|german|both] [--jobs 4]
// Exits 1 when any band fails, so it can gate CI.

import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import { availableParallelism } from "node:os"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { attackBehindBarrage, bombardEnemyLine, setupSkirmish } from "../apps/client/src/skirmish.ts"
import { decodeElevation, generateFleurySector, generatePrototypeSector } from "../packages/map/src/index.ts"
import {
  capturedIds,
  createLineOfSight,
  createSimulation,
  fallenIds,
  frontLineSpan,
  Side,
  soldierIds,
  stepSimulation,
  TICK_RATE
} from "../packages/sim/src/index.ts"

/** Writes a line of the report. */
const print = (line) => process.stdout.write(`${line}\n`)

/** Seconds each preparatory bombardment takes, with its 5 s delay and the shells still in the air when it ends. */
const BOMBARDMENT_SECONDS = 130
/** The attackers have won the enemy's front line when at least this many hold it... */
const HELD_BY = 8
/** ...outnumbering what's left of its garrison by this much: the commander AI's own test for a lost line. */
const HELD_RATIO = 3
/** Soldiers within this distance of a front line's span are in it. */
const FRONT_BAND = 15

/**
 * The scenarios and their bands. `success` bounds the share of seeds on which the attack holds the enemy front line at
 * the end; `losses` bounds the attackers' mean losses (killed, wounded and captured) as a share of the men they started
 * with.
 */
const SCENARIOS = [
  { name: "no artillery", bombardments: 0, assaultSeconds: 360, success: [0, 0] },
  { name: "one bombardment", bombardments: 1, assaultSeconds: 600, success: [0, 0.4] },
  { name: "three bombardments", bombardments: 3, assaultSeconds: 600, success: [0.6, 0.9], losses: [0.35, 0.6] }
]
/** Attacking from either side should come out within this share of the seeds of each other. */
const SIDE_TOLERANCE = 0.2

const option = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback

function loadMap(name) {
  if (name === "prototype") {
    return generatePrototypeSector({
      name: "Prototype sector",
      widthMeters: 600,
      depthMeters: 400,
      cellSize: 0.5,
      seed: 1916,
      amplitude: 14
    })
  }
  const elevation = decodeElevation(readFileSync(new URL("../packages/map/data/fleury-elevation.bin", import.meta.url)))
  return generateFleurySector({ seed: 1916, elevation })
}

const countSide = (ids, sim, side) => ids.filter((id) => sim.soldiers.side.value[id] === side).length

/** One battle: the bombardments, the whistle, the assault, then who holds the defenders' front line. */
async function battle({ mapName, seed, scenario, attacker }) {
  const map = loadMap(mapName)
  const sim = createSimulation({ map, seed })
  setupSkirmish(sim)
  sim.lineOfSight = await createLineOfSight(map)
  const defender = attacker === Side.French ? Side.German : Side.French
  const started = countSide(soldierIds(sim), sim, attacker)
  const outOfShells = []
  const run = (seconds) => {
    for (let step = 0; step < seconds * TICK_RATE; step++) {
      stepSimulation(sim)
      for (const event of sim.events) {
        if (event.type === "out-of-shells") {
          outOfShells.push(`${event.side === Side.French ? "French" : "German"} shell ${event.shell}`)
        }
      }
    }
  }
  const { bombardments, assaultSeconds } = SCENARIOS.find((candidate) => candidate.name === scenario)
  for (let round = 0; round < bombardments; round++) {
    bombardEnemyLine(sim, attacker)
    run(BOMBARDMENT_SECONDS)
  }
  attackBehindBarrage(sim, attacker)
  run(assaultSeconds)

  const span = frontLineSpan(map.trenches, defender)
  const near = Math.min(span.forward, span.rear) - FRONT_BAND
  const far = Math.max(span.forward, span.rear) + FRONT_BAND
  const inFront = { [Side.French]: 0, [Side.German]: 0 }
  for (const soldier of soldierIds(sim)) {
    const z = sim.soldiers.position.z[soldier]
    if (z >= near && z <= far) {
      inFront[sim.soldiers.side.value[soldier]]++
    }
  }
  const held = inFront[attacker] >= HELD_BY && inFront[attacker] >= inFront[defender] * HELD_RATIO
  const lost = countSide(fallenIds(sim), sim, attacker) + countSide(capturedIds(sim), sim, attacker)
  return {
    held,
    losses: lost / started,
    defendersCaptured: countSide(capturedIds(sim), sim, defender),
    attackersLeft: countSide(soldierIds(sim), sim, attacker),
    inFront: [inFront[attacker], inFront[defender]],
    lostAt: sim.commanders[defender].lostAt,
    outOfShells: [...new Set(outOfShells)],
    tick: sim.tick
  }
}

/** Runs one battle in a child process and returns its result. */
async function inChild(job) {
  const run = promisify(execFile)
  const { stdout } = await run(process.execPath, [fileURLToPath(import.meta.url), "--one", JSON.stringify(job)], {
    maxBuffer: 1 << 20
  })
  return { ...job, ...JSON.parse(stdout) }
}

/** Runs jobs with at most `limit` at once, in order of submission. */
async function pool(jobs, limit, work) {
  const results = []
  let next = 0
  const runner = async () => {
    while (next < jobs.length) {
      const index = next++
      results[index] = await work(jobs[index])
      print(`  done ${results.filter(Boolean).length}/${jobs.length}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, runner))
  return results
}

const inBand = (value, [low, high]) => value >= low - 1e-9 && value <= high + 1e-9
const percent = (value) => `${Math.round(value * 100)}%`

async function main() {
  const mapName = option("--map", "fleury")
  const seeds = option("--seeds", "1916,7,42,3,99").split(",").map(Number)
  const only = option("--scenario", null)
  const sideOption = option("--side", "both")
  const sides =
    sideOption === "both" ? [Side.French, Side.German] : [sideOption === "german" ? Side.German : Side.French]
  const scenarios = SCENARIOS.filter((scenario) => only === null || scenario.name === only)
  const jobs = scenarios.flatMap((scenario) =>
    sides.flatMap((attacker) => seeds.map((seed) => ({ mapName, seed, scenario: scenario.name, attacker })))
  )
  const limit = Number(option("--jobs", String(Math.max(1, availableParallelism() - 1))))
  print(`Balance harness: ${jobs.length} battles on ${mapName}, ${limit} at a time`)
  const results = await pool(jobs, limit, inChild)

  let failed = false
  const sideName = (side) => (side === Side.French ? "French" : "German")
  for (const scenario of scenarios) {
    const shares = {}
    for (const attacker of sides) {
      const runs = results.filter((result) => result.scenario === scenario.name && result.attacker === attacker)
      const success = runs.filter((result) => result.held).length / runs.length
      const losses = runs.reduce((sum, result) => sum + result.losses, 0) / runs.length
      shares[attacker] = success
      const checks = [inBand(success, scenario.success), scenario.losses ? inBand(losses, scenario.losses) : true]
      const pass = checks.every(Boolean)
      failed ||= !pass
      const detail = runs
        .map((result) => `${result.seed}:${result.held ? "held" : "failed"} ${percent(result.losses)} lost`)
        .join(", ")
      print(
        `${pass ? "PASS" : "FAIL"} ${scenario.name}, ${sideName(attacker)} attacking: ` +
          `held ${percent(success)} (band ${percent(scenario.success[0])}-${percent(scenario.success[1])})` +
          (scenario.losses
            ? `, losses ${percent(losses)} (band ${percent(scenario.losses[0])}-${percent(scenario.losses[1])})`
            : "") +
          `\n     ${detail}`
      )
    }
    if (sides.length === 2) {
      const gap = Math.abs(shares[Side.French] - shares[Side.German])
      const pass = gap <= SIDE_TOLERANCE + 1e-9
      failed ||= !pass
      print(`${pass ? "PASS" : "FAIL"} ${scenario.name}, sides within ${percent(SIDE_TOLERANCE)}: gap ${percent(gap)}`)
    }
  }
  process.exitCode = failed ? 1 : 0
}

if (process.argv.includes("--one")) {
  const result = await battle(JSON.parse(option("--one", "{}")))
  process.stdout.write(JSON.stringify(result))
} else {
  await main()
}
