import { enqueueCommand } from "@verdun/sim"
import { battleHour, weekLabel } from "../environment/calendar.ts"
import type { BattleParts } from "./battle.ts"
import { joinChoices, type JoinChoices, placeName } from "./join.ts"
import { createLogHistory } from "./log-history.ts"
import { createLogPage } from "./log-page.ts"
import { createBriefingPage, createReportPage } from "./operation-pages.ts"
import { briefingOf, reportOf } from "./operation-report.ts"
import type { MenuPage } from "./page.ts"
import { createSectorMapPage } from "./sector/sector-map.ts"
import { createSquadBookPage } from "./squad-book.ts"
import { createSquadRecord } from "./squad-record.ts"

/**
 * The menus' pages and acts that need the battle: the sector map, the squad book, the battle log's history, the join
 * screen's choices and joining, and the operation's briefing and report. Loaded by the menus only once the battle is
 * up, so the simulation stays out of the menus' own small bundle and the front door shows before it has downloaded.
 */
export interface BattlePages {
  readonly sector: MenuPage
  readonly squad: MenuPage
  readonly log: MenuPage
  readonly briefing: MenuPage
  readonly report: MenuPage
  /** The join screen's choices of squad. */
  choices(): JoinChoices
  /** Readies the briefing for leading `squad`; false when there's no operation to brief (free play). */
  brief(squad: number): boolean
  /** Joins leading a squad: the one held for the player, or another in its place. */
  join(squad: number): void
  /**
   * Reads the battle for the squad's record and the log's history; call about once a second in battle. True the once
   * the operation has just ended, for the report.
   */
  observe(week: number | null): boolean
}

/** What the briefing and the report's buttons do, which the menus decide. */
export interface OperationActions {
  /** Goes up the line from the briefing, leading the squad chosen. */
  readonly go: (squad: number) => void
  /** Back from the briefing to the choice of squad. */
  readonly back: () => void
  readonly again: () => void
  readonly frontDoor: () => void
}

export function createBattlePages(battle: BattleParts, close: () => void, actions: OperationActions): BattlePages {
  const record = createSquadRecord()
  const history = createLogHistory(battle.tickRate)
  const { sim, squad, tickRate } = battle
  let chosen = squad.id
  let reported = false

  const briefing = createBriefingPage({
    briefing: () => {
      const choices = joinChoices(sim, squad)
      const choice = [choices.held, ...choices.line, ...choices.reserve].find((each) => each.squad === chosen)
      return sim.operation && choice
        ? briefingOf(sim.operation, tickRate, choice, choices.reserve.includes(choice))
        : null
    },
    dateline: () => `${weekLabel(sim.environment.clock.week)}, ${battleHour(sim.environment.clock)}`,
    go: () => actions.go(chosen),
    back: actions.back
  })
  const report = createReportPage({
    report: () => (sim.operation ? reportOf(sim.operation, tickRate, squad.side) : null),
    again: actions.again,
    frontDoor: actions.frontDoor
  })

  return {
    sector: createSectorMapPage({ battle: () => battle, close }),
    squad: createSquadBookPage({ battle: () => battle, record, close }),
    log: createLogPage(history),
    briefing,
    report,
    choices: () => joinChoices(sim, squad),
    brief(next) {
      chosen = next
      return sim.operation !== null && sim.operation.result === null
    },
    join(from) {
      if (from !== squad.id) {
        enqueueCommand(sim, { type: "join-squad", squad: squad.id, from })
      }
    },
    observe(week) {
      const state = battle.hud.state
      if (state) {
        record.observe(state.roster, week, (soldier) =>
          placeName(sim, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])
        )
        history.observe(state.log, state.tick, state.clock.hour)
      }
      if (!reported && sim.operation?.result) {
        reported = true
        return true
      }
      return false
    }
  }
}
