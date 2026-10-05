import { describe, expect, it } from "vitest"
import type { RosterSlot, SlotStatus } from "../hud/soldier-state.ts"
import { createSquadRecord } from "./squad-record.ts"

function man(id: number, status: SlotStatus): RosterSlot {
  return {
    id,
    slot: id,
    name: { rank: "Soldat", given: "Louis", surname: `Martin${id}` },
    role: "rifleman",
    controlled: false,
    fighting: status === "steady",
    status,
    severity: "good",
    marks: [],
    distance: null
  }
}

const JUNE = Date.UTC(1916, 5, 20)
const JULY = Date.UTC(1916, 6, 4)

describe("the squad's record", () => {
  it("keeps nobody while the squad stands", () => {
    const record = createSquadRecord()
    record.observe([man(1, "steady"), man(2, "pinned")], JUNE, () => "near Fleury")
    expect(record.entries).toEqual([])
  })

  it("writes down who fell, when and where, the latest first", () => {
    const record = createSquadRecord()
    record.observe([man(1, "killed"), man(2, "steady")], JUNE, () => "near Fleury")
    record.observe([man(1, "killed"), man(2, "captured")], JULY, () => "in square C4")
    expect(record.entries.map((entry) => [entry.name.surname, entry.fate, entry.week, entry.place])).toEqual([
      ["Martin2", "captured", JULY, "in square C4"],
      ["Martin1", "killed", JUNE, "near Fleury"]
    ])
  })

  it("follows a wounded man to the aid post and back, keeping where he fell", () => {
    const record = createSquadRecord()
    record.observe([man(3, "down")], JUNE, () => "near the crossroads")
    record.observe([man(3, "aid-post")], JULY, () => "at the aid post")
    expect(record.entries[0]).toMatchObject({ fate: "aid-post", week: JUNE, place: "near the crossroads" })
    record.observe([man(3, "returned")], JULY, () => "")
    expect(record.entries[0]?.fate).toBe("returned")
  })

  it("says a man who was down and then killed died of his wounds", () => {
    const record = createSquadRecord()
    record.observe([man(4, "down")], JUNE, () => "near Fleury")
    record.observe([man(4, "killed")], JULY, () => "")
    record.observe([man(4, "killed")], JULY, () => "")
    expect(record.entries).toHaveLength(1)
    expect(record.entries[0]).toMatchObject({ fate: "died-of-wounds", week: JUNE })
  })
})
