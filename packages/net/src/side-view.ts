import { createCommanders, Side, type SimEvent, type SimSync } from "@verdun/sim"

/**
 * What one side is told of the battle beyond its men and the enemy it can see (sync-codec.ts): its own plans and
 * state, the enemy's left out or blanked, and only the events it would know of. The shells in flight still go to
 * both, for the sound of the guns and the warning of what's coming in; so do flares, bursts and cut wire, which
 * everyone on the field sees.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const enemyOf = (side: Side): Side => (side === Side.French ? Side.German : Side.French)

/** `record`, a value by side, with the enemy's value replaced by `blank` of it. */
function blankEnemy(record: unknown, side: Side, blank: (value: unknown) => unknown): unknown {
  if (!isRecord(record)) {
    return record
  }
  const enemy = String(enemyOf(side))
  return { ...record, [enemy]: blank(record[enemy]) }
}

/** `list` with only the elements `keep` keeps; anything else as it is. */
function only(list: unknown, keep: (element: Record<string, unknown>) => boolean): unknown {
  return Array.isArray(list) ? list.filter((element) => isRecord(element) && keep(element)) : list
}

/**
 * The battle's state as `side` is sent it: the enemy's squads without their orders or who leads them, only the side's
 * own fire missions, reserves, gun crews and alarms, and of the guns the enemy has fired only those the side has
 * spotted. `sideOf` gives a soldier's side.
 */
export function sideState(
  state: SimSync["state"],
  side: Side,
  sideOf: (soldier: number) => number | undefined
): SimSync["state"] {
  const sent: Record<string, unknown> = { ...state }
  const squads = state["squads"]
  const squadSides = new Map<number, unknown>()
  if (Array.isArray(squads)) {
    sent["squads"] = squads.map((squad) => {
      if (!isRecord(squad)) {
        return squad
      }
      squadSides.set(Number(squad["id"]), squad["side"])
      return squad["side"] === side ? squad : { ...squad, order: { kind: "hold" }, controller: "ai" }
    })
  }
  const artillery = state["artillery"]
  if (isRecord(artillery)) {
    sent["artillery"] = {
      ...artillery,
      missions: only(artillery["missions"], (mission) => mission["side"] === side),
      sosCalledAt: blankEnemy(artillery["sosCalledAt"], side, () => -1),
      ammunition: blankEnemy(artillery["ammunition"], side, (stock) =>
        Array.isArray(stock) ? stock.map(() => 0) : stock
      )
    }
  }
  sent["commanders"] = blankEnemy(state["commanders"], side, () => createCommanders()[enemyOf(side)])
  const reinforcements = state["reinforcements"]
  if (isRecord(reinforcements)) {
    sent["reinforcements"] = {
      ...reinforcements,
      pool: blankEnemy(reinforcements["pool"], side, () => 0),
      full: blankEnemy(reinforcements["full"], side, () => 0),
      arrivals: only(reinforcements["arrivals"], (arrival) => squadSides.get(Number(arrival["squad"])) === side)
    }
  }
  const spotting = state["spotting"]
  if (isRecord(spotting)) {
    sent["spotting"] = {
      ...spotting,
      // The enemy's guns once the side has placed them, and its own, which it knows of.
      sightings: only(spotting["sightings"], (sighting) => sighting["side"] === side || sighting["spotted"] === true)
    }
  }
  const gunCrews = state["gunCrews"]
  if (isRecord(gunCrews)) {
    sent["gunCrews"] = {
      ...gunCrews,
      pickups: only(gunCrews["pickups"], (pickup) => sideOf(Number(pickup["by"])) === side)
    }
  }
  const defence = state["defence"]
  if (isRecord(defence)) {
    sent["defence"] = {
      ...defence,
      alarmedAt: blankEnemy(defence["alarmedAt"], side, () => -1),
      warnedAt: blankEnemy(defence["warnedAt"], side, () => -1),
      threatened: blankEnemy(defence["threatened"], side, () => null),
      shifting: blankEnemy(defence["shifting"], side, () => [])
    }
  }
  return sent
}

/** Whether `side` hears of `event`, given which soldiers it `knows`: its own, and the enemy it can see. */
function hears(event: SimEvent, side: Side, knows: (soldier: number) => boolean): boolean {
  switch (event.type) {
    // Seen or heard across the field. A shot always has one of the side's own men at one end.
    case "shot":
    case "burst":
    case "wire-cut":
    case "flare":
    case "objective-taken":
    case "operation-over":
      return true
    // What a man did or came to: known of the side's own men and the enemy in sight.
    case "reloading":
    case "reloaded":
    case "throw":
    case "capture":
    case "rifle-grenade":
    case "wounded":
    case "fallen":
    case "arrived-at-aid-post":
    case "returned-to-duty":
    case "died-of-wounds":
    case "gun-manned":
      return knows(event.soldier)
    // A side's own news.
    case "counter-attack":
    case "reinforcement":
    case "squad-taken-over":
    case "gun-spotted":
    case "counter-thrust":
    case "reserves-up":
    case "warned":
    case "out-of-shells":
    case "zero-hour":
    case "second-wave":
      return event.side === side
  }
}

/** Each step's events that `side` hears of (see `hears`). */
export function sideSteps(steps: SimSync["steps"], side: Side, knows: (soldier: number) => boolean): SimSync["steps"] {
  return steps.map((step) => ({ tick: step.tick, events: step.events.filter((event) => hears(event, side, knows)) }))
}
