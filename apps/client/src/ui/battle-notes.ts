import { h, setText } from "../hud/dom.ts"
import type { Caption, Captions } from "./captions.ts"
import { button } from "./fields.ts"
import type { FireConfirm, SectorFire } from "./fire-confirm.ts"
import { keymap } from "./keymap.ts"
import "./battle-notes.css"

/** What a second press of each sector-wide call's key does, in a few words. */
const QUESTIONS: Readonly<Record<SectorFire, string>> = {
  bombard: "again: bombard their line",
  whistle: "again: every squad goes over"
}

/** Where a caption came from, as an arrow; its side is in the tint and the label. */
const ARROWS: Readonly<Record<Caption["direction"], string>> = { left: "◀", ahead: "▲", right: "▶" }

export interface BattleNotes {
  /** Redraws the captions and the question standing. Call once a frame. */
  update(frameSeconds: number): void
  /** A note to the player, with ways to answer it: shown until answered. */
  notice(text: string, answers: readonly { readonly label: string; readonly act: () => void }[]): void
  dispose(): void
}

/**
 * The small notes over the battle that aren't the HUD's: captions of what's heard, the question before sector-wide
 * fire, and the odd notice such as the suggestion of a lower setting. Bottom centre, above the prompts, out of the aim's
 * way.
 */
export function createBattleNotes(
  parent: HTMLElement,
  { captions, confirm }: { readonly captions: Captions; readonly confirm: FireConfirm }
): BattleNotes {
  const captionList = h("div", "notes-captions")
  captionList.setAttribute("aria-live", "polite")
  const question = h("div", "notes-question")
  question.setAttribute("role", "status")
  question.hidden = true
  const questionText = h("span", "notes-question-text")
  const questionKey = h("kbd", "ui-key notes-question-key")
  question.append(questionKey, questionText)
  const notice = h("div", "notes-notice")
  notice.setAttribute("role", "status")
  notice.hidden = true
  const root = h("div", "notes", notice, question, captionList)
  parent.append(root)
  let shown = ""

  return {
    update(frameSeconds) {
      const asking = confirm.asking(performance.now())
      question.hidden = !asking
      if (asking) {
        setText(questionText, QUESTIONS[asking.kind])
        setText(questionKey, keymap().label(asking.kind))
      }
      const now = captions.update(frameSeconds)
      const key = now.map((caption) => `${caption.key}:${caption.direction}:${caption.name ?? ""}`).join("|")
      if (key !== shown) {
        shown = key
        captionList.replaceChildren(
          ...now.map((caption) => {
            const arrow = h(
              "span",
              `notes-caption-arrow notes-caption-arrow--${caption.side ?? "sound"}`,
              ARROWS[caption.direction]
            )
            arrow.setAttribute("aria-label", caption.side ? `${caption.side}, ${caption.direction}` : caption.direction)
            return h(
              "p",
              "notes-caption",
              arrow,
              caption.name ? h("span", "notes-caption-name", `${caption.name}:`) : null,
              h("span", "notes-caption-text", caption.text)
            )
          })
        )
      }
    },
    notice(text, answers) {
      notice.replaceChildren(
        h("span", "notes-notice-text", text),
        ...answers.map(({ label, act }) =>
          button(
            label,
            () => {
              notice.hidden = true
              act()
            },
            "ui-button notes-notice-answer"
          )
        )
      )
      notice.hidden = false
    },
    dispose() {
      root.remove()
    }
  }
}
