/**
 * The player's keys: which key does what, rebindable in the menu and kept between visits. Keys are named by
 * `KeyboardEvent.code`, so they stay in place whatever the keyboard's layout.
 *
 * Each action has a canonical code, its default key, and the input modules still speak in those: a pressed key is
 * turned into its action's canonical code (`canonical`) before they look at it, so rebinding never touches their logic.
 * Mouse buttons, Esc, the slot digits and the dev tools' keys are fixed and not in here.
 */

export type KeyAction =
  | "forward"
  | "left"
  | "back"
  | "right"
  | "run"
  | "throw"
  | "crouch"
  | "prone"
  | "next-soldier"
  | "follow"
  | "hold"
  | "advance"
  | "take-over"
  | "bombard"
  | "fire-mission"
  | "gas"
  | "whistle"
  | "pan-forward"
  | "pan-back"
  | "pan-left"
  | "pan-right"
  | "recentre"
  | "overview"
  | "pause"
  | "fog"
  | "sector-map"
  | "squad-book"

interface KeyActionInfo {
  readonly action: KeyAction
  /** What it does, as the controls list says it. */
  readonly label: string
  /** Its default keys, the first its canonical code. */
  readonly keys: readonly string[]
}

interface KeyGroup {
  readonly title: string
  readonly actions: readonly KeyActionInfo[]
}

/** Every rebindable action, grouped as the controls list shows them, with its default keys. */
export const KEY_GROUPS: readonly KeyGroup[] = [
  {
    title: "Your soldier",
    actions: [
      { action: "forward", label: "Move forward", keys: ["KeyW"] },
      { action: "left", label: "Move left", keys: ["KeyA"] },
      { action: "back", label: "Move back", keys: ["KeyS"] },
      { action: "right", label: "Move right", keys: ["KeyD"] },
      { action: "run", label: "Run, while you have the breath", keys: ["ShiftLeft", "ShiftRight"] },
      { action: "throw", label: "Hold to aim a grenade at the pointer, let go to throw", keys: ["KeyQ"] },
      { action: "crouch", label: "Crouch, or stand back up", keys: ["KeyC"] },
      { action: "prone", label: "Lie down and crawl, or get back up", keys: ["KeyZ"] }
    ]
  },
  {
    title: "Your squad",
    actions: [
      { action: "next-soldier", label: "Switch to the next soldier", keys: ["Tab"] },
      { action: "follow", label: "Squad order: follow me", keys: ["KeyF"] },
      { action: "hold", label: "Squad order: hold", keys: ["KeyH"] },
      { action: "advance", label: "Squad order: advance to the point under the pointer", keys: ["KeyE"] },
      { action: "take-over", label: "Take over the nearest squad, when yours is lost", keys: ["KeyT"] }
    ]
  },
  {
    title: "Artillery and the attack",
    actions: [
      { action: "bombard", label: "Bombard the enemy line and cut its wire, for two minutes", keys: ["KeyB"] },
      { action: "fire-mission", label: "Call artillery onto the point under the pointer", keys: ["KeyV"] },
      { action: "gas", label: "Call a gas shoot onto the point under the pointer", keys: ["KeyX"] },
      { action: "whistle", label: "Whistle: every squad attacks behind a creeping barrage", keys: ["KeyG"] }
    ]
  },
  {
    title: "Camera",
    actions: [
      { action: "pan-forward", label: "Pan forward", keys: ["ArrowUp"] },
      { action: "pan-back", label: "Pan back", keys: ["ArrowDown"] },
      { action: "pan-left", label: "Pan left; with Shift, turn", keys: ["ArrowLeft"] },
      { action: "pan-right", label: "Pan right; with Shift, turn", keys: ["ArrowRight"] },
      { action: "recentre", label: "Back to the soldier you control", keys: ["Space"] }
    ]
  },
  {
    title: "Screen",
    actions: [
      { action: "overview", label: "Overview: hold for the sector in full, tap to keep it up", keys: ["KeyI"] },
      { action: "pause", label: "Pause or carry on", keys: ["KeyP"] },
      { action: "fog", label: "Fog of war on or off", keys: ["KeyO"] },
      { action: "sector-map", label: "The sector map; the battle goes on while you look", keys: ["KeyM"] },
      { action: "squad-book", label: "The squad book: every man, and the fallen", keys: ["KeyU"] }
    ]
  }
]

const ACTIONS: readonly KeyActionInfo[] = KEY_GROUPS.flatMap((group) => group.actions)

/** Keys that can't be taken for an action: the menu's, the slots', the dev tools'. */
const RESERVED: ReadonlySet<string> = new Set([
  "Escape",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "F3",
  "F4",
  "Backquote"
])

function infoOf(action: KeyAction): KeyActionInfo {
  const info = ACTIONS.find((candidate) => candidate.action === action)
  if (!info) {
    throw new Error(`No key action ${action}`)
  }
  return info
}

/** An action's canonical code: its first default key, the code the input modules know it by. */
export function canonicalCode(action: KeyAction): string {
  return infoOf(action).keys[0] ?? ""
}

const NAMES: Readonly<Record<string, string>> = {
  Space: "Space",
  Tab: "Tab",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
  CapsLock: "Caps Lock",
  Enter: "Enter",
  Backspace: "Backspace"
}

/** A key as it's printed: "W", "Shift", "Space", "↑", "Num 4". */
export function keyName(code: string): string {
  const named = NAMES[code]
  if (named) {
    return named
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3)
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5)
  }
  if (code.startsWith("Numpad")) {
    return `Num ${code.slice(6)}`
  }
  return code
}

/** Where the bindings are kept between visits. */
export interface KeyStore {
  load(): unknown
  save(bindings: Readonly<Record<string, readonly string[]>>): void
}

function browserKeyStore(key = "verdun.keys"): KeyStore {
  return {
    load() {
      try {
        return JSON.parse(localStorage.getItem(key) ?? "null")
      } catch {
        return null
      }
    },
    save(bindings) {
      try {
        localStorage.setItem(key, JSON.stringify(bindings))
      } catch {
        // Storage blocked: the bindings last as long as the page.
      }
    }
  }
}

export interface Keymap {
  /** The keys bound to an action now. */
  codesFor(action: KeyAction): readonly string[]
  /** The action a key is bound to, if any. */
  actionOf(code: string): KeyAction | null
  /**
   * The code the input modules should see for a pressed key: its action's canonical code; nothing, for a default key
   * whose action has been moved elsewhere; or the key itself, for keys outside the keymap (Esc, the slots, dev tools).
   */
  canonical(code: string): string | null
  /** An action's keys as they're printed: "W", "Shift". */
  label(action: KeyAction): string
  /**
   * Binds a key to an action in place of its keys. A key another action had is swapped: that action takes this one's
   * old key. Returns the action that gave the key up, if any; null with no change for a reserved key.
   */
  rebind(action: KeyAction, code: string): { readonly swapped: KeyAction | null } | null
  /** Puts an action, or every action, back on its default keys. */
  reset(action?: KeyAction): void
  /** Hears every change. Returns a function that stops listening. */
  listen(listener: () => void): () => void
}

/** The bindings from what was stored: each action's keys if they're a list of key codes, its defaults otherwise. */
function readBindings(stored: unknown): Map<KeyAction, readonly string[]> {
  const bindings = new Map<KeyAction, readonly string[]>()
  const record: Record<string, unknown> = typeof stored === "object" && stored !== null ? { ...stored } : {}
  for (const info of ACTIONS) {
    const kept = record[info.action]
    const valid =
      Array.isArray(kept) &&
      kept.length > 0 &&
      kept.every((code): code is string => typeof code === "string" && code.length > 0 && !RESERVED.has(code))
    bindings.set(info.action, valid ? kept : info.keys)
  }
  return bindings
}

export function createKeymap(store: KeyStore): Keymap {
  const bindings = readBindings(store.load())
  const listeners = new Set<() => void>()
  let byCode = new Map<string, KeyAction>()
  const defaults = new Set(ACTIONS.flatMap((info) => info.keys))

  function index(): void {
    byCode = new Map()
    for (const [action, codes] of bindings) {
      for (const code of codes) {
        byCode.set(code, action)
      }
    }
  }

  function changed(): void {
    index()
    store.save(Object.fromEntries(bindings))
    for (const listener of listeners) {
      listener()
    }
  }

  index()
  return {
    codesFor(action) {
      return bindings.get(action) ?? infoOf(action).keys
    },
    actionOf(code) {
      return byCode.get(code) ?? null
    },
    canonical(code) {
      const action = byCode.get(code)
      if (action) {
        return canonicalCode(action)
      }
      return defaults.has(code) ? null : code
    },
    label(action) {
      return [...new Set((bindings.get(action) ?? []).map(keyName))].join(" or ")
    },
    rebind(action, code) {
      if (RESERVED.has(code)) {
        return null
      }
      const holder = byCode.get(code) ?? null
      const previous = bindings.get(action) ?? infoOf(action).keys
      bindings.set(action, [code])
      if (holder && holder !== action) {
        const kept = (bindings.get(holder) ?? []).filter((other) => other !== code)
        bindings.set(holder, kept.length > 0 ? kept : previous)
      }
      changed()
      return { swapped: holder && holder !== action ? holder : null }
    },
    reset(action) {
      for (const info of ACTIONS) {
        if (!action || info.action === action) {
          bindings.set(info.action, info.keys)
        }
      }
      changed()
    },
    listen(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

let shared: Keymap | null = null

/** The page's keymap, kept in the browser: what input, the controls list, the HUD and the menu all read. */
export function keymap(): Keymap {
  shared ??= createKeymap(browserKeyStore())
  return shared
}
