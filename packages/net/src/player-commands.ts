import {
  type BarrageAttackCommand,
  type ClockCommand,
  type Command,
  type Creep,
  type FireMissionPlan,
  Shell,
  type Side,
  type Simulation,
  type Squad,
  type SquadOrder
} from "@verdun/sim"

type Fields = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

const SHELLS: readonly Shell[] = Object.values(Shell)
const STANCES = ["standing", "crouching", "prone"] as const

/** The squad's own order from a player: follow the leader, hold, or advance to a point. */
function squadOrder(order: unknown): SquadOrder | null {
  if (!isRecord(order)) {
    return null
  }
  const { kind, x, z } = order
  if (kind === "follow" || kind === "hold") {
    return { kind }
  }
  return kind === "advance" && finite(x) && finite(z) ? { kind, x, z } : null
}

function creep(value: unknown): Creep | null {
  if (!isRecord(value)) {
    return null
  }
  const { lift, interval, stopZ, protect } = value
  if (!finite(lift) || !finite(interval) || !finite(stopZ)) {
    return null
  }
  if (protect === undefined) {
    return { lift, interval, stopZ }
  }
  if (!isRecord(protect) || !finite(protect["objectiveZ"]) || !finite(protect["lineZ"])) {
    return null
  }
  return { lift, interval, stopZ, protect: { objectiveZ: protect["objectiveZ"], lineZ: protect["lineZ"] } }
}

/** A fire mission from the player's side's batteries: a call for fire, a bombardment, a gas shoot. */
function fireMission(value: unknown, side: Side): FireMissionPlan | null {
  if (!isRecord(value) || value["side"] !== side) {
    return null
  }
  const { shell, fromX, toX, z, band, roundsPerMinute, delay, duration, observed } = value
  const kind = SHELLS.find((each) => each === shell)
  if (
    kind === undefined ||
    !finite(fromX) ||
    !finite(toX) ||
    !finite(z) ||
    !finite(band) ||
    !finite(roundsPerMinute) ||
    !finite(delay) ||
    !finite(duration)
  ) {
    return null
  }
  const plan: FireMissionPlan = { side, shell: kind, fromX, toX, z, band, roundsPerMinute, delay, duration }
  const creeping = value["creep"] === undefined ? undefined : creep(value["creep"])
  if (creeping === null) {
    return null
  }
  return {
    ...plan,
    ...(creeping ? { creep: creeping } : {}),
    ...(observed === true ? { observed: true } : {})
  }
}

/** The player's side's attack behind a creeping barrage: the whistle. */
function barrageAttack(value: Fields, side: Side): BarrageAttackCommand | null {
  const { fromX, toX, startZ, objectiveZ, roundsPerMinute, lift, interval, standoff, delay } = value
  const { standingRoundsPerMinute, squads, objectiveDepth } = value
  if (
    value["side"] !== side ||
    !finite(fromX) ||
    !finite(toX) ||
    !finite(startZ) ||
    !finite(objectiveZ) ||
    !finite(roundsPerMinute) ||
    !finite(lift) ||
    !finite(interval) ||
    !finite(standoff) ||
    !finite(delay) ||
    (standingRoundsPerMinute !== undefined && !finite(standingRoundsPerMinute)) ||
    (objectiveDepth !== undefined && !finite(objectiveDepth)) ||
    (squads !== undefined && !(Array.isArray(squads) && squads.every(finite)))
  ) {
    return null
  }
  return {
    type: "barrage-attack",
    side,
    fromX,
    toX,
    startZ,
    objectiveZ,
    roundsPerMinute,
    lift,
    interval,
    standoff,
    delay,
    ...(standingRoundsPerMinute === undefined ? {} : { standingRoundsPerMinute }),
    ...(objectiveDepth === undefined ? {} : { objectiveDepth }),
    ...(squads === undefined ? {} : { squads: squads.filter(finite) })
  }
}

/** The dev keys' clock: an hour, a week, or a day's length moved on. */
function clock(value: Fields): ClockCommand | null {
  const fields = { week: value["week"], at: value["at"], shift: value["shift"], minutesPerDay: value["minutesPerDay"] }
  const given = Object.entries(fields).filter(([, field]) => field !== undefined)
  if (!given.every(([, field]) => finite(field))) {
    return null
  }
  return { type: "clock", ...Object.fromEntries(given) }
}

/**
 * A command from a player, kept to what they may do: move, aim and fire the men of their own squad, give it orders,
 * choose which squad to lead, and call on their side's guns. It is made afresh from the fields it should have, so
 * nothing else a client sends reaches the battle. Null for anything else, including another player's squad.
 *
 * With `dev`, the dev keys' commands go through too: killing a man, and moving the clock or the wind.
 */
export function playerCommand(sim: Simulation, squad: Squad, value: unknown, dev = false): Command | null {
  if (!isRecord(value)) {
    return null
  }
  const { soldier, x, z } = value
  const ours = typeof soldier === "number" && squad.members.includes(soldier)
  const point = finite(x) && finite(z)
  const ownSquad = value["squad"] === squad.id
  // A squad to join or take over must be one no other player leads.
  const from = value["from"]
  const free = typeof from === "number" && sim.squads[from]?.controller === "ai"
  switch (value["type"]) {
    case "move-to":
    case "steer":
      return ours && point ? { type: value["type"], soldier, x, z, run: value["run"] === true } : null
    case "face":
    case "throw-grenade":
      return ours && point ? { type: value["type"], soldier, x, z } : null
    case "fire":
    case "reload":
    case "man-gun":
      return ours ? { type: value["type"], soldier } : null
    // The action key: over the fence or wall ahead, or cutting the wire, the way given or else the way he faces.
    case "vault":
    case "cut-wire":
      return ours ? { type: value["type"], soldier, ...(point ? { x, z } : {}) } : null
    case "stance": {
      const stance = STANCES.find((each) => each === value["stance"])
      return ours && stance ? { type: "stance", soldier, stance } : null
    }
    case "squad-order": {
      const order = squadOrder(value["order"])
      return ownSquad && order ? { type: "squad-order", squad: squad.id, order } : null
    }
    case "take-command":
      return ownSquad && ours ? { type: "take-command", squad: squad.id, soldier } : null
    case "join-squad":
    case "take-over-squad":
      return ownSquad && free ? { type: value["type"], squad: squad.id, from } : null
    case "fire-mission": {
      const plan = fireMission(value["plan"], squad.side)
      return plan ? { type: "fire-mission", plan } : null
    }
    case "barrage-attack":
      return barrageAttack(value, squad.side)
    case "kill":
      return dev && typeof soldier === "number" ? { type: "kill", soldier } : null
    case "clock":
      return dev ? clock(value) : null
    case "wind":
      return dev && point ? { type: "wind", x, z } : null
    default:
      return null
  }
}
