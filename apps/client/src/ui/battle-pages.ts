import { enqueueCommand } from "@verdun/sim"
import type { BattleParts } from "./battle.ts"
import { joinChoices, type JoinChoices, placeName } from "./join.ts"
import { createLogHistory } from "./log-history.ts"
import { createLogPage } from "./log-page.ts"
import type { MenuPage } from "./page.ts"
import { createSectorMapPage } from "./sector/sector-map.ts"
import { createSquadBookPage } from "./squad-book.ts"
import { createSquadRecord } from "./squad-record.ts"

/**
 * The menus' pages and acts that need the battle: the sector map, the squad book, the battle log's history, the join
 * screen's choices and joining. Loaded by the menus only once the battle is up, so the simulation stays out of the
 * menus' own small bundle and the front door shows before it has downloaded.
 */
export interface BattlePages {
  readonly sector: MenuPage
  readonly squad: MenuPage
  readonly log: MenuPage
  /** The join screen's choices of squad. */
  choices(): JoinChoices
  /** Joins leading a squad: the one held for the player, or another in its place. */
  join(squad: number): void
  /** Reads the battle for the squad's record and the log's history; call about once a second in battle. */
  observe(week: number | null): void
}

export function createBattlePages(battle: BattleParts, close: () => void): BattlePages {
  const record = createSquadRecord()
  const history = createLogHistory(battle.tickRate)
  const { sim, squad } = battle
  return {
    sector: createSectorMapPage({ battle: () => battle, close }),
    squad: createSquadBookPage({ battle: () => battle, record, close }),
    log: createLogPage(history),
    choices: () => joinChoices(sim, squad),
    join(from) {
      if (from !== squad.id) {
        enqueueCommand(sim, { type: "join-squad", squad: squad.id, from })
      }
    },
    observe(week) {
      const state = battle.hud.state
      if (!state) {
        return
      }
      record.observe(state.roster, week, (soldier) =>
        placeName(sim, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])
      )
      history.observe(state.log, state.tick, state.clock.hour)
    }
  }
}
