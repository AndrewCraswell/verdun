import { type ChangedArea, sampleIndex } from "@verdun/map"
import { addComponent, addEntity, entityExists, query, removeComponent } from "bitecs"
import type { BurstEvent } from "./artillery.ts"
import type { SimEvent, Simulation } from "./simulation.ts"

/**
 * Keeping a copy of a simulation in step with one running elsewhere: in a Web Worker now, on a server later. The copy
 * (the mirror) is a whole `Simulation`, never stepped, that every read the renderer, the HUD and the sound make works on
 * as before; after each batch of steps the running simulation sends what changed and the mirror takes it in place, so
 * objects held on to (a squad, the soldier arrays) stay the ones read.
 *
 * What goes across: every soldier array up to the highest soldier, which soldiers carry which components, the rest of
 * the state as plain data, each step's events, the wire when shells have cut it, and the ground craters reshaped.
 */
export interface SimSync {
  readonly tick: number
  /** Highest soldier id + 1: the soldier arrays below run this far. */
  readonly soldiers: number
  /** Every soldier array, `soldiers` long, one after another in `soldierArrays` order. */
  readonly arrays: ArrayBuffer
  /** For each soldier component, by name, the soldiers that have it. */
  readonly members: Readonly<Record<string, Int32Array>>
  /** Everything else, as plain data, by field of the simulation. */
  readonly state: Readonly<Record<string, unknown>>
  /** Each step's events, oldest first, with the step each came from. */
  readonly steps: readonly { readonly tick: number; readonly events: readonly SimEvent[] }[]
  /** The wire's density in every cell, and its count of cuts, when shells have cut it since the last sync. */
  readonly wire: { readonly density: Float32Array; readonly cuts: number } | null
  /** The ground craters reshaped, as rectangles of the map's height and surface samples. */
  readonly ground: readonly GroundPatch[]
  readonly gas: CloudSync
  readonly smoke: CloudSync
}

/** A rectangle of the map's samples, `minColumn`..`maxColumn` by `minRow`..`maxRow`, row by row. */
export interface GroundPatch {
  readonly minColumn: number
  readonly maxColumn: number
  readonly minRow: number
  readonly maxRow: number
  readonly heights: Float32Array
  readonly surfaces: Uint8Array
}

/** Fields of the simulation that never go across: the map and world (sent piecemeal), and what only stepping uses. */
const NOT_SYNCED = new Set([
  "map",
  "world",
  "soldiers",
  "rng",
  "lineOfSight",
  "systemTimer",
  "pendingCommands",
  "capacity",
  "events",
  "tick",
  "wire",
  "gas",
  "smoke"
])

/** Gas and smoke: the grids' concentration while there's any about, and the ground under them when craters changed it. */
export interface CloudSync {
  readonly active: boolean
  readonly concentration: Float32Array | null
  readonly ground: { readonly floor: Float32Array; readonly ground: Float32Array; readonly hollow: Uint8Array } | null
}

type NumberArray = Float32Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array

function isNumberArray(value: unknown): value is NumberArray {
  return (
    value instanceof Float32Array ||
    value instanceof Int32Array ||
    value instanceof Uint8Array ||
    value instanceof Uint16Array ||
    value instanceof Uint32Array ||
    value instanceof Int8Array ||
    value instanceof Int16Array
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isNumberArray(value)
}

/** Every soldier component, by name, in a fixed order: the same on both sides, since both are made by one function. */
function soldierComponents(sim: Simulation): [string, Record<string, unknown>][] {
  return Object.entries(sim.soldiers)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .sort(([a], [b]) => a.localeCompare(b, "en"))
}

/** Every soldier array, in the order they go across. */
function soldierArrays(sim: Simulation): NumberArray[] {
  const arrays: NumberArray[] = []
  for (const [, component] of soldierComponents(sim)) {
    for (const key of Object.keys(component).sort()) {
      const array = component[key]
      if (isNumberArray(array)) {
        arrays.push(array)
      }
    }
  }
  return arrays
}

/**
 * What the sync's packed soldier arrays (`SimSync.arrays`) hold, in order: each array's name, as `component.field`, and
 * its kind of typed array, as `Float32Array` and the like. Each runs `SimSync.soldiers` elements, one after another.
 */
export function soldierArrayLayout(sim: Simulation): readonly { readonly name: string; readonly type: string }[] {
  const layout: { name: string; type: string }[] = []
  for (const [component, fields] of soldierComponents(sim)) {
    for (const key of Object.keys(fields).sort()) {
      const array = fields[key]
      if (isNumberArray(array)) {
        layout.push({ name: `${component}.${key}`, type: array.constructor.name })
      }
    }
  }
  return layout
}

/** A plain copy of a value: typed arrays copied, functions left out, ready to post or to clone. */
function plain(value: unknown): unknown {
  if (isNumberArray(value)) {
    return value.slice()
  }
  if (Array.isArray(value)) {
    return value.map(plain)
  }
  if (isRecord(value)) {
    const copy: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(value)) {
      if (typeof field !== "function") {
        copy[key] = plain(field)
      }
    }
    return copy
  }
  return value
}

/**
 * Writes `source` into `target` in place: typed arrays filled, arrays and objects updated member by member, so anything
 * holding on to part of `target` sees the new state. Functions in `target` are kept. Returns what the slot should hold.
 */
function assign(target: unknown, source: unknown): unknown {
  if (isNumberArray(target) && isNumberArray(source) && target.length === source.length) {
    target.set(source)
    return target
  }
  if (Array.isArray(target) && Array.isArray(source)) {
    for (let index = 0; index < source.length; index++) {
      target[index] = assign(target[index], source[index])
    }
    target.length = source.length
    return target
  }
  if (isRecord(target) && isRecord(source)) {
    for (const [key, field] of Object.entries(source)) {
      target[key] = assign(target[key], field)
    }
    for (const key of Object.keys(target)) {
      if (!(key in source) && typeof target[key] !== "function") {
        delete target[key]
      }
    }
    return target
  }
  return plain(source)
}

function isBurst(event: SimEvent): event is BurstEvent {
  return event.type === "burst"
}

/** The map's samples a changed area covers, row by row; null when it's off the map, as a shell's that fell beyond it. */
function patchOf(sim: Simulation, area: ChangedArea): GroundPatch | null {
  const { map } = sim
  const minColumn = Math.max(0, Math.floor(area.minX / map.cellSize))
  const maxColumn = Math.min(map.columns, Math.ceil(area.maxX / map.cellSize))
  const minRow = Math.max(0, Math.floor(area.minZ / map.cellSize))
  const maxRow = Math.min(map.rows, Math.ceil(area.maxZ / map.cellSize))
  if (maxColumn < minColumn || maxRow < minRow) {
    return null
  }
  const size = (maxColumn - minColumn + 1) * (maxRow - minRow + 1)
  const heights = new Float32Array(size)
  const surfaces = new Uint8Array(size)
  let at = 0
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const sample = sampleIndex(map, column, row)
      heights[at] = map.heights[sample] ?? 0
      surfaces[at] = map.surfaces[sample] ?? 0
      at++
    }
  }
  return { minColumn, maxColumn, minRow, maxRow, heights, surfaces }
}

export interface SyncSource {
  /** Notes what the step just taken changed: call after every step. */
  stepped(): void
  /** What the mirror needs to catch up with every step since the last sync. */
  take(): SimSync
}

/** Follows a running simulation, step by step, for a mirror to keep up with. */
export function createSyncSource(sim: Simulation): SyncSource {
  let steps: { tick: number; events: SimEvent[] }[] = []
  let ground: GroundPatch[] = []
  // The wire as last sent: -1 sends it with the first sync.
  let wireCuts = -1
  // Whether each cloud's grid was last sent empty, and whether the ground under them has been sent at all.
  const quiet = { gas: false, smoke: false }
  let groundSent = false
  const cloud = (name: "gas" | "smoke", reshaped: boolean): CloudSync => {
    const field = sim[name]
    // An empty grid goes once, then not again until there's something in it.
    const send = field.active || !quiet[name]
    quiet[name] = !field.active
    return {
      active: field.active,
      concentration: send ? field.concentration.slice() : null,
      ground: reshaped
        ? { floor: field.floor.slice(), ground: field.ground.slice(), hollow: field.hollow.slice() }
        : null
    }
  }
  return {
    stepped() {
      // Events are plain data already; copied, since the next step clears the array.
      steps.push({ tick: sim.tick, events: [...sim.events] })
      for (const event of sim.events) {
        const patch = isBurst(event) && event.crater ? patchOf(sim, event.crater) : null
        if (patch) {
          ground.push(patch)
        }
      }
    },
    take() {
      const soldiers = Math.max(0, ...Array.from(query(sim.world, [sim.soldiers.position]), (id) => id + 1))
      const arrays = soldierArrays(sim)
      const packed = new ArrayBuffer(arrays.reduce((sum, array) => sum + array.BYTES_PER_ELEMENT * soldiers, 0))
      let offset = 0
      for (const array of arrays) {
        new Uint8Array(packed, offset, array.BYTES_PER_ELEMENT * soldiers).set(
          new Uint8Array(array.buffer, array.byteOffset, array.BYTES_PER_ELEMENT * soldiers)
        )
        offset += array.BYTES_PER_ELEMENT * soldiers
      }
      const members: Record<string, Int32Array> = {}
      for (const [name, component] of soldierComponents(sim)) {
        members[name] = Int32Array.from(query(sim.world, [component]))
      }
      const state: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(sim)) {
        if (!NOT_SYNCED.has(key) && typeof value !== "function") {
          state[key] = plain(value)
        }
      }
      const wire = sim.wire.cuts === wireCuts ? null : { density: sim.wire.density.slice(), cuts: sim.wire.cuts }
      wireCuts = sim.wire.cuts
      const reshaped = ground.length > 0 || !groundSent
      groundSent = true
      const sync: SimSync = {
        tick: sim.tick,
        soldiers,
        arrays: packed,
        members,
        state,
        steps,
        wire,
        ground,
        gas: cloud("gas", reshaped),
        smoke: cloud("smoke", reshaped)
      }
      steps = []
      ground = []
      return sync
    }
  }
}

/** The membership each mirror was last given, by component: most batches change none of it. */
const appliedMembers = new WeakMap<Simulation, Map<string, Int32Array>>()

function sameIds(a: Int32Array | undefined, b: Int32Array): boolean {
  if (!a || a.length !== b.length) {
    return false
  }
  for (let index = 0; index < b.length; index++) {
    if (a[index] !== b[index]) {
      return false
    }
  }
  return true
}

/**
 * Brings a mirror up to date with a sync from the simulation it follows. The mirror must have been made by
 * `createSimulation` on a copy of the same map, and nothing else may step it or add soldiers to it. Its events are the
 * last step's; the earlier steps' are in `sync.steps`, for whatever plays them out step by step.
 */
export function applySync(mirror: Simulation, sync: SimSync): void {
  // Soldiers are only ever added, and handed out in id order: the mirror adds entities until it has the same ones.
  while (sync.soldiers > 0 && !entityExists(mirror.world, sync.soldiers - 1)) {
    addEntity(mirror.world)
  }
  let offset = 0
  for (const array of soldierArrays(mirror)) {
    const bytes = array.BYTES_PER_ELEMENT * sync.soldiers
    new Uint8Array(array.buffer, array.byteOffset, bytes).set(new Uint8Array(sync.arrays, offset, bytes))
    offset += bytes
  }
  let applied = appliedMembers.get(mirror)
  if (!applied) {
    applied = new Map()
    appliedMembers.set(mirror, applied)
  }
  for (const [name, component] of soldierComponents(mirror)) {
    const ids = sync.members[name] ?? new Int32Array()
    // Unchanged since the last sync, as nearly every component is from one batch to the next: nothing to do.
    if (sameIds(applied.get(name), ids)) {
      continue
    }
    applied.set(name, ids.slice())
    const wanted = new Set(ids)
    for (const id of Array.from(query(mirror.world, [component]))) {
      if (!wanted.has(id)) {
        removeComponent(mirror.world, id, component)
      }
    }
    const has = new Set(query(mirror.world, [component]))
    for (const id of wanted) {
      if (!has.has(id)) {
        addComponent(mirror.world, id, component)
      }
    }
  }
  for (const [key, value] of Object.entries(sync.state)) {
    Reflect.set(mirror, key, assign(Reflect.get(mirror, key), value))
  }
  for (const name of ["gas", "smoke"] as const) {
    const field = mirror[name]
    const update = sync[name]
    field.active = update.active
    if (update.concentration) {
      field.concentration.set(update.concentration)
    }
    if (update.ground) {
      field.floor.set(update.ground.floor)
      field.ground.set(update.ground.ground)
      field.hollow.set(update.ground.hollow)
    }
  }
  if (sync.wire) {
    mirror.wire.density.set(sync.wire.density)
    mirror.wire.cuts = sync.wire.cuts
  }
  for (const patch of sync.ground) {
    let at = 0
    for (let row = patch.minRow; row <= patch.maxRow; row++) {
      for (let column = patch.minColumn; column <= patch.maxColumn; column++) {
        const sample = sampleIndex(mirror.map, column, row)
        mirror.map.heights[sample] = patch.heights[at] ?? 0
        mirror.map.surfaces[sample] = patch.surfaces[at] ?? 0
        at++
      }
    }
  }
  const last = sync.steps.at(-1)
  mirror.events.length = 0
  mirror.events.push(...(last?.events ?? []))
  mirror.tick = sync.tick
}
