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
import { decodeElevation, generateFleurySector, generatePrototypeSector } from "../packages/map/src/index.ts"
import {
  attackBehindBarrage,
  bombardEnemyLine,
  setupSkirmish,
  capturedIds,
  createSimulation,
  evacuatedIds,
  fallenIds,
  frontLineSpan,
  PLAYTEST_OPERATION,
  planOperation,
  Side,
  soldierIds,
  enqueueCommand,
  stepSimulation,
  TICK_RATE,
  Weapon
} from "../packages/sim/src/index.ts"
import { createLineOfSight } from "../packages/sim/src/physics-sight.ts"

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
  // Infantry alone: every squad advances on the enemy line, walking, with no barrage of any kind.
  { name: "no artillery", bombardments: 0, barrage: false, assaultSeconds: 360, success: [0, 0] },
  // Operations as the simulation runs them (docs/design/operations.md): a stretch of the enemy's line chosen, squads
  // massed on it, the bombardments, the barrage and the waves, and "held" the result "taken", judged at the end, after
  // the counter-attack. Three bombardments is the playtest's operation.
  { name: "barrage only", operation: { bombardments: 0 }, success: [0, 0.2] },
  { name: "one bombardment", operation: { bombardments: 1 }, success: [0, 0.4] },
  {
    name: "three bombardments",
    operation: { bombardments: 3 },
    success: [0.4, 0.8],
    losses: [0.4, 0.8],
    ownFire: [0.05, 0.15]
  }
]
/** What knocks men down, in the order the report lists them. "own" is the attackers' own shells and grenades. */
const CAUSES = ["machine-gun", "rifle", "shell", "own", "grenade", "gas", "other"]
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
  // The attackers' men put out of the fight, by what did it.
  const causes = Object.fromEntries(CAUSES.map((cause) => [cause, 0]))
  // The defenders' fire, by weapon: shots and hits.
  const fire = { rifle: { shots: 0, hits: 0 }, "machine-gun": { shots: 0, hits: 0 } }
  const run = (seconds) => {
    for (let step = 0; step < seconds * TICK_RATE; step++) {
      stepSimulation(sim)
      for (const event of sim.events) {
        if (event.type === "fallen" && sim.soldiers.side.value[event.soldier] === attacker) {
          const { kind, by } = event.cause
          const own = by === attacker && (kind === "shell" || kind === "grenade")
          causes[own ? "own" : kind] += 1
        }
        if (event.type === "shot" && sim.soldiers.side.value[event.shooter] === defender) {
          const weapon = sim.soldiers.weapon.kind[event.shooter] === Weapon.MachineGun ? "machine-gun" : "rifle"
          fire[weapon].shots += 1
          fire[weapon].hits += event.hit ? 1 : 0
        }
        if (event.type === "out-of-shells") {
          outOfShells.push(`${event.side === Side.French ? "French" : "German"} shell ${event.shell}`)
        }
      }
    }
  }
  const {
    bombardments,
    assaultSeconds,
    barrage = true,
    operation
  } = SCENARIOS.find((candidate) => candidate.name === scenario)
  if (operation) {
    const planned = planOperation(sim, { ...PLAYTEST_OPERATION, side: attacker, ...operation })
    while (planned.result === null && sim.tick <= planned.endsAt) {
      run(10)
    }
  }
  for (let round = 0; round < bombardments; round++) {
    bombardEnemyLine(sim, attacker)
    run(BOMBARDMENT_SECONDS)
  }
  const target = frontLineSpan(map.trenches, defender)
  if (operation) {
    // The operation sent them over itself.
  } else if (barrage) {
    attackBehindBarrage(sim, attacker)
  } else {
    // Over the top with no guns behind them: each squad walks straight for the stretch of enemy trench ahead of it.
    for (const squad of sim.squads) {
      if (squad.side === attacker && squad.leader >= 0) {
        const x = sim.soldiers.position.x[squad.leader]
        enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", x, z: target.rear } })
      }
    }
  }
  if (!operation) {
    run(assaultSeconds)
  }

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
  const held = operation
    ? sim.operation.result === "taken"
    : inFront[attacker] >= HELD_BY && inFront[attacker] >= inFront[defender] * HELD_RATIO
  // Killed and wounded lying out, wounded carried off, and taken prisoner.
  const lost = [fallenIds(sim), evacuatedIds(sim), capturedIds(sim)].reduce(
    (sum, ids) => sum + countSide(ids, sim, attacker),
    0
  )
  return {
    held,
    losses: lost / started,
    causes,
    defenderFire: fire,
    captured: countSide(capturedIds(sim), sim, attacker),
    defendersCaptured: countSide(capturedIds(sim), sim, defender),
    attackersLeft: countSide(soldierIds(sim), sim, attacker),
    inFront: [inFront[attacker], inFront[defender]],
    lostAt: sim.commanders[defender].lostAt,
    outOfShells: [...new Set(outOfShells)],
    tick: sim.tick,
    ...(operation
      ? {
          result: sim.operation.result,
          endedAfter: Math.round((sim.operation.endedAt - sim.operation.plannedAt) / TICK_RATE)
        }
      : {})
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
      // Shares of the attackers' losses (killed, wounded and captured) by cause.
      const fallen = Object.fromEntries(
        CAUSES.map((cause) => [cause, runs.reduce((sum, result) => sum + result.causes[cause], 0)])
      )
      const captured = runs.reduce((sum, result) => sum + result.captured, 0)
      const allLost = CAUSES.reduce((sum, cause) => sum + fallen[cause], 0) + captured
      const ownFire = allLost > 0 ? fallen.own / allLost : 0
      const checks = [
        inBand(success, scenario.success),
        scenario.losses ? inBand(losses, scenario.losses) : true,
        scenario.ownFire ? inBand(ownFire, scenario.ownFire) : true
      ]
      const pass = checks.every(Boolean)
      failed ||= !pass
      const detail = runs
        .map(
          (result) =>
            `${result.seed}:${result.result ?? (result.held ? "held" : "failed")}` +
            `${result.endedAfter === undefined ? "" : ` at ${Math.floor(result.endedAfter / 60)} min`} ${percent(result.losses)} lost`
        )
        .join(", ")
      print(
        `${pass ? "PASS" : "FAIL"} ${scenario.name}, ${sideName(attacker)} attacking: ` +
          `held ${percent(success)} (band ${percent(scenario.success[0])}-${percent(scenario.success[1])})` +
          (scenario.losses
            ? `, losses ${percent(losses)} (band ${percent(scenario.losses[0])}-${percent(scenario.losses[1])})`
            : "") +
          (scenario.ownFire
            ? `, own fire ${percent(ownFire)} of losses (band ${percent(scenario.ownFire[0])}-${percent(scenario.ownFire[1])})`
            : "") +
          `\n     ${detail}` +
          `\n     losses by cause: ${[...CAUSES.filter((cause) => fallen[cause] > 0), "captured"]
            .map(
              (cause) => `${cause} ${percent((cause === "captured" ? captured : fallen[cause]) / Math.max(1, allLost))}`
            )
            .join(", ")}`
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
