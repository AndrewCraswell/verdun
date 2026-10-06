import battleAreaFile from "@verdun/map/data/battle-area.json" with { type: "json" }
import frontLinesFile from "@verdun/map/data/front-lines.json" with { type: "json" }

/** A front line traced from a dated battle map (packages/map/data/front-lines.json), west to east in Lambert-93. */
export interface FrontLine {
  readonly id: string
  readonly side: "french" | "german"
  readonly date: string
  readonly kind: string
  readonly source: string
  readonly note: string
  readonly points: readonly (readonly [number, number])[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number")
}

function isFrontLine(value: unknown): value is FrontLine {
  return (
    isRecord(value) &&
    ["id", "date", "kind", "source", "note"].every((key) => typeof value[key] === "string") &&
    (value.side === "french" || value.side === "german") &&
    Array.isArray(value.points) &&
    value.points.every(isPoint)
  )
}

const file: unknown = frontLinesFile
/** The traced front lines, earliest first. */
export const FRONT_LINES: readonly FrontLine[] = (isRecord(file) && Array.isArray(file.lines) ? file.lines : [])
  .filter(isFrontLine)
  .sort((a, b) => a.date.localeCompare(b.date))

const area: unknown = battleAreaFile
/**
 * The ground the battle was fought over, 1916, as a ring of Lambert-93 points (packages/map/data/battle-area.json):
 * from the German first line of 21 February to the furthest the Germans came.
 */
export const BATTLE_AREA: readonly (readonly [number, number])[] =
  isRecord(area) && Array.isArray(area.ring) ? area.ring.filter(isPoint) : []

/** The dates the front lines are traced for, earliest first. */
export const FRONT_LINE_DATES: readonly string[] = [...new Set(FRONT_LINES.map((line) => line.date))]
