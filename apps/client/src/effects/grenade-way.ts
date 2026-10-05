import { GRENADE_FUSE, lob, STEP_SECONDS, type ThrownGrenade } from "@verdun/sim"

/**
 * Where a thrown grenade is, moment by moment, for drawing it: in the thrower's hand while he primes it and swings, in
 * the air along the arc the simulation threw it on, rolling back from wherever it struck short, and lying where it came
 * to rest until it bursts. The simulation only knows where it bursts and when (combat.ts); this fills in the way there.
 */

/** Seconds from the throw until the grenade leaves the hand: he primes it and swings his arm back. */
const RELEASE = 0.8
/** Metres per second it starts rolling at, slowing to a stop where it comes to rest. */
const ROLL_SPEED = 3
/** It turns over this many times a second in the air. */
const TUMBLE = 2.2

type GrenadePhase = "hand" | "air" | "rolling" | "lying"

interface GrenadePlace {
  readonly phase: GrenadePhase
  readonly x: number
  /** Its height: in the air, its middle's; rolling or lying, the ground's, for the view to lay it on its side there. */
  readonly y: number
  readonly z: number
  /** How far it has turned over end over end in the air, in radians; nothing once it's down, lying on its side. */
  readonly tumble: number
}

export interface GrenadeWay {
  /** The way it was thrown, as a compass heading: radians clockwise from north (+z), toward +x. */
  readonly heading: number
  /** Seconds after the throw when it leaves the hand, comes down, comes to rest and bursts. */
  readonly leaves: number
  readonly lands: number
  readonly rests: number
  readonly bursts: number
  /** Where it is, a number of seconds after the throw. */
  at(seconds: number): GrenadePlace
}

/** The tick a grenade was thrown on, from the tick it bursts on. */
export function thrownTick(grenade: ThrownGrenade): number {
  return grenade.burstTick - Math.round(GRENADE_FUSE / STEP_SECONDS)
}

export function grenadeWay(grenade: ThrownGrenade, heightAt: (x: number, z: number) => number): GrenadeWay {
  const { from, mark, struck, rest } = grenade
  const arc = lob(from, mark)
  const down = struck ?? mark
  const airborne = Math.hypot(down.x - from.x, down.z - from.z)
  const headingX = (mark.x - from.x) / arc.span
  const headingZ = (mark.z - from.z) / arc.span
  const flying = arc.seconds(airborne)
  const rolling = Math.hypot(rest.x - down.x, rest.z - down.z)
  const bursts = (grenade.burstTick - thrownTick(grenade)) * STEP_SECONDS
  // Slowing evenly from its rolling speed to a stop takes twice as long as rolling there at that speed.
  let rollSeconds = (2 * rolling) / ROLL_SPEED
  // It leaves the hand in time to come to rest before it bursts: a throw that takes long goes sooner.
  const leaves = Math.min(RELEASE, Math.max(0, bursts - flying - rollSeconds - 0.2))
  const lands = Math.min(bursts, leaves + flying)
  rollSeconds = Math.min(rollSeconds, bursts - lands)
  const rests = lands + rollSeconds

  return {
    heading: Math.atan2(headingX, headingZ),
    leaves,
    lands,
    rests,
    bursts,
    at(seconds) {
      if (seconds < leaves) {
        return { phase: "hand", x: from.x, y: from.y, z: from.z, tumble: 0 }
      }
      if (seconds < lands) {
        const along = (airborne * (seconds - leaves)) / Math.max(flying, 1e-6)
        return {
          phase: "air",
          x: from.x + headingX * along,
          y: arc.height(along),
          z: from.z + headingZ * along,
          tumble: (seconds - leaves) * TUMBLE * 2 * Math.PI
        }
      }
      if (seconds < rests && rollSeconds > 0) {
        const share = (seconds - lands) / rollSeconds
        // Slowing to a stop: quick at first, easing in.
        const gone = 1 - (1 - share) * (1 - share)
        const x = down.x + (rest.x - down.x) * gone
        const z = down.z + (rest.z - down.z) * gone
        return { phase: "rolling", x, y: heightAt(x, z), z, tumble: 0 }
      }
      return { phase: "lying", x: rest.x, y: heightAt(rest.x, rest.z), z: rest.z, tumble: 0 }
    }
  }
}
