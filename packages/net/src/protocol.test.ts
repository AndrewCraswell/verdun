import { Side } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { joinSide } from "./protocol.ts"

describe("joining a sector", () => {
  it("is for Germany when asked, and for France otherwise", () => {
    expect(joinSide({ side: Side.German })).toBe(Side.German)
    expect(joinSide({ side: Side.French })).toBe(Side.French)
    expect(joinSide({ side: "germans" })).toBe(Side.French)
    expect(joinSide(null)).toBe(Side.French)
  })
})
