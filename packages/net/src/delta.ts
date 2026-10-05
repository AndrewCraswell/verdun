/**
 * What changed between two values of the same shape, and putting it back: so the server sends each player only what
 * changed in the battle since the last message, rather than all of it.
 *
 * A patch mirrors the value's shape, leaving out whatever didn't change:
 * - `{ f: value }` replaces the value whole: anything new, or whose shape or type changed.
 * - `{ o: { key: patch }, d: [key] }` patches a record's changed fields and drops its removed ones (`d`, if any).
 * - `{ a: { index: patch } }` patches an array of the same length, element by element.
 * - `{ t: [[start, values], …] }` writes runs of new values into a typed array (or an ArrayBuffer, as bytes) of the
 *   same type and length, `start` counted in elements.
 */
export type Patch =
  | { readonly f: unknown }
  | { readonly o: Readonly<Record<string, Patch>>; readonly d?: readonly string[] }
  | { readonly a: Readonly<Record<string, Patch>> }
  | { readonly t: readonly (readonly [number, TypedArray])[] }

type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Uint8ClampedArray

/** Changed elements this close together go in one run: a run's own overhead costs more than a few unchanged ones. */
const RUN_GAP = 8

function isTyped(value: unknown): value is TypedArray {
  return ArrayBuffer.isView(value) && !(value instanceof DataView)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof ArrayBuffer)
  )
}

/** The changed runs between two typed arrays of the same type and length, or null if they're the same. */
function runs(previous: TypedArray, next: TypedArray): [number, TypedArray][] | null {
  const found: [number, TypedArray][] = []
  let start = -1
  let end = -1
  const close = () => {
    if (start >= 0) {
      found.push([start, next.slice(start, end + 1)])
    }
  }
  for (let index = 0; index < next.length; index++) {
    if (!Object.is(previous[index], next[index])) {
      if (start >= 0 && index - end > RUN_GAP) {
        close()
        start = -1
      }
      if (start < 0) {
        start = index
      }
      end = index
    }
  }
  close()
  return found.length > 0 ? found : null
}

/** What changed from `previous` to `next`, or null if nothing did. */
export function diff(previous: unknown, next: unknown): Patch | null {
  if (Object.is(previous, next)) {
    return null
  }
  if (previous instanceof ArrayBuffer && next instanceof ArrayBuffer && previous.byteLength === next.byteLength) {
    const changed = runs(new Uint8Array(previous), new Uint8Array(next))
    return changed ? { t: changed } : null
  }
  if (
    isTyped(previous) &&
    isTyped(next) &&
    previous.constructor === next.constructor &&
    previous.length === next.length
  ) {
    const changed = runs(previous, next)
    return changed ? { t: changed } : null
  }
  if (Array.isArray(previous) && Array.isArray(next) && previous.length === next.length) {
    const changed: Record<string, Patch> = {}
    let any = false
    next.forEach((element, index) => {
      const patch = diff(previous[index], element)
      if (patch) {
        changed[index] = patch
        any = true
      }
    })
    return any ? { a: changed } : null
  }
  if (isRecord(previous) && isRecord(next)) {
    const changed: Record<string, Patch> = {}
    let any = false
    for (const [key, value] of Object.entries(next)) {
      const patch = key in previous ? diff(previous[key], value) : { f: value }
      if (patch) {
        changed[key] = patch
        any = true
      }
    }
    const removed = Object.keys(previous).filter((key) => !(key in next))
    if (!any && removed.length === 0) {
      return null
    }
    return removed.length > 0 ? { o: changed, d: removed } : { o: changed }
  }
  return { f: next }
}

function isPatch(value: unknown): value is Patch {
  return isRecord(value) && ("f" in value || "o" in value || "a" in value || "t" in value)
}

function patches(value: unknown): Record<string, Patch> {
  if (!isRecord(value)) {
    throw new TypeError("A patch's fields aren't a record")
  }
  const checked: Record<string, Patch> = {}
  for (const [key, patch] of Object.entries(value)) {
    if (!isPatch(patch)) {
      throw new TypeError(`The patch for ${key} isn't one`)
    }
    checked[key] = patch
  }
  return checked
}

/** A copy of a typed array or an array buffer's bytes, to write runs into; null for anything else. */
function writable(previous: unknown): TypedArray | null {
  if (previous instanceof ArrayBuffer) {
    return new Uint8Array(previous.slice(0))
  }
  return isTyped(previous) ? previous.slice() : null
}

/**
 * `previous` with `patch` applied, as a new value: `previous` is left as it was. The patch comes from the network, so
 * it's checked as it's applied.
 */
export function apply(previous: unknown, patch: unknown): unknown {
  if (!isPatch(patch)) {
    throw new TypeError("A patch isn't one")
  }
  if ("f" in patch) {
    return patch.f
  }
  if ("t" in patch) {
    const target = writable(previous)
    if (!target || !Array.isArray(patch.t)) {
      throw new TypeError("A patch of runs for something that isn't a typed array")
    }
    for (const run of patch.t) {
      const [start, values] = run
      if (typeof start !== "number" || !isTyped(values)) {
        throw new TypeError("A run of new values isn't one")
      }
      target.set(values, start)
    }
    return previous instanceof ArrayBuffer ? target.buffer : target
  }
  if ("a" in patch) {
    if (!Array.isArray(previous)) {
      throw new TypeError("An array's patch for something that isn't an array")
    }
    const next = [...previous]
    for (const [index, element] of Object.entries(patches(patch.a))) {
      next[Number(index)] = apply(previous[Number(index)], element)
    }
    return next
  }
  if (!isRecord(previous)) {
    throw new TypeError("A record's patch for something that isn't a record")
  }
  const next: Record<string, unknown> = { ...previous }
  for (const [key, field] of Object.entries(patches(patch.o))) {
    next[key] = apply(previous[key], field)
  }
  for (const key of Array.isArray(patch.d) ? patch.d : []) {
    delete next[key]
  }
  return next
}
