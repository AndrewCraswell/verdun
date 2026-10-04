// Measures how exposed an attack across the Fleury sector's no man's land is to the defenders' machine guns.
//
// For every 2 m cell between the French and German front lines, marches sight lines over the height field from each
// German machine gun (eye 0.8 m above the ground it stands on, as on a fire step) and counts the cell as exposed when
// any gun sees a man standing in it (chest height 1.3 m). Then walks attack lanes every 20 m from the French wire to the
// German wire and reports the share of each lane under fire, so dead ground (the ravine, the sunken road, the craters)
// shows up as numbers. Ruins, trees and smoke don't block sight in the simulation, so they don't here either.
//
// Usage: node scripts/analyze-sector.mjs [--side french|german] [--height 1.3]

import { readFileSync } from "node:fs"
import { decodeElevation, generateFleurySector, heightAt } from "../packages/map/src/index.ts"

const option = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const side = option("--side", "german")
// Chest height of the man being shot at: 1.3 standing, 0.9 crouching, 0.35 prone.
const target = Number(option("--height", "1.3"))
const elevation = decodeElevation(readFileSync(new URL("../packages/map/data/fleury-elevation.bin", import.meta.url)))
const map = generateFleurySector({ cellSize: 1, elevation })
const meanZ = (trench) => trench.points.reduce((sum, [, z]) => sum + z, 0) / trench.points.length
const fronts = { north: [], south: [] }
for (const trench of map.trenches.filter((trench) => trench.kind === "fire")) {
  fronts[trench.facing].push(trench)
}
const frenchFront = Math.max(...fronts.north.map(meanZ))
const germanFront = Math.min(...fronts.south.map(meanZ))

// Defending guns: the machine guns of the defending side, and its concrete posts.
const defenderVariant = side === "german" ? 1 : 0
const guns = map.scenery
  .filter(
    (item) =>
      (item.kind === "machine-gun" && item.variant === defenderVariant) || (item.kind === "bunker" && side === "german")
  )
  .map((item) => ({ x: item.x, z: item.z, y: heightAt(map, item.x, item.z) + 0.8 }))

const RANGE = 500
const STEP = 1
function sees(gun, x, z) {
  const aim = heightAt(map, x, z) + target
  const distance = Math.hypot(x - gun.x, z - gun.z)
  if (distance > RANGE) {
    return false
  }
  // Start past the gun's own parapet.
  for (let along = 4; along < distance - 1; along += STEP) {
    const t = along / distance
    const rayY = gun.y + (aim - gun.y) * t
    if (heightAt(map, gun.x + (x - gun.x) * t, gun.z + (z - gun.z) * t) > rayY) {
      return false
    }
  }
  return true
}

const CELL = 2
const exposed = new Map()
const from = side === "german" ? frenchFront + 20 : germanFront - 20
const to = side === "german" ? germanFront - 15 : frenchFront + 15
for (let z = Math.min(from, to); z <= Math.max(from, to); z += CELL) {
  for (let x = 10; x < 590; x += CELL) {
    exposed.set(
      `${x},${z}`,
      guns.some((gun) => sees(gun, x, z))
    )
  }
}

let total = 0
let hit = 0
const lanes = []
for (let x = 20; x < 590; x += 20) {
  let lane = 0
  let laneHit = 0
  for (const [key, value] of exposed) {
    const [cx] = key.split(",").map(Number)
    if (Math.abs(cx - x) <= 4) {
      lane += 1
      laneHit += value ? 1 : 0
    }
  }
  lanes.push({ x, exposed: lane ? laneHit / lane : 0 })
  total += lane
  hit += laneHit
}

console.log(`Defender: ${side}, ${guns.length} machine guns and posts; attacker's chest at ${target} m`)
console.log(`Front lines: French z=${frenchFront.toFixed(0)}, German z=${germanFront.toFixed(0)}`)
console.log(`No man's land under fire: ${((100 * hit) / total).toFixed(0)}%`)
console.log("Attack lanes (x: share of the lane a machine gun can see)")
for (const { x, exposed: share } of lanes) {
  console.log(
    `  x=${String(x).padStart(3)}  ${"#".repeat(Math.round(share * 40)).padEnd(40)} ${(share * 100).toFixed(0)}%`
  )
}

// Named routes an attacking squad might take, as polylines; each reports the share of its length under fire.
const ROUTES = {
  "straight across the middle (x=300)": [
    [300, frenchFront + 20],
    [300, germanFront - 15]
  ],
  "up the Ravin de la Dame": [
    [262, frenchFront + 25],
    [250, 182],
    [212, 216],
    [180, germanFront - 15]
  ],
  "along the sunken road": [
    [352, frenchFront + 25],
    [352, 189],
    [405, 195],
    [452, 200],
    [470, germanFront - 15]
  ],
  "through Fleury (x=540)": [
    [540, frenchFront + 45],
    [540, germanFront - 35]
  ]
}
console.log("Routes (share of the route a machine gun can see)")
for (const [name, points] of Object.entries(ROUTES)) {
  let samples = 0
  let seen = 0
  for (let index = 1; index < points.length; index++) {
    const [ax, az] = points[index - 1]
    const [bx, bz] = points[index]
    const length = Math.hypot(bx - ax, bz - az)
    for (let along = 0; along < length; along += 2) {
      const x = ax + ((bx - ax) * along) / length
      const z = az + ((bz - az) * along) / length
      samples += 1
      seen += guns.some((gun) => sees(gun, x, z)) ? 1 : 0
    }
  }
  console.log(`  ${name.padEnd(36)} ${((100 * seen) / samples).toFixed(0)}%`)
}
