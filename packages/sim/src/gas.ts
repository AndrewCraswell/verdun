import { type BattlefieldMap, type ChangedArea, mapDepth, mapWidth, sampleIndex } from "@verdun/map"
import type { EntityId } from "bitecs"
import { applyCommand } from "./commands.ts"
import { MaskState, Stance } from "./components.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"

/** Gas grid cell size, in metres. Coarse: gas clouds are tens of metres across. */
export const GAS_CELL = 4
/** Gas is simulated this often, in steps: five times a second. */
export const GAS_INTERVAL = 4
/** Phosgene is three and a half times heavier than air: it hugs the ground in a layer about this deep, in metres. */
const LAYER_HEIGHT = 2
/** At most this fraction of a cell's gas drains away in one gas step, however steep the ground. */
const MAX_DRAIN = 0.4

/** How a kind of cloud behaves once released. */
export interface CloudBehaviour {
  /** Horizontal turbulent diffusivity near the ground, in m²/s. */
  readonly diffusivity: number
  /** Fraction of a cell's cloud that flows per second to a neighbour for each metre that neighbour is lower. */
  readonly drainRate: number
  /** Half-lives, in seconds, in the open and in hollows. */
  readonly halfLife: { readonly open: number; readonly hollow: number }
}

/**
 * Phosgene: heavy, so it runs downhill into trenches and shell holes. In the open it thins and mixes upward within
 * minutes; trapped low it lingers for a quarter of an hour.
 */
export const PHOSGENE: CloudBehaviour = { diffusivity: 3, drainRate: 0.5, halfLife: { open: 240, hollow: 900 } }
/** Shell smoke and thrown dust: they billow and spread, and settle or blow away within half a minute or so. */
export const BURST_SMOKE: CloudBehaviour = { diffusivity: 4, drainRate: 0, halfLife: { open: 25, hollow: 25 } }
/** A cell is a hollow when its lowest ground lies this far below the average ground around it. */
const HOLLOW_DEPTH = 0.8
/** Below this concentration, in mg/m³, a cell counts as clear. */
const NEGLIGIBLE = 0.05

/** Concentration at which a soldier smells gas and masks up, in mg/m³: phosgene's musty-hay smell, well before harm. */
export const GAS_DETECTED = 10
/** A masked soldier takes it off after the air has stayed below this for `MASK_OFF_AFTER` seconds. */
const ALL_CLEAR = 3
const MASK_OFF_AFTER = 60
/** Seconds to pull a mask on: 5 for the drilled and alert, up to 12 for the surprised. */
const DON_SECONDS = { min: 5, spread: 7 } as const
/** A soldier shouting "gas!" warns friends within this distance, in metres: the alarm, the gong, the klaxon. */
const GAS_ALARM_RANGE = 60
/** Morale lost on first smelling gas. Gas frightened men out of all proportion to the casualties it caused. */
const GAS_FEAR = 0.1
/**
 * Fraction of the gas a mask lets through. The French M2 and the German Gummimaske both stopped nearly all phosgene
 * when properly fitted; leaks, beards and wear let a little in.
 */
export const MASK_LEAK = 0.03
/** Gas seeps past the blanket curtains of a dugout: men sheltering below breathe this fraction of the air above. */
const DUGOUT_GAS_FACTOR = 0.6
/**
 * Dose that disables half of those who breathe it, in mg·min/m³: phosgene's ICt50 is about 1,600. Individuals vary by
 * about 40% either way.
 */
export const INCAPACITATING_DOSE = 1600
/** Once over their limit a soldier is out of the fight within about this many seconds, choking. */
const GAS_DECLINE_SECONDS = 60

/**
 * A grid of gas concentration over the map, in mg/m³ in the layer near the ground. Wind carries it, turbulence spreads
 * it, it runs downhill into trenches and craters, and it thins away, slowest where it pools.
 */
export interface GasField {
  readonly columns: number
  readonly rows: number
  readonly concentration: Float32Array
  /** Lowest ground in each cell, in metres: a trench floor, the bottom of a crater. */
  readonly floor: Float32Array
  /** Average ground in each cell, for deciding which cells are hollows. */
  readonly ground: Float32Array
  /** 1 where gas pools and lingers. */
  readonly hollow: Uint8Array
  readonly scratch: Float32Array
  /** False while the whole field is clear, so the grid costs nothing between gas attacks. */
  active: boolean
}

export function createGasField(map: BattlefieldMap): GasField {
  const columns = Math.max(1, Math.ceil(mapWidth(map) / GAS_CELL))
  const rows = Math.max(1, Math.ceil(mapDepth(map) / GAS_CELL))
  const cells = columns * rows
  const field: GasField = {
    columns,
    rows,
    concentration: new Float32Array(cells),
    floor: new Float32Array(cells),
    ground: new Float32Array(cells),
    hollow: new Uint8Array(cells),
    scratch: new Float32Array(cells),
    active: false
  }
  refreshGasGround(field, map, { minX: 0, minZ: 0, maxX: mapWidth(map), maxZ: mapDepth(map) })
  return field
}

/** Re-reads the ground under the gas grid inside an area, after craters reshape it. */
export function refreshGasGround(field: GasField, map: BattlefieldMap, area: ChangedArea): void {
  const firstColumn = Math.max(0, Math.floor(area.minX / GAS_CELL))
  const lastColumn = Math.min(field.columns - 1, Math.floor(area.maxX / GAS_CELL))
  const firstRow = Math.max(0, Math.floor(area.minZ / GAS_CELL))
  const lastRow = Math.min(field.rows - 1, Math.floor(area.maxZ / GAS_CELL))
  const perCell = GAS_CELL / map.cellSize
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      let lowest = Infinity
      let sum = 0
      let count = 0
      const sampleRow = Math.round(row * perCell)
      const sampleColumn = Math.round(column * perCell)
      for (let r = sampleRow; r <= Math.min(map.rows, sampleRow + perCell); r++) {
        for (let c = sampleColumn; c <= Math.min(map.columns, sampleColumn + perCell); c++) {
          const height = map.heights[sampleIndex(map, c, r)] ?? 0
          lowest = Math.min(lowest, height)
          sum += height
          count++
        }
      }
      const cell = row * field.columns + column
      field.floor[cell] = lowest
      field.ground[cell] = sum / count
    }
  }
  // Hollowness depends on the neighbours' ground too.
  for (let row = Math.max(0, firstRow - 1); row <= Math.min(field.rows - 1, lastRow + 1); row++) {
    for (let column = Math.max(0, firstColumn - 1); column <= Math.min(field.columns - 1, lastColumn + 1); column++) {
      let sum = 0
      let count = 0
      for (const [dc, dr] of NEIGHBOURS) {
        const c = column + dc
        const r = row + dr
        if (c >= 0 && r >= 0 && c < field.columns && r < field.rows) {
          sum += field.ground[r * field.columns + c] ?? 0
          count++
        }
      }
      const cell = row * field.columns + column
      field.hollow[cell] = count > 0 && (field.floor[cell] ?? 0) < sum / count - HOLLOW_DEPTH ? 1 : 0
    }
  }
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
] as const

/** Gas concentration at a ground point, in mg/m³. */
export function concentrationAt(field: GasField, x: number, z: number): number {
  const column = Math.floor(x / GAS_CELL)
  const row = Math.floor(z / GAS_CELL)
  if (column < 0 || row < 0 || column >= field.columns || row >= field.rows) {
    return 0
  }
  return field.concentration[row * field.columns + column] ?? 0
}

/** Releases gas at a point: the liquid in a shell flashing to vapour as it bursts. `mass` is in milligrams. */
export function releaseGas(field: GasField, x: number, z: number, mass: number): void {
  const column = Math.floor(x / GAS_CELL)
  const row = Math.floor(z / GAS_CELL)
  if (column < 0 || row < 0 || column >= field.columns || row >= field.rows) {
    return
  }
  const cell = row * field.columns + column
  field.concentration[cell] = (field.concentration[cell] ?? 0) + mass / (GAS_CELL * GAS_CELL * LAYER_HEIGHT)
  field.active = true
}

function bilinear(field: GasField, values: Float32Array, column: number, row: number): number {
  const c0 = Math.floor(column)
  const r0 = Math.floor(row)
  const fc = column - c0
  const fr = row - r0
  const at = (c: number, r: number) =>
    c < 0 || r < 0 || c >= field.columns || r >= field.rows ? 0 : (values[r * field.columns + c] ?? 0)
  return (
    (at(c0, r0) * (1 - fc) + at(c0 + 1, r0) * fc) * (1 - fr) +
    (at(c0, r0 + 1) * (1 - fc) + at(c0 + 1, r0 + 1) * fc) * fr
  )
}

/** One step of `seconds` for a cloud: wind, turbulence, drainage into low ground, then decay. */
export function spreadGas(
  field: GasField,
  wind: { readonly x: number; readonly z: number },
  seconds: number,
  behaviour: CloudBehaviour = PHOSGENE
): void {
  const { columns, rows, concentration, scratch } = field
  // Wind: semi-Lagrangian advection, tracing each cell centre back upwind. Gas blown off the map is gone.
  const backColumns = (wind.x * seconds) / GAS_CELL
  const backRows = (wind.z * seconds) / GAS_CELL
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      scratch[row * columns + column] = bilinear(field, concentration, column - backColumns, row - backRows)
    }
  }
  // Turbulence: explicit diffusion, stable while the coefficient stays under a quarter.
  const spread = (behaviour.diffusivity * seconds) / (GAS_CELL * GAS_CELL)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column
      const here = scratch[cell] ?? 0
      let sum = 0
      for (const [dc, dr] of NEIGHBOURS) {
        const c = column + dc
        const r = row + dr
        sum += c < 0 || r < 0 || c >= columns || r >= rows ? 0 : (scratch[r * columns + c] ?? 0)
      }
      concentration[cell] = here + spread * (sum - 4 * here)
    }
  }
  // Drainage: heavy gas flows to lower neighbours, so it fills trenches and shell holes.
  scratch.set(concentration)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column
      const here = concentration[cell] ?? 0
      if (here <= NEGLIGIBLE) {
        continue
      }
      const floor = field.floor[cell] ?? 0
      let fractions = 0
      const flows: [number, number][] = []
      for (const [dc, dr] of NEIGHBOURS) {
        const c = column + dc
        const r = row + dr
        if (c < 0 || r < 0 || c >= columns || r >= rows) {
          continue
        }
        const neighbour = r * columns + c
        const drop = floor - (field.floor[neighbour] ?? 0)
        if (drop > 0 && behaviour.drainRate > 0) {
          const fraction = behaviour.drainRate * drop * seconds
          flows.push([neighbour, fraction])
          fractions += fraction
        }
      }
      const scale = fractions > MAX_DRAIN ? MAX_DRAIN / fractions : 1
      for (const [neighbour, fraction] of flows) {
        const moved = here * fraction * scale
        scratch[cell] = (scratch[cell] ?? 0) - moved
        scratch[neighbour] = (scratch[neighbour] ?? 0) + moved
      }
    }
  }
  // Decay: slow where it pools.
  const keepOpen = Math.exp((-Math.LN2 * seconds) / behaviour.halfLife.open)
  const keepHollow = Math.exp((-Math.LN2 * seconds) / behaviour.halfLife.hollow)
  let anything = false
  for (let cell = 0; cell < concentration.length; cell++) {
    const value = (scratch[cell] ?? 0) * (field.hollow[cell] === 1 ? keepHollow : keepOpen)
    const kept = value > NEGLIGIBLE ? value : 0
    concentration[cell] = kept
    anything ||= kept > 0
  }
  field.active = anything
}

/** A fixed spread in [0, 1) for each soldier and purpose, without drawing on the simulation's RNG. */
function spreadFor(soldier: EntityId, salt: number): number {
  return (Math.imul(soldier ^ salt, 2654435761) >>> 0) / 2 ** 32
}

function startDonning(sim: Simulation, soldier: EntityId): void {
  const { mask } = sim.soldiers
  if (mask.state[soldier] !== MaskState.Off) {
    return
  }
  mask.state[soldier] = MaskState.Donning
  mask.at[soldier] =
    sim.tick + Math.round((DON_SECONDS.min + spreadFor(soldier, 0x5f3) * DON_SECONDS.spread) * TICK_RATE)
  mask.clearSince[soldier] = -1
}

/** The dose a soldier can breathe before gas puts them out of the fight. */
export function gasTolerance(soldier: EntityId): number {
  return INCAPACITATING_DOSE * (0.6 + 0.8 * spreadFor(soldier, 0x9e37))
}

/**
 * Soldiers and gas, each gas step: those who smell it shout the alarm and pull their masks on, masks come off once
 * the air has been clear for a minute, and everyone breathes what gets past their mask. Over their limit, they choke
 * and fall out of the fight within a minute.
 */
function breathe(sim: Simulation, seconds: number): void {
  const { position, side, mask, gasDose, health, morale, stance } = sim.soldiers
  const living = Array.from(soldierIds(sim))
  const alarms: EntityId[] = []
  for (const soldier of living) {
    const air = concentrationAt(sim.gas, position.x[soldier], position.z[soldier])
    if (air >= GAS_DETECTED && mask.state[soldier] === MaskState.Off) {
      startDonning(sim, soldier)
      morale.value[soldier] = Math.max(0, morale.value[soldier] - GAS_FEAR)
      alarms.push(soldier)
    }
    if (mask.state[soldier] === MaskState.Donning && sim.tick >= mask.at[soldier]) {
      mask.state[soldier] = MaskState.On
    }
    if (mask.state[soldier] === MaskState.On) {
      if (air >= ALL_CLEAR) {
        mask.clearSince[soldier] = -1
      } else if (mask.clearSince[soldier] < 0) {
        mask.clearSince[soldier] = sim.tick
      } else if (sim.tick - mask.clearSince[soldier] >= MASK_OFF_AFTER * TICK_RATE) {
        mask.state[soldier] = MaskState.Off
        mask.clearSince[soldier] = -1
      }
    }
    const leak = mask.state[soldier] === MaskState.On ? MASK_LEAK : 1
    const shelter = stance.value[soldier] === Stance.Sheltering ? DUGOUT_GAS_FACTOR : 1
    gasDose.value[soldier] += (air * leak * shelter * seconds) / 60
    if (gasDose.value[soldier] >= gasTolerance(soldier)) {
      health.value[soldier] -= seconds / GAS_DECLINE_SECONDS
      if (health.value[soldier] <= 0) {
        applyCommand(sim, { type: "kill", soldier })
      }
    }
  }
  for (const caller of alarms) {
    for (const soldier of living) {
      if (
        side.value[soldier] === side.value[caller] &&
        (position.x[soldier] - position.x[caller]) ** 2 + (position.z[soldier] - position.z[caller]) ** 2 <=
          GAS_ALARM_RANGE * GAS_ALARM_RANGE
      ) {
        startDonning(sim, soldier)
      }
    }
  }
}

/**
 * Rain scrubs a cloud out of the air: phosgene dissolves and breaks down in water, and rain beats down dust and smoke.
 * Half-lives in seconds in 1 mm/h of rain, shorter in heavier rain. Snow scrubs a third as well.
 */
const WASHOUT_HALF_LIFE = { gas: 300, smoke: 120 } as const
const SNOW_WASHOUT = 1 / 3

/** Takes what the rain washes out of a cloud over `seconds`, at `halfLife` seconds in 1 mm/h. */
function washOut(field: GasField, seconds: number, rain: number, halfLife: number): void {
  const keep = Math.exp((-Math.LN2 * seconds * rain) / halfLife)
  const { concentration } = field
  for (let cell = 0; cell < concentration.length; cell++) {
    concentration[cell] = concentration[cell]! * keep
  }
}

/** One step of gas: the cloud moves and spreads a few times a second, rain washes it out, and soldiers breathe it. */
export function gasSystem(sim: Simulation): void {
  if (sim.tick % GAS_INTERVAL !== 0) {
    return
  }
  const seconds = GAS_INTERVAL / TICK_RATE
  if (sim.gas.active) {
    spreadGas(sim.gas, sim.wind, seconds, PHOSGENE)
  }
  if (sim.smoke.active) {
    spreadGas(sim.smoke, sim.wind, seconds, BURST_SMOKE)
  }
  const { precipitation, snowFraction } = sim.environment.weather
  const rain = precipitation * (1 - snowFraction * (1 - SNOW_WASHOUT))
  if (rain > 0.02) {
    if (sim.gas.active) {
      washOut(sim.gas, seconds, rain, WASHOUT_HALF_LIFE.gas)
    }
    if (sim.smoke.active) {
      washOut(sim.smoke, seconds, rain, WASHOUT_HALF_LIFE.smoke)
    }
  }
  const anyMasked = sim.soldiers.mask.state.some((state) => state !== MaskState.Off)
  if (sim.gas.active || anyMasked) {
    breathe(sim, seconds)
  }
}
