/**
 * Asking before sector-wide fire (H10 in docs/design/interface.md): the bombardment and the whistle fire for minutes
 * along the whole front, so a slip of the finger mustn't fire them. The first press asks; a second press of the same
 * key within a few seconds fires. The player can turn the asking off in the options.
 */

/** The sector-wide calls that ask first. */
export type SectorFire = "bombard" | "whistle"

/** How long the question stands, in milliseconds. */
export const CONFIRM_WINDOW = 3000

export interface FireConfirm {
  /** A press of a sector-wide call's key, at `now` in milliseconds: fires it, or asks first. */
  press(kind: SectorFire, act: () => void, now: number): void
  /** The question standing at `now`, if any, with the seconds left on it. */
  asking(now: number): { readonly kind: SectorFire; readonly left: number } | null
}

export function createFireConfirm(enabled: () => boolean): FireConfirm {
  let pending: { kind: SectorFire; until: number } | null = null
  return {
    press(kind, act, now) {
      if (!enabled() || (pending?.kind === kind && now <= pending.until)) {
        pending = null
        act()
        return
      }
      pending = { kind, until: now + CONFIRM_WINDOW }
    },
    asking(now) {
      if (!pending || now > pending.until) {
        pending = null
        return null
      }
      return { kind: pending.kind, left: (pending.until - now) / 1000 }
    }
  }
}
