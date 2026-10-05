import type { Season, WarDay } from "@verdun/sim"
import { h, setText } from "../../hud/dom.ts"
import { button } from "../fields.ts"
import type { MenuPage } from "../page.ts"
import geography from "./front-geography.json"
import {
  FRONT_LINES,
  type LonLat,
  OPEN_SECTOR,
  type Sector,
  SEASON_NOTES,
  SEASONS,
  type Theatre,
  theatresOf,
  TOWNS,
  VERDUN_BEFORE_THE_BATTLE,
  VERDUN_PLACES
} from "./front.ts"
import "./front-map.css"
import { boxOf, type MapBox, type MapPoint, offsetLine, pathOf, pointsOf, project } from "./projection.ts"

const SVG = "http://www.w3.org/2000/svg"

/** The two views: the whole front, and Verdun's battlefield. */
type View = "front" | "verdun"

const VIEWS: Readonly<Record<View, MapBox>> = {
  front: boxOf([1.7, 47.35, 8, 51.3]),
  verdun: boxOf([5.12, 49.13, 5.66, 49.31])
}

/** How far left and right move along the seasons. */
const ARROW_STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 }

/** How far apart the two sides' lines are drawn, in screen pixels: no man's land, at the map's scale. */
const LINE_GAP = 2.4
/** How long the map takes to fly between views, in milliseconds. */
const FLIGHT = 650

export interface FrontMapContext {
  /** Where the war stands now, once the battle has its calendar. */
  readonly war: () => WarDay | null
  /** What the open sector's button says and whether it can be pressed now: entering, or going back. */
  readonly entry: () => { readonly label: string; readonly enabled: boolean }
  readonly enter: () => void
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, className: string): SVGElementTagNameMap[K] {
  const created = document.createElementNS(SVG, tag)
  created.setAttribute("class", className)
  return created
}

function pathElement(className: string, points: readonly MapPoint[]): SVGPathElement {
  const path = svg("path", className)
  path.setAttribute("d", pathOf(points))
  return path
}

/** Lines of latitude and longitude every half degree, faint, as a map's graticule. */
function graticule(): SVGGElement {
  const group = svg("g", "front-graticule")
  for (let lon = 1.5; lon <= 8.5; lon += 0.5) {
    group.append(pathElement("front-graticule-line", [project([lon, 47]), project([lon, 51.6])]))
  }
  for (let lat = 47; lat <= 51.5; lat += 0.5) {
    group.append(pathElement("front-graticule-line", [project([1, lat]), project([8.6, lat])]))
  }
  return group
}

/** The coast, the borders of 1914 and the rivers: drawn once, in kilometres, with strokes that keep their width. */
function ground(): SVGGElement {
  const group = svg("g", "front-ground")
  group.append(graticule())
  const lines = (className: string, flats: readonly (readonly number[])[]) => {
    const each = svg("g", className)
    for (const flat of flats) {
      each.append(pathElement(`${className}-line`, pointsOf(flat).map(project)))
    }
    group.append(each)
  }
  lines("front-sea", geography.coast)
  lines("front-coast", geography.coast)
  lines("front-border", geography.borders)
  lines(
    "front-river",
    geography.rivers.flatMap((river) => river.lines)
  )
  return group
}

/** A mark on the map placed in pixels over the drawing, so its text stays crisp and the same size at every zoom. */
interface Mark {
  readonly at: MapPoint
  readonly element: HTMLElement
  readonly views: readonly View[]
}

/**
 * The war map (S15): the Western Front from the North Sea to Switzerland, the line in each season, the theatres each
 * season opens, and Verdun's sectors, of which Fleury can be played. Paper and ink, as a staff map; our line in blue
 * and theirs in red, as the period maps drew them.
 */
export function createFrontMapPage(context: FrontMapContext): MenuPage {
  // The map.
  const drawing = svg("svg", "front-svg")
  drawing.setAttribute("aria-hidden", "true")
  const lineBefore = svg("path", "front-line front-line--before")
  const ourLine = svg("path", "front-line front-line--ours")
  const theirLine = svg("path", "front-line front-line--theirs")
  drawing.append(ground(), lineBefore, theirLine, ourLine)
  const marksLayer = h("div", "front-marks")
  const legend = h(
    "div",
    "front-legend",
    h("span", "front-legend-item front-legend-item--ours", "Our line"),
    h("span", "front-legend-item front-legend-item--theirs", "Their line"),
    h("span", "front-legend-item front-legend-item--open", "Sector open"),
    h("span", "front-legend-item front-legend-item--closed", "Not yet open")
  )
  const legendBefore = h("span", "front-legend-item front-legend-item--before", "21 February 1916")
  const scaleLine = h("span", "front-scale-bar")
  const scaleText = h("span", "front-scale-text")
  const scaleBar = h("div", "front-scale", scaleLine, scaleText)
  const caption = h("div", "front-caption")
  const back = button("The whole front", () => fly("front"), "ui-button front-back")
  const canvas = h("div", "front-map", drawing, marksLayer, caption, back, legend, scaleBar)

  // The side panel.
  const seasonTabs = h("div", "front-seasons")
  seasonTabs.setAttribute("role", "tablist")
  seasonTabs.setAttribute("aria-label", "Season")
  const seasonNote = h("p", "front-season-note")
  const theatreList = h("div", "front-theatres")
  const detail = h("div", "front-detail")
  detail.setAttribute("aria-live", "polite")
  const side = h("aside", "front-side", seasonTabs, seasonNote, theatreList, detail)
  const root = h("div", "front-page", canvas, side)

  let view: View = "front"
  let season: Season = 1916
  let selected: { theatre: Theatre; sector: Sector | null } | null = null
  // The view box drawn now, and the flight between views.
  let centre: MapPoint = { x: 0, y: 0 }
  let scale = 1
  let flight: { from: { centre: MapPoint; scale: number }; to: View; start: number } | null = null
  let frame = 0
  const marks: Mark[] = []
  let enterButton: HTMLButtonElement | null = null

  const width = () => canvas.clientWidth || 1
  const height = () => canvas.clientHeight || 1

  /** The centre and pixels per kilometre that fit a view's box in the map. */
  function fit(target: View): { centre: MapPoint; scale: number } {
    const box = VIEWS[target]
    return {
      centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      scale: Math.min(width() / box.width, height() / box.height)
    }
  }

  function toScreen(point: MapPoint): MapPoint {
    return { x: (point.x - centre.x) * scale + width() / 2, y: (point.y - centre.y) * scale + height() / 2 }
  }

  function draw(): void {
    const w = width() / scale
    const hgt = height() / scale
    drawing.setAttribute("viewBox", `${centre.x - w / 2} ${centre.y - hgt / 2} ${w} ${hgt}`)
    // The two sides' lines either side of the front, a few pixels apart at any zoom: ours on the west and south.
    const line = FRONT_LINES[season].points.map(project)
    const gap = LINE_GAP / 2 / scale
    ourLine.setAttribute("d", pathOf(offsetLine(line, gap)))
    theirLine.setAttribute("d", pathOf(offsetLine(line, -gap)))
    const showBefore = season === 1916 && scale > 6
    lineBefore.setAttribute("d", showBefore ? pathOf(VERDUN_BEFORE_THE_BATTLE.map(project)) : "")
    legendBefore.hidden = !showBefore
    for (const mark of marks) {
      const { x, y } = toScreen(mark.at)
      const inside = x > -80 && y > -40 && x < width() + 80 && y < height() + 40
      mark.element.hidden = !mark.views.includes(view) || !inside
      mark.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
    // A scale bar of a round distance about a sixth of the map's width.
    const target = width() / 6 / scale
    const kilometres = [1, 2, 5, 10, 20, 50, 100, 200].find((each) => each >= target) ?? 200
    scaleLine.style.width = `${(kilometres * scale).toFixed(0)}px`
    setText(scaleText, `${kilometres} km`)
  }

  function step(time: number): void {
    frame = 0
    if (!flight) {
      return
    }
    const to = fit(flight.to)
    const t = Math.min(1, (time - flight.start) / FLIGHT)
    const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    // Zoom evenly in the logarithm of scale, so the flight neither lurches nor crawls.
    scale = Math.exp(Math.log(flight.from.scale) + (Math.log(to.scale) - Math.log(flight.from.scale)) * ease)
    centre = {
      x: flight.from.centre.x + (to.centre.x - flight.from.centre.x) * ease,
      y: flight.from.centre.y + (to.centre.y - flight.from.centre.y) * ease
    }
    draw()
    if (t < 1) {
      frame = requestAnimationFrame(step)
    } else {
      flight = null
    }
  }

  function fly(target: View): void {
    view = target
    root.dataset.view = target
    back.hidden = target === "front"
    setText(caption, target === "front" ? FRONT_LINES[season].caption : "Verdun: the right bank and the left")
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced || !root.isConnected) {
      ;({ centre, scale } = fit(target))
      draw()
      return
    }
    flight = { from: { centre, scale }, to: target, start: performance.now() }
    frame ||= requestAnimationFrame(step)
  }

  function addMark(at: LonLat, element: HTMLElement, views: readonly View[]): void {
    element.classList.add("front-mark")
    marks.push({ at: project(at), element, views })
    marksLayer.append(element)
  }

  // Towns, forts and villages: labels only, not for clicking.
  for (const town of TOWNS) {
    const label = h(
      "span",
      `front-town${town.occupied ? " front-town--occupied" : ""}${town.capital ? " front-town--capital" : ""}`,
      town.name
    )
    addMark(town.at, label, town.maps === "both" ? ["front", "verdun"] : [town.maps ?? "front"])
  }
  for (const place of VERDUN_PLACES) {
    addMark(place.at, h("span", place.fort ? "front-fort" : "front-village", place.name), ["verdun"])
  }
  addMark([5.352, 49.232], h("span", "front-river-name", "Meuse"), ["verdun"])

  // Theatres and sectors: buttons, selected from the map or from the side panel's list.
  const theatreMarks = new Map<string, HTMLButtonElement>()
  const sectorMarks = new Map<string, HTMLButtonElement>()
  const allTheatres = new Map<string, Theatre>()
  for (const s of SEASONS) {
    for (const theatre of theatresOf(s)) {
      allTheatres.set(theatre.id, theatre)
    }
  }
  for (const theatre of allTheatres.values()) {
    const open = theatre.sectors?.some((sector) => sector.open) ?? false
    const mark = button("", () => choose(theatre, null), `front-theatre${open ? " front-theatre--open" : ""}`)
    mark.append(h("span", "front-theatre-dot"), h("span", "front-theatre-name", theatre.name))
    mark.setAttribute("aria-label", `${theatre.name}${open ? ", a sector open" : ", not yet open"}`)
    theatreMarks.set(theatre.id, mark)
    addMark(theatre.at, mark, ["front"])
    for (const sector of theatre.sectors ?? []) {
      const sectorMark = button(
        "",
        () => choose(theatre, sector),
        `front-sector${sector.open ? " front-sector--open" : ""}`
      )
      sectorMark.append(h("span", "front-sector-dot"), h("span", "front-sector-name", sector.name))
      sectorMark.setAttribute("aria-label", `${sector.name}${sector.open ? ", open" : ", not yet open"}`)
      sectorMarks.set(sector.id, sectorMark)
      addMark(sector.at, sectorMark, ["verdun"])
    }
  }

  function choose(theatre: Theatre, sector: Sector | null): void {
    selected = { theatre, sector }
    if (theatre.sectors && view !== "verdun") {
      fly("verdun")
    }
    describe()
  }

  function describe(): void {
    for (const [id, mark] of theatreMarks) {
      mark.setAttribute("aria-pressed", String(selected?.theatre.id === id))
    }
    for (const [id, mark] of sectorMarks) {
      mark.setAttribute("aria-pressed", String(selected?.sector?.id === id))
    }
    detail.replaceChildren()
    enterButton = null
    if (!selected) {
      detail.append(h("p", "front-hint", "Choose a theatre on the map, or from the list."))
      return
    }
    const { theatre, sector } = selected
    if (sector) {
      detail.append(
        h("div", "front-detail-kicker", `${theatre.name}, the ${sector.bank} bank`),
        h("h3", "front-detail-title", sector.name),
        h("p", "front-detail-key", sector.keyPoints),
        h("p", "front-detail-text", sector.character)
      )
      if (sector.open) {
        enterButton = button("", context.enter, "ui-button ui-button--primary front-enter")
        entry()
        detail.append(
          h("p", "front-detail-status front-detail-status--open", "Open: a battle is being fought here"),
          enterButton
        )
      } else {
        detail.append(h("p", "front-detail-status", "Not yet open: the sector hasn't been built"))
      }
      return
    }
    detail.append(
      h("div", "front-detail-kicker", theatre.seasons.join(", ")),
      h("h3", "front-detail-title", theatre.name),
      h("p", "front-detail-text", theatre.summary)
    )
    if (theatre.sectors) {
      const list = h("div", "front-sector-list")
      for (const each of theatre.sectors) {
        const item = button(
          "",
          () => choose(theatre, each),
          `front-sector-item${each.open ? " front-sector-item--open" : ""}`
        )
        item.append(
          h("span", "front-sector-item-name", each.name),
          h("span", "front-sector-item-state", each.open ? "Open" : "Not yet open")
        )
        list.append(item)
      }
      detail.append(list)
    } else {
      detail.append(h("p", "front-detail-status", "Not yet open: its sectors haven't been drawn up"))
    }
  }

  /** The open sector's way in: entering once the battle is ready, or going back to it. */
  function entry(): void {
    if (enterButton) {
      const { label, enabled } = context.entry()
      setText(enterButton, label)
      enterButton.disabled = !enabled
    }
  }

  function showSeason(next: Season): void {
    season = next
    for (const tab of seasonTabs.children) {
      if (tab instanceof HTMLElement) {
        tab.setAttribute("aria-selected", String(tab.dataset.season === String(next)))
        tab.tabIndex = tab.dataset.season === String(next) ? 0 : -1
      }
    }
    setText(seasonNote, SEASON_NOTES[next])
    const open = new Set(theatresOf(next).map((theatre) => theatre.id))
    for (const [id, mark] of theatreMarks) {
      mark.classList.toggle("front-theatre--off-season", !open.has(id))
    }
    theatreList.replaceChildren(
      ...theatresOf(next).map((theatre) => {
        const item = button(theatre.name, () => choose(theatre, null), "front-theatre-item")
        if (theatre.sectors?.some((sector) => sector.open)) {
          item.append(h("span", "front-theatre-item-state", "Open"))
        }
        return item
      })
    )
    if (selected && !open.has(selected.theatre.id)) {
      selected = null
      describe()
    }
    if (view === "front") {
      setText(caption, FRONT_LINES[next].caption)
    }
    draw()
  }

  for (const s of SEASONS) {
    const tab = button(String(s), () => showSeason(s), "front-season")
    tab.dataset.season = String(s)
    tab.setAttribute("role", "tab")
    seasonTabs.append(tab)
  }
  seasonTabs.addEventListener("keydown", (event) => {
    const move = ARROW_STEPS[event.key] ?? 0
    if (move !== 0) {
      const index = SEASONS.indexOf(season)
      const next = SEASONS[Math.min(SEASONS.length - 1, Math.max(0, index + move))]!
      showSeason(next)
      seasonTabs.querySelector<HTMLElement>(`[data-season="${next}"]`)?.focus()
      event.preventDefault()
    }
  })
  legend.append(legendBefore)

  /** Marks the season the war is in now. */
  function date(): void {
    const day = context.war()
    for (const tab of seasonTabs.children) {
      if (tab instanceof HTMLElement) {
        tab.classList.toggle(
          "front-season--now",
          day !== null && "season" in day && tab.dataset.season === String(day.season)
        )
      }
    }
  }

  const resize = new ResizeObserver(() => {
    if (!flight) {
      ;({ centre, scale } = fit(view))
    }
    draw()
  })

  return {
    id: "front",
    title: "The front",
    root,
    opened() {
      const day = context.war()
      const now = day && "season" in day ? day.season : 1916
      date()
      showSeason(now)
      // Open where the player can fight: on Verdun, with Fleury chosen.
      const verdun = allTheatres.get("verdun")
      if (verdun && verdun.seasons.includes(now)) {
        selected = { theatre: verdun, sector: OPEN_SECTOR }
        view = "front"
        ;({ centre, scale } = fit("front"))
        draw()
        fly("verdun")
      } else {
        selected = null
        fly("front")
      }
      describe()
      resize.observe(canvas)
    },
    closed() {
      resize.disconnect()
      cancelAnimationFrame(frame)
      frame = 0
      flight = null
    },
    tick() {
      date()
      entry()
    },
    dispose() {
      resize.disconnect()
      cancelAnimationFrame(frame)
    }
  }
}
