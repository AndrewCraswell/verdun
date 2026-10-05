import type { BattlefieldMap } from "@verdun/map"
import type { SimSync, WarSchedule } from "@verdun/sim"
import { deflateSync, inflateSync } from "fflate"
import { Packr } from "msgpackr"
import { apply, diff, isPatch, type Patch } from "./delta.ts"
import { type GroundMovement, groundFromMovement } from "./ground-movement.ts"
import { createReckoner, nothingShown, RECKONED_FROM, reckonShown, type Shown } from "./reckoning.ts"
import {
  applyCellPatch,
  type CellGrid,
  cellGrid,
  cellOf,
  type CellPatch,
  cellPatches,
  type SoldierArray,
  soldierArray,
  type SoldierArrays
} from "./soldier-cells.ts"

/** A gas or smoke cloud as players are sent it: its concentration quantized (see `quantize`). */
interface CloudView {
  readonly active: boolean
  readonly concentration: Uint8Array | null
  readonly ground: SimSync["gas"]["ground"]
}

/** What the sync's packed soldier arrays hold, in order: see `soldierArrayLayout`. */
export type ArrayLayout = readonly { readonly name: string; readonly type: string }[]

/**
 * The battle as players have last been sent it, but for the soldiers' arrays: the sync's lasting parts, with the wire
 * and the clouds as last sent rather than null when they haven't changed. Each message sends what changed in it (see
 * delta.ts), never all of it.
 */
interface GlobalView {
  readonly tick: number
  readonly soldiers: number
  /**
   * For each soldier component, by name, a flag a soldier: 1 if he has it. A man gaining or losing one changes a byte,
   * where a list of ids would shift every id after his.
   */
  readonly members: Readonly<Record<string, Uint8Array>>
  readonly state: SimSync["state"]
  readonly wire: SimSync["wire"]
  readonly gas: CloudView
  readonly smoke: CloudView
}

/** The global part of a message: what changed in the global view, then each step's events and the craters since. */
interface GlobalMessage {
  readonly v: Patch | null
  readonly s: SimSync["steps"]
  readonly g: SimSync["ground"]
}

/** What a player is sent on joining: the squad they lead, the war's calendar the battle keeps, and the battle itself. */
export interface Joined {
  readonly playerSquad: number
  readonly schedule: WarSchedule
  /** The whole battle, as the next message will build on it. */
  readonly sync: SimSync
  /** Reads the messages that follow. */
  readonly decoder: SyncDecoder
}

/** Who a message is for, as the server knows them. */
export interface Recipient {
  /**
   * The cells near the player's men, which they're sent every message: the rest are sent `FAR_EVERY` messages apart. A
   * player's cells change only at those messages, so every message builds on exactly what the player has.
   */
  readonly near: ReadonlySet<number>
  /** Their side: they're sent its men, and of the enemy only the men it can see. */
  readonly side: number
  /** The men of their squad, of whom they're sent everything: of other men, only what's drawn (`OWN_SQUAD_ONLY`). */
  readonly own: readonly number[]
}

/** One sync of the battle, encoded once, from which each player's message is made. */
export interface EncodedSync {
  /** The message for `player`. */
  for(player: string, recipient: Recipient): Uint8Array
}

/** By side, the enemy soldiers that side can see now. */
export type SideSight = ReadonlyMap<number, ReadonlySet<number>>

/** The server's side: one for every player at once. */
export interface SyncEncoder {
  /** The map's cells, as players' near cells are counted in. */
  readonly grid: CellGrid
  /**
   * Takes the battle's next sync. Every sync the battle makes must go through here, sent or not, as joining players are
   * welcomed to the last one. Given `sight`, each side is sent only the enemies it can see; without, everyone.
   */
  encode(sync: SimSync, sight?: SideSight | null): EncodedSync
  /**
   * What a player of `side` joining is sent: the battle as of the last message, so the next builds on it, and `ground`,
   * how shells have moved the ground in all (see `groundMovement`). Only once a sync has been encoded.
   */
  welcome(playerSquad: number, side: number, schedule: WarSchedule, ground: GroundMovement | null): Uint8Array
  /** A player has left: their cells are forgotten. */
  forget(player: string): void
}

/** The player's side: follows the messages after the welcome, one by one, in order. */
export interface SyncDecoder {
  decode(bytes: Uint8Array): SimSync
  /**
   * The enemy soldiers the player's side can see, as of the last message, of whom alone it's kept up to date: the rest
   * are where they were last seen, or nowhere. Null when the server sends everyone.
   */
  readonly seen: ReadonlySet<number> | null
}

/** Cells are this many metres a side: Fleury's 600 by 400 m is 24 of them. Finer (50 m) sent no less in the load test, the fighting being where everyone's men are, and took twice as long to encode. */
export const CELL_SIZE = 100
/**
 * The cells farther from all of a player's men than this go to them every `FAR_EVERY` messages: twice a second, as the
 * server sends ten. The page eases every man between his updates (server-host.ts), so the far ones walk, not hop.
 */
export const NEAR_RADIUS = 120
export const FAR_EVERY = 5

/** MessagePack that keeps typed arrays and array buffers as they are, which the battle is made of. */
const packr = new Packr({ moreTypes: true, useRecords: false })

/**
 * Each part of a message goes deflated, once on the server for every player who's sent it, rather than by each
 * connection. The fastest level packs these as small as the default does.
 */
const pack = (value: unknown): Uint8Array => deflateSync(packr.pack(value), { level: 1 })
const unpack = (bytes: Uint8Array): unknown => packr.unpack(inflateSync(bytes))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Gas and smoke go to players as a byte a cell, on a logarithmic scale: 0 is clear air (below `CLOUD_FLOOR`, which the
 * simulation counts as negligible), and each step above is about 7% more, up past anything a barrage makes. What a
 * player does with a cloud (draw it, warn of gas, judge what the smoke hides) needs no finer, and a cloud drifting
 * changes far fewer of these steps than of its exact values.
 */
const CLOUD_FLOOR = 0.05
const CLOUD_STEP = Math.log(2e7) / 254
const CLOUD_LEVELS = Float32Array.from({ length: 256 }, (_, level) =>
  level === 0 ? 0 : CLOUD_FLOOR * Math.exp((level - 1) * CLOUD_STEP)
)

function quantize(concentration: Float32Array): Uint8Array {
  return Uint8Array.from(concentration, (value) =>
    value < CLOUD_FLOOR ? 0 : Math.min(255, 1 + Math.round(Math.log(value / CLOUD_FLOOR) / CLOUD_STEP))
  )
}

function dequantize(levels: Uint8Array): Float32Array {
  return Float32Array.from(levels, (level) => CLOUD_LEVELS[level] ?? 0)
}

/**
 * A cloud's levels as sent, which only move a step from what was last sent if the cloud has moved it two: a cell on the
 * edge between steps would otherwise flicker between them, sent every message. Clearing and filling are sent at once.
 */
function settled(levels: Uint8Array, known: Uint8Array | null): Uint8Array {
  if (!known || known.length !== levels.length) {
    return levels
  }
  return levels.map((level, cell) => {
    const last = known[cell] ?? 0
    return level !== 0 && last !== 0 && Math.abs(level - last) <= 1 ? last : level
  })
}

function cloud(sent: SimSync["gas"], known: CloudView | undefined): CloudView {
  const last = known?.concentration ?? null
  return {
    active: sent.active,
    concentration: sent.concentration ? settled(quantize(sent.concentration), last) : last,
    ground: sent.ground ?? known?.ground ?? null
  }
}

/**
 * Soldiers' values players are sent to no finer than this, as a player could see or the client use: a man's morale,
 * suppression and breath as a hundredth, where he faces to about half a degree. Morale and suppression ebb a little
 * every step; rounded, they're sent when they've changed enough to tell.
 */
const PRECISION: Readonly<Record<string, number>> = {
  "morale.value": 0.01,
  "suppression.value": 0.01,
  "stamina.value": 0.01,
  "facing.x": 0.01,
  "facing.z": 0.01
}

/**
 * Values players are sent coarser than `PRECISION` of other squads' men, which only show in how they're drawn and
 * heard, by thresholds on these steps (a man pinned at 0.6 suppression, broken below 0.25 morale): their own squad's
 * player gets them as they are, for the HUD.
 */
const COARSE: Readonly<Record<string, number>> = {
  "morale.value": 0.05,
  "suppression.value": 0.05
}

/**
 * What only a man's own squad's player is sent of him: what the HUD shows of their own men (breath, rounds, the gas
 * mask's time) and what steering them needs, none of which drawing other men uses. A man's firing is drawn from
 * `weapon.firedAt`, not his cooldown, which counts down every step.
 */
export const OWN_SQUAD_ONLY: ReadonlySet<string> = new Set([
  "aim.since",
  "gasDose.value",
  "mask.at",
  "mask.clearSince",
  "moveOrder.run",
  "moveOrder.x",
  "moveOrder.z",
  "rifleGrenades.count",
  "rifleGrenades.readyAt",
  "shelter.lastShelled",
  "speed.value",
  "stamina.spent",
  "stamina.value",
  "steer.run",
  "steer.x",
  "steer.z",
  "vault.x",
  "vault.z",
  "weapon.cooldown",
  "weapon.reloading",
  "weapon.rounds"
])

/**
 * Where soldiers are goes as 16 bits a coordinate, in steps of `unit` metres: a centimetre on any map up to 655 m, as
 * fine as needed on bigger ones. Half what 32-bit floats take, and positions are the most of what changes.
 */
const POSITIONS = new Set(["position.x", "position.z"])

/** The position's unit for a map `extent` metres across at its widest. */
function positionUnit(extent: number): number {
  return Math.max(0.01, extent / 65_535)
}

/** The packed soldier arrays apart, by name: rounded as `PRECISION` has it, positions in `unit` steps. */
function unpacked(sync: SimSync, layout: ArrayLayout, unit: number): Record<string, SoldierArray> {
  const arrays: Record<string, SoldierArray> = {}
  let offset = 0
  for (const { name, type } of layout) {
    const bytes = soldierArray(type, 0).BYTES_PER_ELEMENT * sync.soldiers
    const raw = soldierArray(type, sync.soldiers)
    new Uint8Array(raw.buffer).set(new Uint8Array(sync.arrays, offset, bytes))
    offset += bytes
    const precision = PRECISION[name]
    if (POSITIONS.has(name)) {
      arrays[name] = Uint16Array.from(raw, (metres) => Math.min(65_535, Math.max(0, Math.round(metres / unit))))
    } else if (precision && raw instanceof Float32Array) {
      arrays[name] = raw.map((value) => Math.round(value / precision) * precision)
    } else {
      arrays[name] = raw
    }
  }
  return arrays
}

/**
 * The soldier arrays packed again, in the layout's order, as the mirror takes them in: where each man is and which way
 * he faces as `mirrored` shows him, the player's own men's `COARSE` values as they are, the rest as sent.
 */
function packed(mirrored: Mirrored, layout: ArrayLayout, soldiers: number): ArrayBuffer {
  const { arrays, shown, own, exact } = mirrored
  const fromShown: Readonly<Record<string, Float32Array>> = {
    "position.x": shown.x,
    "position.z": shown.z,
    "facing.x": shown.facingX,
    "facing.z": shown.facingZ
  }
  const parts = layout.map(({ name, type }) => {
    let array = fromShown[name] ?? arrays[name]
    if (!array) {
      throw new TypeError(`The battle as sent has no ${name}`)
    }
    const ownValues = name in COARSE ? exact[name] : undefined
    if (ownValues) {
      array = array.slice()
      for (const soldier of own) {
        array[soldier] = ownValues[soldier] ?? 0
      }
    }
    const sized = soldierArray(type, soldiers)
    sized.set(array.subarray(0, soldiers))
    return new Uint8Array(sized.buffer)
  })
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes.buffer
}

function globalOf(sync: SimSync, known: GlobalView | null): GlobalView {
  const members: Record<string, Uint8Array> = {}
  for (const [name, ids] of Object.entries(sync.members)) {
    const flags = new Uint8Array(sync.soldiers)
    for (const soldier of ids) {
      flags[soldier] = 1
    }
    members[name] = flags
  }
  return {
    tick: sync.tick,
    soldiers: sync.soldiers,
    members,
    state: sync.state,
    wire: sync.wire ?? known?.wire ?? null,
    gas: cloud(sync.gas, known?.gas),
    smoke: cloud(sync.smoke, known?.smoke)
  }
}

/** The patch for one field of whatever `patch` patches: all of it if `patch` replaces it whole, none if untouched. */
function field(patch: Patch | null | undefined, key: string): Patch | null {
  if (!patch) {
    return null
  }
  if ("f" in patch) {
    return isRecord(patch.f) && key in patch.f ? { f: patch.f[key] } : null
  }
  return "o" in patch ? (patch.o[key] ?? null) : null
}

/** How a battle is sent, which a player is told on joining. */
interface Format {
  readonly layout: ArrayLayout
  readonly unit: number
}

/** Each component's soldiers, by id, from its flags. */
function membersOf(view: GlobalView): SimSync["members"] {
  return Object.fromEntries(
    Object.entries(view.members).map(([name, flags]) => [
      name,
      Int32Array.from(flags.keys()).filter((soldier) => flags[soldier] === 1)
    ])
  )
}

/**
 * The sync for the mirror, from the views as they now stand: the wire and the clouds only where they changed,
 * `members`, each component's soldiers (`membersOf`), and the soldiers as `mirrored` has them.
 */
function syncOf(
  view: GlobalView,
  mirrored: Mirrored,
  format: Format,
  patch: Patch | null,
  message: Pick<GlobalMessage, "s" | "g">,
  members: SimSync["members"]
): SimSync {
  const clouds = (name: "gas" | "smoke") => {
    const changed = field(patch, name)
    const concentration = view[name].concentration
    return {
      active: view[name].active,
      concentration: field(changed, "concentration") && concentration ? dequantize(concentration) : null,
      ground: field(changed, "ground") ? view[name].ground : null
    }
  }
  return {
    tick: view.tick,
    soldiers: view.soldiers,
    arrays: packed(mirrored, format.layout, view.soldiers),
    members,
    state: view.state,
    wire: field(patch, "wire") ? view.wire : null,
    gas: clouds("gas"),
    smoke: clouds("smoke"),
    steps: message.s,
    ground: message.g
  }
}

function isGlobalView(value: unknown): value is GlobalView {
  return (
    isRecord(value) &&
    typeof value["tick"] === "number" &&
    typeof value["soldiers"] === "number" &&
    isRecord(value["members"]) &&
    Object.values(value["members"]).every((flags) => flags instanceof Uint8Array) &&
    isRecord(value["state"]) &&
    isRecord(value["gas"]) &&
    isRecord(value["smoke"])
  )
}

function isGlobalMessage(value: unknown): value is GlobalMessage {
  return (
    isRecord(value) &&
    (value["v"] === null || isPatch(value["v"])) &&
    Array.isArray(value["s"]) &&
    Array.isArray(value["g"])
  )
}

function isSchedule(value: unknown): value is WarSchedule {
  return (
    isRecord(value) &&
    Number.isFinite(value["begins"]) &&
    Number.isFinite(value["breakDays"]) &&
    Number.isFinite(value["standToMinutes"])
  )
}

function isLayout(value: unknown): value is ArrayLayout {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && typeof entry["name"] === "string" && typeof entry["type"] === "string")
  )
}

function isArrays(value: unknown): value is Record<string, SoldierArray> {
  return (
    isRecord(value) && Object.values(value).every((array) => ArrayBuffer.isView(array) && !(array instanceof DataView))
  )
}

/** Each soldier's cell, from his position in `unit` steps. */
function cellsOf(arrays: SoldierArrays, grid: CellGrid, unit: number, soldiers: number): Int32Array {
  const xs = arrays["position.x"]
  const zs = arrays["position.z"]
  return Int32Array.from({ length: soldiers }, (_, soldier) =>
    cellOf(grid, (xs?.[soldier] ?? 0) * unit, (zs?.[soldier] ?? 0) * unit)
  )
}

/** The perspective when sides aren't told apart: everyone is sent every soldier. */
const EVERYONE = -1

/** A side's share of a message: its men's cells, with the enemies it can see, and who came into or out of its sight. */
interface SideParts {
  readonly near: Map<number, CellPatch>
  readonly far: Map<number, CellPatch>
  readonly changedCells: ReadonlySet<number>
  readonly nearParts: Map<number, Uint8Array>
  readonly farParts: Map<number, Uint8Array>
  readonly seen: Uint8Array | null
}

/** The soldiers marked in `sent` who weren't in `before`: men a side has just come to see, who go whole. */
function newlySent(sent: Uint8Array, before: Uint8Array | undefined): Set<number> {
  const found = new Set<number>()
  if (before) {
    for (let soldier = 0; soldier < Math.min(sent.length, before.length); soldier++) {
      if (sent[soldier] === 1 && before[soldier] !== 1) {
        found.add(soldier)
      }
    }
  }
  return found
}

/** What only a player's own men are sent: their `OWN_SQUAD_ONLY` values, and where they are and face, exactly. */
const OWN_ARRAYS: readonly string[] = [...OWN_SQUAD_ONLY, ...RECKONED_FROM, ...Object.keys(COARSE)]

/** What a player keeps of their own men apart from the arrays the cells patch: they're shown as they are. */
const isExact = (name: string) => RECKONED_FROM.has(name) || name in COARSE

/** What a player's own men's `OWN_ARRAYS` values changed by, or all of them for men new to their squad. */
function ownPatch(
  previous: SoldierArrays | null,
  next: SoldierArrays,
  own: readonly number[],
  had: ReadonlySet<number> | undefined
): CellPatch | null {
  const patch: Record<string, readonly [Uint16Array, SoldierArray]> = {}
  for (const name of OWN_ARRAYS) {
    const values = next[name]
    if (!values) {
      continue
    }
    const before = previous?.[name]
    const ids = own.filter(
      (soldier) =>
        soldier < values.length &&
        (!had?.has(soldier) || !before || soldier >= before.length || !Object.is(before[soldier], values[soldier]))
    )
    if (ids.length > 0) {
      const changed = soldierArray(values.constructor.name, ids.length)
      ids.forEach((soldier, at) => {
        changed[at] = values[soldier] ?? 0
      })
      patch[name] = [Uint16Array.from(ids), changed]
    }
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * `layout` is what the battle's syncs pack into `SimSync.arrays` (its `soldierArrayLayout`); `width` and `depth` are
 * the map's, in metres, cut into cells `cellSize` metres a side.
 */
export function createSyncEncoder(
  layout: ArrayLayout,
  width: number,
  depth: number,
  cellSize = CELL_SIZE
): SyncEncoder {
  const grid = cellGrid(width, depth, cellSize)
  const unit = positionUnit(Math.max(width, depth))
  const reckoner = createReckoner(unit)
  let global: GlobalView | null = null
  // The soldiers' arrays as sent (each man's position and facing reckoned), and as they are.
  let arrays: SoldierArrays | null = null
  let actual: SoldierArrays | null = null
  let cells: Int32Array = new Int32Array(0)
  // The soldiers as of the last message far cells were sent at, which the next builds on.
  let farBase: SoldierArrays | null = null
  let messages = 0
  // By side (or EVERYONE), which soldiers it was sent in the last message and at the last far turn, 1 or 0 each, and
  // the enemies it could see, in order.
  const sentTo = new Map<number, Uint8Array>()
  const farSentTo = new Map<number, Uint8Array>()
  const seenBy = new Map<number, Int32Array>()
  // Each player's near cells, set at the last message far cells were sent at; absent for a player who joined since,
  // who is sent every cell every message until the next.
  const nearFor = new Map<string, ReadonlySet<number>>()
  // Each player's own men as of their last message: men new to their squad are sent whole.
  const ownFor = new Map<string, ReadonlySet<number>>()

  return {
    grid,
    encode(sync, sight = null) {
      const nextGlobal = globalOf(sync, global)
      const globalPart = pack({ v: diff(global, nextGlobal), s: sync.steps, g: sync.ground })
      global = nextGlobal
      const previous = arrays
      const previousActual = actual
      const nextActual = unpacked(sync, layout, unit)
      // Where men are and which way they face go reckoned (reckoning.ts).
      const next: Record<string, SoldierArray> = reckoner.reckon(nextActual, sync.tick, sync.soldiers)
      for (const [name, values] of Object.entries(nextActual)) {
        const step = COARSE[name]
        if (step && values instanceof Float32Array) {
          next[name] = values.map((value) => Math.round(value / step) * step)
        } else if (!RECKONED_FROM.has(name)) {
          next[name] = values
        }
      }
      // Cells carry what's drawn of every man; the rest goes to his own squad's player alone.
      const drawn: Record<string, SoldierArray> = {}
      for (const [name, values] of Object.entries(next)) {
        if (!OWN_SQUAD_ONLY.has(name)) {
          drawn[name] = values
        }
      }
      const nextCells = cellsOf(nextActual, grid, unit, sync.soldiers)
      // A man who's crossed into another cell goes whole, for the players who follow it and didn't follow him before.
      const crossed = new Set<number>()
      nextCells.forEach((cell, soldier) => {
        if (soldier < cells.length && cells[soldier] !== cell) {
          crossed.add(soldier)
        }
      })
      const farTurn = messages % FAR_EVERY === 0
      const sides = new Map<number, SideParts>()
      const sideOf = next["side.value"]
      for (const perspective of sight ? sight.keys() : [EVERYONE]) {
        const enemies = sight?.get(perspective)
        const sent = new Uint8Array(sync.soldiers)
        for (let soldier = 0; soldier < sync.soldiers; soldier++) {
          sent[soldier] = !enemies || sideOf?.[soldier] === perspective || enemies.has(soldier) ? 1 : 0
        }
        // Men the side has just come to see go whole, as men crossing into a cell do.
        const near = cellPatches(
          previous,
          drawn,
          nextCells,
          new Set([...crossed, ...newlySent(sent, sentTo.get(perspective))]),
          sent
        )
        const far = farTurn
          ? cellPatches(farBase, drawn, nextCells, newlySent(sent, farSentTo.get(perspective)), sent)
          : new Map<number, CellPatch>()
        sentTo.set(perspective, sent)
        if (farTurn) {
          farSentTo.set(perspective, sent)
        }
        let seen: Uint8Array | null = null
        if (enemies) {
          const now = Int32Array.from(enemies).sort()
          const was = new Set(seenBy.get(perspective) ?? [])
          const added = now.filter((soldier) => !was.delete(soldier))
          if (added.length > 0 || was.size > 0) {
            seen = pack({ a: added, r: Int32Array.from(was) })
          }
          seenBy.set(perspective, now)
        }
        sides.set(perspective, {
          near,
          far,
          changedCells: new Set([...near.keys(), ...far.keys()]),
          nearParts: new Map(),
          farParts: new Map(),
          seen
        })
      }
      arrays = next
      actual = nextActual
      cells = nextCells
      if (farTurn) {
        farBase = next
      }
      messages++
      const partOf = (store: Map<number, Uint8Array>, patches: Map<number, CellPatch>, cell: number) => {
        let part = store.get(cell)
        const patch = patches.get(cell)
        if (!part && patch) {
          part = pack(patch)
          store.set(cell, part)
        }
        return part
      }
      return {
        for(player, { near: wanted, side, own }) {
          const parts = sides.get(sight ? side : EVERYONE)
          if (!parts) {
            throw new Error(`The battle's sight has no side ${side}`)
          }
          const followed = nearFor.get(player)
          const cellParts: [number, Uint8Array][] = []
          for (const cell of parts.changedCells) {
            const part =
              !followed || followed.has(cell)
                ? partOf(parts.nearParts, parts.near, cell)
                : farTurn && partOf(parts.farParts, parts.far, cell)
            if (part) {
              cellParts.push([cell, part])
            }
          }
          if (farTurn) {
            nearFor.set(player, wanted)
          }
          const had = ownFor.get(player)
          const mine = ownPatch(previousActual, nextActual, own, had)
          // Who the player's own men are, when that's changed: they're shown as they are, not reckoned.
          const ownChanged = !had || had.size !== own.length || own.some((soldier) => !had.has(soldier))
          ownFor.set(player, new Set(own))
          return packr.pack({
            g: globalPart,
            c: cellParts,
            ...(parts.seen ? { k: parts.seen } : {}),
            ...(mine ? { p: mine } : {}),
            ...(ownChanged ? { o: Int32Array.from(own) } : {})
          })
        }
      }
    },
    welcome(playerSquad, side, schedule, ground) {
      if (!global || !arrays) {
        throw new Error("A player can't be welcomed before the battle's first sync")
      }
      // Of the enemy their side can't see, a newcomer isn't told where they are.
      const sent = sentTo.get(side) ?? sentTo.get(EVERYONE)
      const told: Record<string, SoldierArray> = { ...arrays }
      for (const name of ["anchor.x", "anchor.z", "pace.x", "pace.z"]) {
        const values = arrays[name]
        if (values && sent) {
          told[name] = values.map((value, soldier) => (sent[soldier] === 1 ? value : 0))
        }
      }
      const seen = seenBy.get(side) ?? null
      return pack({ playerSquad, side, schedule, layout, unit, view: global, arrays: told, seen, ground })
    },
    forget(player) {
      nearFor.delete(player)
      ownFor.delete(player)
    }
  }
}

function isSeenChange(value: unknown): value is { readonly a: Int32Array; readonly r: Int32Array } {
  return isRecord(value) && value["a"] instanceof Int32Array && value["r"] instanceof Int32Array
}

/** A player's copy of the battle's soldiers as sent, from which their mirror's arrays are made. */
interface Mirrored {
  /** The soldiers' arrays as sent: positions and facing reckoned. */
  readonly arrays: Record<string, SoldierArray>
  /** The player's own men's positions (in the position's units), facing and `COARSE` values, as they are. */
  readonly exact: Record<string, SoldierArray>
  own: ReadonlySet<number>
  /** The enemy the player's side can see; null when everyone is sent. */
  seen: Set<number> | null
  /** The player's side. */
  readonly side: number
  shown: Shown
}

/** Works out where `mirrored` shows each man at `tick`: the enemy out of sight left where they were last seen. */
function show(mirrored: Mirrored, unit: number, tick: number, soldiers: number): void {
  const sides = mirrored.arrays["side.value"]
  const { seen } = mirrored
  mirrored.shown = reckonShown(
    mirrored.shown,
    mirrored.arrays,
    unit,
    tick,
    soldiers,
    (soldier) => seen !== null && sides?.[soldier] !== mirrored.side && !seen.has(soldier),
    { has: (soldier) => mirrored.own.has(soldier), arrays: mirrored.exact }
  )
}

function decoderFrom(start: GlobalView, mirrored: Mirrored, format: Format): SyncDecoder {
  let view = start
  const { arrays, exact } = mirrored
  let members = membersOf(start)
  return {
    get seen() {
      return mirrored.seen
    },
    decode(bytes) {
      const message: unknown = packr.unpack(bytes)
      if (!isRecord(message) || !(message["g"] instanceof Uint8Array) || !Array.isArray(message["c"])) {
        throw new TypeError("The server sent a sync this client can't read")
      }
      const globalPart = unpack(message["g"])
      if (!isGlobalMessage(globalPart)) {
        throw new TypeError("The server sent a sync this client can't read")
      }
      const next: unknown = globalPart.v ? apply(view, globalPart.v) : view
      if (!isGlobalView(next)) {
        throw new TypeError("The server's sync doesn't fit the battle this client has")
      }
      view = next
      for (const part of message["c"]) {
        if (!Array.isArray(part) || !(part[1] instanceof Uint8Array)) {
          throw new TypeError("The server sent a cell this client can't read")
        }
        applyCellPatch(arrays, unpack(part[1]), view.soldiers)
      }
      const own = message["p"]
      if (own !== undefined) {
        if (!isRecord(own)) {
          throw new TypeError("A cell's changes aren't a record")
        }
        // What's shown of the own men as they are goes apart; the rest as the arrays have it.
        const exactPart: Record<string, unknown> = {}
        const rest: Record<string, unknown> = {}
        for (const [name, change] of Object.entries(own)) {
          if (isExact(name)) {
            exactPart[name] = change
          } else {
            rest[name] = change
          }
        }
        applyCellPatch(exact, exactPart, view.soldiers)
        applyCellPatch(arrays, rest, view.soldiers)
      }
      if (message["o"] !== undefined) {
        if (!(message["o"] instanceof Int32Array)) {
          throw new TypeError("The server sent a squad this client can't read")
        }
        mirrored.own = new Set(message["o"])
      }
      if (message["k"] !== undefined) {
        const change = message["k"] instanceof Uint8Array ? unpack(message["k"]) : null
        if (!isSeenChange(change)) {
          throw new TypeError("The server sent a sight this client can't read")
        }
        const seen = mirrored.seen ?? new Set()
        for (const soldier of change.r) {
          seen.delete(soldier)
        }
        for (const soldier of change.a) {
          seen.add(soldier)
        }
        mirrored.seen = seen
      }
      // Most messages change no one's components: the last ids serve.
      if (field(globalPart.v, "members")) {
        members = membersOf(view)
      }
      show(mirrored, format.unit, view.tick, view.soldiers)
      return syncOf(view, mirrored, format, globalPart.v, globalPart, members)
    }
  }
}

function isMovement(value: unknown): value is GroundMovement {
  return (
    isRecord(value) &&
    typeof value["minColumn"] === "number" &&
    typeof value["maxColumn"] === "number" &&
    typeof value["minRow"] === "number" &&
    typeof value["maxRow"] === "number" &&
    value["moved"] instanceof Int16Array &&
    value["surfaces"] instanceof Uint8Array
  )
}

/** Reads the welcome to a battle fought on `map`, which the player has generated as the server did, unshelled. */
export function decodeJoined(bytes: Uint8Array, map: BattlefieldMap): Joined {
  const welcome: unknown = unpack(bytes)
  if (
    !isRecord(welcome) ||
    typeof welcome["playerSquad"] !== "number" ||
    !isSchedule(welcome["schedule"]) ||
    !isLayout(welcome["layout"]) ||
    typeof welcome["unit"] !== "number" ||
    !isGlobalView(welcome["view"]) ||
    !isArrays(welcome["arrays"]) ||
    typeof welcome["side"] !== "number" ||
    !(welcome["seen"] === null || welcome["seen"] instanceof Int32Array) ||
    !(welcome["ground"] === null || isMovement(welcome["ground"]))
  ) {
    throw new TypeError("The server sent a welcome this client can't read")
  }
  const { layout, unit, view, arrays, seen, ground } = welcome
  const format = { layout, unit }
  const mirrored: Mirrored = {
    arrays,
    exact: {
      "position.x": new Uint16Array(0),
      "position.z": new Uint16Array(0),
      "facing.x": new Float32Array(0),
      "facing.z": new Float32Array(0),
      "morale.value": new Float32Array(0),
      "suppression.value": new Float32Array(0)
    },
    own: new Set(),
    seen: seen ? new Set(seen) : null,
    side: welcome["side"],
    shown: nothingShown()
  }
  show(mirrored, unit, view.tick, view.soldiers)
  return {
    playerSquad: welcome["playerSquad"],
    schedule: welcome["schedule"],
    sync: syncOf(
      view,
      mirrored,
      format,
      { f: view },
      { s: [], g: ground ? [groundFromMovement(map, ground)] : [] },
      membersOf(view)
    ),
    decoder: decoderFrom(view, mirrored, format)
  }
}
