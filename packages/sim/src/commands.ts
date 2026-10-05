import { addComponent, type EntityId, entityExists, hasComponent, removeComponent } from "bitecs"
import { type FireMissionPlan, lineSpanBetween, orderFireMission, Shell } from "./artillery.ts"
import { fireAimed, shakeSquad, startReload, throwGrenade } from "./combat.ts"
import { Side, Stance } from "./components.ts"
import { clockAt, holdWeather, startWeek, updateEnvironment } from "./environment.ts"
import { manGun } from "./man-gun.ts"
import { joinSquad, takeOverSquad } from "./reinforcements.ts"
import { clampToMap, type Simulation } from "./simulation.ts"
import type { SquadOrder } from "./squads.ts"
import { startVault } from "./vault.ts"
import { createForecast, type ForecastSpec } from "./weather.ts"
import { cutLane } from "./wire.ts"

/** A turn of the aim wider than this (its cosine: 2 degrees), with nobody picked out, unsettles it. */
const AIM_SWING = 0.9994

/** Half the width of the lane cut through a squad's own wire before it goes over, in metres. */
const LANE_HALF_WIDTH = 3

/**
 * Where a squad's lane through its own wire ends: the middle of no man's land in front of it, between the two front
 * lines where they pass its x. Null where either line doesn't. Only its own wire: the enemy's is for the guns to cut.
 */
function laneEnd(sim: Simulation, side: Side, x: number): number | null {
  const enemy = side === Side.French ? Side.German : Side.French
  const own = lineSpanBetween(sim.map.trenches, side, x - LANE_HALF_WIDTH, x + LANE_HALF_WIDTH)
  const theirs = lineSpanBetween(sim.map.trenches, enemy, x - LANE_HALF_WIDTH, x + LANE_HALF_WIDTH)
  return own === null || theirs === null ? null : (own.forward + theirs.forward) / 2
}

/** Orders a soldier to walk, or run, to a ground position. */
export interface MoveToCommand {
  readonly type: "move-to"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
  /** Run rather than walk: a dash across open ground, as in the last rush of an assault. */
  readonly run?: boolean
}

/**
 * Steers a directly controlled soldier: a direction on the ground plane, whose length (up to 1) is the fraction of
 * walking speed. A zero vector stops. Steering cancels any move order.
 */
export interface SteerCommand {
  readonly type: "steer"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
  /** Run rather than walk, if he's standing and has the breath for it. */
  readonly run?: boolean
}

/**
 * Turns a soldier to face, and aim, along a direction on the ground plane: at `target`, the enemy a player has picked
 * out with the pointer, when there is one.
 */
export interface FaceCommand {
  readonly type: "face"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
  readonly target?: EntityId
}

/** Gives a squad a standing order for every member except its leader. */
export interface SquadOrderCommand {
  readonly type: "squad-order"
  readonly squad: number
  readonly order: SquadOrder
}

/**
 * Makes a squad member its leader: the player switching to another soldier. The previous leader stops walking and falls
 * in with the squad's order; the new one drops any order and waits for the player's input.
 */
export interface TakeCommandCommand {
  readonly type: "take-command"
  readonly squad: number
  readonly soldier: EntityId
}

/**
 * A player takes command of a squad, or leaves it. Left to itself, its leader stops where the player had them going and
 * the squad fights on by its own orders, as every bot squad does.
 */
export interface SquadControllerCommand {
  readonly type: "squad-controller"
  readonly squad: number
  readonly controller: "player" | "ai"
}

/**
 * A wiped-out player's squad takes over the men of a bot squad in the line, instead of waiting for replacements: see
 * `takeOverCandidates` for which squads qualify. Ignored if `from` doesn't.
 */
export interface TakeOverSquadCommand {
  readonly type: "take-over-squad"
  readonly squad: number
  readonly from: number
}

/**
 * A player joining the battle chooses which squad of their side to lead: the player's squad and `from` swap their men
 * and orders. See `joinRefusal` for which squads can be chosen; ignored for any other.
 */
export interface JoinSquadCommand {
  readonly type: "join-squad"
  readonly squad: number
  readonly from: number
}

/** Kills a soldier outright. A stand-in for weapons until combat lands, and handy for tests and debugging. */
export interface KillCommand {
  readonly type: "kill"
  readonly soldier: EntityId
}

/**
 * A player pulls the trigger: the soldier fires along their facing, at the enemy nearest the aim within a narrow cone.
 * Ignored while the weapon is still reloading.
 */
export interface FireCommand {
  readonly type: "fire"
  readonly soldier: EntityId
}

/**
 * Stands a soldier up, crouches him or lays him down: for the soldier a player controls, whose stance their squad doesn't
 * decide. Crouching men walk slowly and stay below a parapet; prone men crawl. A soldier can't be ordered down a dugout;
 * that's their squad's call under shellfire.
 */
export interface StanceCommand {
  readonly type: "stance"
  readonly soldier: EntityId
  readonly stance: "standing" | "crouching" | "prone"
}

/** A player throws a grenade toward a ground point, as far as a throw reaches. */
/** Climbs the wire fence ahead of the soldier, the way he's going, where no tangle of coils lies in his way. */
export interface VaultCommand {
  readonly type: "vault"
  readonly soldier: EntityId
}

/** Reloads the soldier's weapon now, before it's empty: a full magazine before going over, say. */
export interface ReloadCommand {
  readonly type: "reload"
  readonly soldier: EntityId
}

/** Takes over the machine gun of the comrade beside the soldier, or hands the soldier's own gun to the nearest rifleman. */
export interface ManGunCommand {
  readonly type: "man-gun"
  readonly soldier: EntityId
}

export interface ThrowGrenadeCommand {
  readonly type: "throw-grenade"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
}

/**
 * Sets the wind near the ground, in metres per second toward +x (east) and +z (north). The weather is held as it is
 * from then on, so the wind stays put until a new forecast is given.
 */
/** Sets how many rounds of a kind of shell a side's batteries have left: a scenario's ammunition allotment. */
export interface AmmunitionCommand {
  readonly type: "ammunition"
  readonly side: Side
  readonly shell: Shell
  readonly rounds: number
}

export interface WindCommand {
  readonly type: "wind"
  readonly x: number
  readonly z: number
}

/**
 * Moves the battle's clock. `week` is the campaign's daily turn; `at` and `shift` are for servers, game modes, tests and
 * dev tools. Applied in that order, then `minutesPerDay`.
 */
export interface ClockCommand {
  readonly type: "clock"
  /**
   * Starts another week of the war, given as 00:00 UTC on its first day in milliseconds since 1970. The hour of day
   * carries on; the days of battle start again from the week's first date, and the weather eases into it.
   */
  readonly week?: number
  /** Jumps straight to a moment, in milliseconds since 1970 UTC: the week becomes the one starting that day. */
  readonly at?: number
  /** Moves the hour on (or back, if negative) by this many milliseconds of game time. */
  readonly shift?: number
  /** Real minutes a whole day and night takes. */
  readonly minutesPerDay?: number
}

/** Changes where the weather comes from: a seeded cycle of patterns, one weather held steady, and later the records. */
export interface ForecastCommand {
  readonly type: "forecast"
  readonly forecast: ForecastSpec
}

/** Orders a side's batteries to fire on a target: a bombardment, a call for fire, or any other barrage. */
export interface FireMissionCommand {
  readonly type: "fire-mission"
  readonly plan: FireMissionPlan
}

/**
 * An attack behind a creeping barrage: field guns lay a line of fire `startZ`, lifting `lift` metres every `interval`
 * seconds toward the objective and beyond it, and the side's squads follow `standoff` metres behind it, then rush the
 * objective when the barrage lifts past.
 */
export interface BarrageAttackCommand {
  readonly type: "barrage-attack"
  readonly side: Side
  readonly fromX: number
  readonly toX: number
  readonly startZ: number
  readonly objectiveZ: number
  readonly roundsPerMinute: number
  readonly lift: number
  readonly interval: number
  readonly standoff: number
  /** Seconds before the barrage opens. */
  readonly delay: number
  /**
   * Field-gun rounds a minute on the objective itself while the creeping barrage approaches, keeping its garrison down
   * their dugouts; heavy howitzers add a fifth as many. The standing barrage lifts as the creeping barrage reaches the
   * objective. Zero or absent for none.
   */
  readonly standingRoundsPerMinute?: number
  /** Ids of the squads that go: absent for every squad on the side. */
  readonly squads?: readonly number[]
  /**
   * How deep the objective trench runs, in metres, back from its near edge to `objectiveZ` at its far edge: the
   * standing barrage covers all of it, and the attackers go in once the creeping barrage has lifted past all of it.
   */
  readonly objectiveDepth?: number
}

/** Everything that can change the simulation from outside. Grows as mechanics land. */
export type Command =
  | MoveToCommand
  | SteerCommand
  | FaceCommand
  | SquadOrderCommand
  | TakeCommandCommand
  | SquadControllerCommand
  | TakeOverSquadCommand
  | JoinSquadCommand
  | KillCommand
  | FireCommand
  | StanceCommand
  | ThrowGrenadeCommand
  | VaultCommand
  | ManGunCommand
  | ReloadCommand
  | AmmunitionCommand
  | WindCommand
  | ClockCommand
  | ForecastCommand
  | FireMissionCommand
  | BarrageAttackCommand

const STANCES = { standing: Stance.Standing, crouching: Stance.Crouching, prone: Stance.Prone } as const

/** A soldier still in the fight: the fallen and prisoners ignore every order. */
function isSoldier(sim: Simulation, entity: EntityId): boolean {
  return (
    entityExists(sim.world, entity) &&
    hasComponent(sim.world, entity, sim.soldiers.position) &&
    !hasComponent(sim.world, entity, sim.soldiers.dead) &&
    !hasComponent(sim.world, entity, sim.soldiers.captured)
  )
}

/** Applies one command. Commands that no longer make sense (a soldier who has died) are ignored. */
export function applyCommand(sim: Simulation, command: Command): void {
  switch (command.type) {
    case "move-to": {
      if (!isSoldier(sim, command.soldier)) {
        return
      }
      const target = clampToMap(sim, command.x, command.z)
      addComponent(sim.world, command.soldier, sim.soldiers.moveOrder)
      sim.soldiers.moveOrder.x[command.soldier] = target.x
      sim.soldiers.moveOrder.z[command.soldier] = target.z
      sim.soldiers.moveOrder.run[command.soldier] = command.run ? 1 : 0
      return
    }
    case "steer": {
      if (!isSoldier(sim, command.soldier)) {
        return
      }
      const length = Math.sqrt(command.x * command.x + command.z * command.z)
      if (!(length > 0)) {
        if (hasComponent(sim.world, command.soldier, sim.soldiers.steer)) {
          // Stopped: his aim steadies from now.
          sim.soldiers.aim.since[command.soldier] = sim.tick
        }
        removeComponent(sim.world, command.soldier, sim.soldiers.steer)
        return
      }
      const scale = length > 1 ? 1 / length : 1
      removeComponent(sim.world, command.soldier, sim.soldiers.moveOrder)
      addComponent(sim.world, command.soldier, sim.soldiers.steer)
      sim.soldiers.steer.x[command.soldier] = command.x * scale
      sim.soldiers.steer.z[command.soldier] = command.z * scale
      sim.soldiers.steer.run[command.soldier] = command.run === true ? 1 : 0
      return
    }
    case "face": {
      const length = Math.sqrt(command.x * command.x + command.z * command.z)
      if (!isSoldier(sim, command.soldier) || !(length > 0)) {
        return
      }
      const { facing, target, aim, side } = sim.soldiers
      const x = command.x / length
      const z = command.z / length
      const picked =
        command.target !== undefined &&
        isSoldier(sim, command.target) &&
        !hasComponent(sim.world, command.target, sim.soldiers.dead) &&
        !hasComponent(sim.world, command.target, sim.soldiers.captured) &&
        side.value[command.target] !== side.value[command.soldier]
          ? command.target
          : -1
      // Switching target unsettles his aim; following the same man doesn't, nor do small corrections with nobody picked.
      const swung = x * facing.x[command.soldier] + z * facing.z[command.soldier] < AIM_SWING
      if (picked !== target.id[command.soldier] || (picked < 0 && swung)) {
        aim.since[command.soldier] = sim.tick
      }
      target.id[command.soldier] = picked
      facing.x[command.soldier] = x
      facing.z[command.soldier] = z
      return
    }
    case "squad-order": {
      const squad = sim.squads[command.squad]
      if (squad) {
        squad.order = command.order
      }
      return
    }
    case "take-command": {
      const squad = sim.squads[command.squad]
      if (!squad || !squad.members.includes(command.soldier) || !isSoldier(sim, command.soldier)) {
        return
      }
      if (squad.leader >= 0) {
        removeComponent(sim.world, squad.leader, sim.soldiers.steer)
      }
      removeComponent(sim.world, command.soldier, sim.soldiers.moveOrder)
      // He takes up the player's aim, not whoever he had in his sights left to himself.
      sim.soldiers.target.id[command.soldier] = -1
      sim.soldiers.aim.since[command.soldier] = sim.tick
      squad.leader = command.soldier
      return
    }
    case "squad-controller": {
      const squad = sim.squads[command.squad]
      if (!squad) {
        return
      }
      if (squad.leader >= 0) {
        removeComponent(sim.world, squad.leader, sim.soldiers.steer)
      }
      squad.controller = command.controller
      return
    }
    case "take-over-squad": {
      const squad = sim.squads[command.squad]
      const from = sim.squads[command.from]
      if (squad && from) {
        takeOverSquad(sim, squad, from)
      }
      return
    }
    case "join-squad": {
      const squad = sim.squads[command.squad]
      const from = sim.squads[command.from]
      if (squad && from) {
        joinSquad(sim, squad, from)
      }
      return
    }
    case "kill": {
      if (!isSoldier(sim, command.soldier)) {
        return
      }
      addComponent(sim.world, command.soldier, sim.soldiers.dead)
      removeComponent(sim.world, command.soldier, sim.soldiers.steer)
      removeComponent(sim.world, command.soldier, sim.soldiers.moveOrder)
      sim.soldiers.health.value[command.soldier] = 0
      shakeSquad(sim, command.soldier)
      return
    }
    case "fire": {
      if (isSoldier(sim, command.soldier)) {
        fireAimed(sim, command.soldier)
      }
      return
    }
    case "vault": {
      if (isSoldier(sim, command.soldier)) {
        startVault(sim, command.soldier)
      }
      return
    }
    case "reload": {
      if (isSoldier(sim, command.soldier)) {
        startReload(sim, command.soldier)
      }
      return
    }
    case "man-gun": {
      if (isSoldier(sim, command.soldier)) {
        manGun(sim, command.soldier)
      }
      return
    }
    case "stance": {
      if (isSoldier(sim, command.soldier)) {
        if (sim.soldiers.stance.value[command.soldier] !== STANCES[command.stance]) {
          sim.soldiers.aim.since[command.soldier] = sim.tick
        }
        sim.soldiers.stance.value[command.soldier] = STANCES[command.stance]
      }
      return
    }
    case "throw-grenade": {
      if (isSoldier(sim, command.soldier) && Number.isFinite(command.x) && Number.isFinite(command.z)) {
        throwGrenade(sim, command.soldier, command.x, command.z)
      }
      return
    }
    case "ammunition": {
      if (Number.isInteger(command.rounds) && command.rounds >= 0) {
        sim.artillery.ammunition[command.side][command.shell] = command.rounds
      }
      return
    }
    case "wind": {
      if (Number.isFinite(command.x) && Number.isFinite(command.z)) {
        holdWeather(sim, command)
      }
      return
    }
    case "clock": {
      const { clock } = sim.environment
      if (command.week !== undefined && Number.isFinite(command.week)) {
        startWeek(sim, command.week)
      }
      if (command.at !== undefined && Number.isFinite(command.at)) {
        Object.assign(clock, clockAt(command.at))
      }
      if (command.shift !== undefined && Number.isFinite(command.shift)) {
        clock.elapsed += command.shift
      }
      if (command.minutesPerDay !== undefined && command.minutesPerDay > 0 && Number.isFinite(command.minutesPerDay)) {
        clock.minutesPerDay = command.minutesPerDay
      }
      updateEnvironment(sim)
      return
    }
    case "forecast": {
      sim.environment.forecast = createForecast(command.forecast)
      updateEnvironment(sim)
      return
    }
    case "fire-mission": {
      orderFireMission(sim, command.plan)
      return
    }
    case "barrage-attack": {
      const direction = Math.sign(command.objectiveZ - command.startZ) || 1
      const mission = orderFireMission(sim, {
        side: command.side,
        shell: Shell.FieldHighExplosive,
        fromX: command.fromX,
        toX: command.toX,
        z: command.startZ,
        band: 25,
        roundsPerMinute: command.roundsPerMinute,
        delay: command.delay,
        // Creeping barrages end when they reach their stop line; the duration is only a backstop. JSON has no Infinity.
        duration: 3600,
        cutsWire: false,
        // Past the objective, jump to a protective barrage 150 m beyond it and hold for about five minutes while the
        // attackers consolidate.
        creep: {
          lift: command.lift,
          interval: command.interval,
          stopZ: command.objectiveZ + direction * 4 * command.lift,
          protect: { objectiveZ: command.objectiveZ, lineZ: command.objectiveZ + direction * 150 }
        }
      })
      const standing = command.standingRoundsPerMinute ?? 0
      if (standing > 0) {
        // Lifts when the creeping barrage is one lift short of the objective's near edge, so the two never overlap.
        const depth = command.objectiveDepth ?? 0
        const nearEdge = command.objectiveZ - direction * depth
        const lifts = Math.max(0, Math.ceil((Math.abs(nearEdge - command.startZ) - command.lift) / command.lift))
        const target = {
          side: command.side,
          fromX: command.fromX,
          toX: command.toX,
          z: command.objectiveZ - (direction * depth) / 2,
          band: depth + 20,
          delay: command.delay,
          duration: lifts * command.interval,
          cutsWire: false
        }
        orderFireMission(sim, { ...target, shell: Shell.FieldHighExplosive, roundsPerMinute: standing })
        orderFireMission(sim, { ...target, shell: Shell.HeavyHighExplosive, roundsPerMinute: standing / 5 })
      }
      // Lanes through their own wire for the squads going over, out to the middle of no man's land: the belts were
      // gapped the night before an attack, or the first wave would hang on its own side's wire.
      const ownWireTo = (command.startZ + command.objectiveZ - direction * (command.objectiveDepth ?? 0)) / 2
      for (const squad of sim.squads) {
        const chosen = command.squads === undefined || command.squads.includes(squad.id)
        if (squad.side === command.side && squad.leader >= 0 && chosen) {
          const { x, z } = sim.soldiers.position
          cutLane(
            sim,
            x[squad.leader],
            z[squad.leader],
            laneEnd(sim, command.side, x[squad.leader]) ?? ownWireTo,
            LANE_HALF_WIDTH
          )
          squad.order = {
            kind: "creep",
            mission,
            x: sim.soldiers.position.x[squad.leader],
            standoff: command.standoff,
            objectiveZ: command.objectiveZ
          }
        }
      }
      return
    }
  }
}
