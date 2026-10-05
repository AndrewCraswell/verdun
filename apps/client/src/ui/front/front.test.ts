import { SEASONS as SIMULATION_SEASONS } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import geography from "./front-geography.json"
import { FRONT_LINES, OPEN_SECTOR, SEASONS, seasonPhase, THEATRES, theatresOf, VERDUN_SECTORS } from "./front.ts"

describe("the Western Front", () => {
  it("counts the seasons as the simulation's calendar does", () => {
    expect(SEASONS).toEqual(SIMULATION_SEASONS)
  })

  it("runs every season from the North Sea to Switzerland", () => {
    for (const season of SEASONS) {
      const { points } = FRONT_LINES[season]
      expect(points[0]![1]).toBeGreaterThan(51)
      expect(points[points.length - 1]![1]).toBeLessThan(47.6)
      // North to south overall, never doubling back far: each point within 30 km of the one before.
      for (let index = 1; index < points.length; index++) {
        const [lon, lat] = points[index]!
        const [lastLon, lastLat] = points[index - 1]!
        expect(Math.hypot((lon - lastLon) * 73, (lat - lastLat) * 111)).toBeLessThan(30)
      }
    }
  })

  it("opens the theatres of each season named in the design, Verdun among 1916's", () => {
    expect(theatresOf(1916).map((theatre) => theatre.id)).toEqual(["verdun", "somme"])
    for (const season of SEASONS) {
      expect(theatresOf(season).length).toBeGreaterThan(0)
    }
    expect(new Set(THEATRES.map((theatre) => theatre.id)).size).toBe(THEATRES.length)
  })

  it("has Fleury as the one sector open, on the right bank", () => {
    expect(VERDUN_SECTORS.filter((sector) => sector.open)).toEqual([OPEN_SECTOR])
    expect(OPEN_SECTOR).toMatchObject({ id: "fleury", bank: "right" })
  })

  it("tells where the 1916 arc stands, and nothing in other years", () => {
    expect(seasonPhase(1916, 25)).toBe("May–June: the battle for the forts and Fleury; phosgene arrives")
    expect(seasonPhase(1916, 1)).toMatch(/^January–February/)
    expect(seasonPhase(1916, 60)).toMatch(/^October–December/)
    expect(seasonPhase(1917, 10)).toBeNull()
  })

  it("draws on ground covering the whole front", () => {
    const [west, south, east, north] = geography.box
    for (const [lon, lat] of FRONT_LINES[1916].points) {
      expect(lon).toBeGreaterThan(west!)
      expect(lon).toBeLessThan(east!)
      expect(lat).toBeGreaterThan(south!)
      expect(lat).toBeLessThan(north!)
    }
    expect(geography.rivers.map((river) => river.name)).toContain("Meuse")
  })
})
