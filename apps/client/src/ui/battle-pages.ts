import { enqueueCommand } from "@verdun/sim"
import type { BattleParts } from "./battle.ts"
import { createJoinMap } from "./join-map.ts"
import { placeName } from "./join.ts"
import { createLogHistory } from "./log-history.ts"
import { createLogPage } from "./log-page.ts"
import { createReportPage } from "./operation-pages.ts"
import { reportOf } from "./operation-report.ts"
import type { MenuPage } from "./page.ts"
import { createSectorMapPage } from "./sector/sector-map.ts"
import { createSquadBookPage } from "./squad-book.ts"
import { createSquadRecord } from "./squad-record.ts"

/**
 * The menus' pages and acts that need the battle: choosing the squad on the map, the sector map, the squad book, the
 * battle log's history, and the operation's report. Loaded by the menus only once the battle is
 * up, so the simulation stays out of the menus' own small bundle and the front door shows before it has downloaded.
 */
export interface BattlePages {
  readonly sector: MenuPage
  readonly squad: MenuPage
  readonly log: MenuPage
  /** Choosing the squad to lead, on the map, with the attack ahead beside it. */
  readonly join: MenuPage
  readonly report: MenuPage
  /** Takes a squad to lead: the one held for the player, or another in its place. */
  enlist(squad: number): void
  /**
   * Reads the battle for the squad's record and the log's history; call about once a second in battle. True the once
   * the operation has just ended, for the report.
   */
  observe(week: number | null): boolean
}

/** What the join screen's and the report's buttons do, which the menus decide. */
export interface OperationActions {
  /** Starts, leading the squad chosen. */
  readonly start: (squad: number) => void
  readonly again: () => void
  readonly frontDoor: () => void
}

export function createBattlePages(battle: BattleParts, close: () => void, actions: OperationActions): BattlePages {
  const record = createSquadRecord()
  const history = createLogHistory(battle.tickRate)
  const { sim, squad, tickRate } = battle
  let reported = false
  const report = createReportPage({
    report: () => (sim.operation ? reportOf(sim.operation, tickRate, squad.side) : null),
    again: actions.again,
    frontDoor: actions.frontDoor
  })

  return {
    sector: createSectorMapPage({ battle: () => battle, close }),
    squad: createSquadBookPage({ battle: () => battle, record, close }),
    log: createLogPage(history),
    join: createJoinMap({ battle, start: actions.start }),
    report,
    enlist(from) {
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
