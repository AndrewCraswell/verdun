/**
 * The soldiers' arrays, sent by the map's cells: what changed for the men in each cell, encoded once and sent to every
 * player who needs it. A player is sent the cells near their own men every message and the rest less often
 * (sync-codec.ts), which is most of what keeps a big battle's messages small: soldiers are most of what a battle sends.
 */

/** The kinds of typed array the soldiers' arrays are (see `soldierArrayLayout`). */
export type SoldierArray = Float32Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array

/** The soldiers' arrays, by name, as `component.field`. */
export type SoldierArrays = Readonly<Record<string, SoldierArray>>

/** One cell's changes: for each array with any, the ids of the soldiers whose value changed, and the new values. */
export type CellPatch = Readonly<Record<string, readonly [Uint16Array, SoldierArray]>>

/** The kinds of typed array soldiers' arrays come in, by name. */
const KINDS: Readonly<Record<string, new (length: number) => SoldierArray>> = {
  Float32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array
}

function isSoldierArray(value: unknown): value is SoldierArray {
  return Object.values(KINDS).some((Kind) => value instanceof Kind)
}

/** A new soldier array of the kind named, `length` long. */
export function soldierArray(type: string, length: number): SoldierArray {
  const Kind = KINDS[type]
  if (!Kind) {
    throw new TypeError(`The soldiers' arrays hold a ${type}, which can't be sent`)
  }
  return new Kind(length)
}

/** The map cut into square cells, `size` metres a side, row by row from the north-west. */
export interface CellGrid {
  readonly size: number
  readonly columns: number
  readonly rows: number
}

export function cellGrid(width: number, depth: number, size: number): CellGrid {
  return { size, columns: Math.max(1, Math.ceil(width / size)), rows: Math.max(1, Math.ceil(depth / size)) }
}

/** The cell a point is in; points off the map go to the nearest cell. */
export function cellOf(grid: CellGrid, x: number, z: number): number {
  const column = Math.min(grid.columns - 1, Math.max(0, Math.floor(x / grid.size)))
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(z / grid.size)))
  return row * grid.columns + column
}

/** Every cell any part of which is within `radius` of one of `points`. */
export function cellsNear(
  grid: CellGrid,
  points: readonly { readonly x: number; readonly z: number }[],
  radius: number
): Set<number> {
  const cells = new Set<number>()
  for (const { x, z } of points) {
    const first = cellOf(grid, x - radius, z - radius)
    const last = cellOf(grid, x + radius, z + radius)
    for (let row = Math.floor(first / grid.columns); row <= Math.floor(last / grid.columns); row++) {
      for (let column = first % grid.columns; column <= last % grid.columns; column++) {
        // The nearest point of the cell to (x, z).
        const dx = Math.max(column * grid.size - x, 0, x - (column + 1) * grid.size)
        const dz = Math.max(row * grid.size - z, 0, z - (row + 1) * grid.size)
        if (dx * dx + dz * dz <= radius * radius) {
          cells.add(row * grid.columns + column)
        }
      }
    }
  }
  return cells
}

/**
 * What changed from `previous` to `next`, by the cell each soldier is in (`cells`, by soldier). Soldiers listed in
 * `whole` go with every array, changed or not: men who've just crossed into a cell, whom some players have only now
 * begun to follow. `previous` null sends everything.
 */
export function cellPatches(
  previous: SoldierArrays | null,
  next: SoldierArrays,
  cells: Int32Array,
  whole: ReadonlySet<number> = new Set()
): Map<number, CellPatch> {
  const found = new Map<number, Record<string, [number[], number[]]>>()
  for (const [name, values] of Object.entries(next)) {
    const before = previous?.[name]
    for (let soldier = 0; soldier < values.length; soldier++) {
      const value = values[soldier] ?? 0
      if (before && soldier < before.length && Object.is(before[soldier], value) && !whole.has(soldier)) {
        continue
      }
      const cell = cells[soldier] ?? 0
      let patch = found.get(cell)
      if (!patch) {
        patch = {}
        found.set(cell, patch)
      }
      let changed = patch[name]
      if (!changed) {
        changed = [[], []]
        patch[name] = changed
      }
      changed[0].push(soldier)
      changed[1].push(value)
    }
  }
  const patches = new Map<number, CellPatch>()
  for (const [cell, patch] of found) {
    const typed: Record<string, readonly [Uint16Array, SoldierArray]> = {}
    for (const [name, [ids, values]] of Object.entries(patch)) {
      const kind = next[name]?.constructor.name ?? "Float32Array"
      const array = soldierArray(kind, values.length)
      array.set(values)
      typed[name] = [Uint16Array.from(ids), array]
    }
    patches.set(cell, typed)
  }
  return patches
}

/** Writes a cell's changes into `arrays`, lengthening any shorter than `soldiers`. */
export function applyCellPatch(arrays: Record<string, SoldierArray>, patch: unknown, soldiers: number): void {
  if (typeof patch !== "object" || patch === null) {
    throw new TypeError("A cell's changes aren't a record")
  }
  for (const [name, change] of Object.entries(patch)) {
    const target = arrays[name]
    if (!target || !Array.isArray(change) || !(change[0] instanceof Uint16Array) || !isSoldierArray(change[1])) {
      throw new TypeError(`A cell's changes to ${name} don't fit the battle`)
    }
    let array = target
    if (array.length < soldiers) {
      array = soldierArray(target.constructor.name, soldiers)
      array.set(target)
      arrays[name] = array
    }
    const [ids, values] = change
    ids.forEach((soldier, at) => {
      array[soldier] = values[at] ?? 0
    })
  }
}
