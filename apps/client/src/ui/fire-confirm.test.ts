import { describe, expect, it } from "vitest"
import { CONFIRM_WINDOW, createFireConfirm } from "./fire-confirm.ts"

describe("asking before sector-wide fire", () => {
  it("asks on the first press and fires on a second of the same key in time", () => {
    const fired: string[] = []
    const confirm = createFireConfirm(() => true)
    confirm.press("bombard", () => fired.push("bombard"), 0)
    expect(fired).toEqual([])
    expect(confirm.asking(1000)).toEqual({ kind: "bombard", left: 2 })
    confirm.press("bombard", () => fired.push("bombard"), 1500)
    expect(fired).toEqual(["bombard"])
    expect(confirm.asking(1600)).toBeNull()
  })

  it("asks again when the question has lapsed, or another call is pressed", () => {
    const fired: string[] = []
    const confirm = createFireConfirm(() => true)
    confirm.press("whistle", () => fired.push("whistle"), 0)
    confirm.press("whistle", () => fired.push("whistle"), CONFIRM_WINDOW + 1)
    confirm.press("bombard", () => fired.push("bombard"), CONFIRM_WINDOW + 2)
    expect(fired).toEqual([])
    expect(confirm.asking(CONFIRM_WINDOW + 3)?.kind).toBe("bombard")
    expect(confirm.asking(CONFIRM_WINDOW * 3)).toBeNull()
  })

  it("fires at once when the player has turned the asking off", () => {
    const fired: string[] = []
    createFireConfirm(() => false).press("whistle", () => fired.push("whistle"), 0)
    expect(fired).toEqual(["whistle"])
  })
})
