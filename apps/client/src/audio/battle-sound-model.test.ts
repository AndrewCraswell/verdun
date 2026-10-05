import { createFlatMap, layOutFront, mapDepth, Surface } from "@verdun/map"
import {
  createSimulation,
  createSquad,
  isInTrench,
  type LineOfSight,
  MaskState,
  Shell,
  type SimEvent,
  Side,
  type Simulation,
  spawnSoldier,
  Stance,
  stepSimulation,
  TICK_RATE,
  Weapon
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import {
  airCutoff,
  createBattleSoundModel,
  FULL_BAND,
  hearingDistance,
  listenerSpace,
  type Listener,
  placeSound,
  SPEED_OF_SOUND
} from "./battle-sound-model.ts"

/** Looking straight down at (100, 40) from 40 m up, with the screen's right along +x. The test map is 300 m by 200 m. */
const LISTENER: Listener = { x: 100, z: 40, height: 40, rightX: 1, rightZ: 0 }

function battle() {
  const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5, Surface.Grass)
  const sim = createSimulation({ map: { ...flat, trenches: layOutFront(flat) }, seed: 1 })
  const french = spawnSoldier(sim, { side: Side.French, x: 100, z: 30 })
  const german = spawnSoldier(sim, { side: Side.German, x: 100, z: 190 })
  const gunner = spawnSoldier(sim, { side: Side.German, x: 110, z: 60, weapon: Weapon.MachineGun })
  return { sim, french, german, gunner }
}

/** Replaces the events of the step just taken, as if the simulation had produced them. */
function happen(sim: Simulation, ...events: SimEvent[]): void {
  sim.events.length = 0
  sim.events.push(...events)
}

function shot(shooter: number, from: { x: number; z: number }, to: { x: number; z: number }): SimEvent {
  return { type: "shot", shooter, target: -1, hit: false, from: { ...from, y: 1.6 }, to: { ...to, y: 1.2 } }
}

describe("placeSound", () => {
  it("is full volume up close, fades with distance and arrives at the speed of sound", () => {
    const near = placeSound(LISTENER, "heavy-far", 100, 40)
    const far = placeSound(LISTENER, "heavy-far", 100, 900)
    expect(near?.volume).toBe(1)
    expect(far?.volume).toBeCloseTo(200 / hearingDistance(LISTENER, 100, 900))
    expect(far?.delay).toBeCloseTo(hearingDistance(LISTENER, 100, 900) / SPEED_OF_SOUND)
  })

  it("pans toward the side of the screen the sound is on", () => {
    expect(placeSound(LISTENER, "rifle-fr-near", 140, 40)?.pan).toBeGreaterThan(0.5)
    expect(placeSound(LISTENER, "rifle-fr-near", 60, 40)?.pan).toBeLessThan(-0.5)
    expect(placeSound({ ...LISTENER, rightX: -1 }, "rifle-fr-near", 140, 40)?.pan).toBeLessThan(-0.5)
  })

  it("drops sounds too far off to hear", () => {
    expect(placeSound(LISTENER, "death", 100, 2000)).toBeNull()
  })
})

describe("createBattleSoundModel", () => {
  it("plays each side's rifle, near or far by distance, and the bolt worked after a shot nearby", () => {
    const { sim, french, german } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(
      sim,
      shot(french, { x: 100, z: 30 }, { x: 100, z: 190 }),
      shot(german, { x: 100, z: 190 }, { x: 100, z: 70 })
    )
    // The German round flies on past its mark, straight over the listener.
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual([
      "rifle-fr-near",
      "bolt-fr",
      "rifle-de-far",
      "bullet-whizz"
    ])
  })

  it("plays a nearby machine gun round by round, a distant one a burst at a time", () => {
    const { sim, french, gunner } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    const round = shot(gunner, { x: 110, z: 60 }, { x: 100, z: 120 })
    happen(sim, round, round)
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["mg-near", "mg-near"])

    const far = { ...LISTENER, z: 190 }
    happen(sim, round)
    expect(model.step(far).map((call) => call.cue)).toEqual(["mg-far"])
    sim.tick += 1
    happen(sim, round)
    expect(model.step(far)).toEqual([])
    sim.tick += 2 * TICK_RATE
    happen(sim, round)
    expect(model.step(far).map((call) => call.cue)).toEqual(["mg-far"])
  })

  it("cracks rounds past the listener when they come from far off, but not from close by", () => {
    const { sim, french, german } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim, shot(german, { x: 100, z: 190 }, { x: 102, z: 41 }))
    const calls = model.step(LISTENER)
    // It cracks and zips past as it arrives, about 0.2 s after it's fired from 150 m off.
    expect(calls.map((call) => call.cue)).toEqual(["rifle-de-far", "crack", "bullet-whizz"])
    expect(calls[1]?.delay).toBeGreaterThan(0.19)
    expect(calls[2]?.delay).toBeGreaterThan(0.19)
    sim.tick += TICK_RATE
    happen(sim, shot(french, { x: 100, z: 30 }, { x: 101, z: 41 }))
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["rifle-fr-near", "bolt-fr"])
  })

  it("hears what each round strikes: the wire, a parapet, mud, snow, water, the ruins' stone, now and then a ricochet", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french, ruins: (x) => (x > 104 ? 1 : 0) })
    let time = 0
    const at = (x: number, on?: "ground" | "wire" | "parapet") =>
      model.strike(LISTENER, x, LISTENER.z, (time += 1), on)?.cue
    expect(at(101, "wire")).toBe("bullet-wire")
    expect(at(101, "parapet")).toBe("bullet-parapet")
    expect(at(106)).toBe("bullet-stone")
    expect([at(101), at(101), at(101), at(101)]).toEqual([
      "bullet-impact",
      "bullet-impact",
      "bullet-impact",
      "bullet-ricochet"
    ])
    sim.environment.weather = { ...sim.environment.weather, wetness: 0.8, temperature: 10 }
    expect(at(101)).toBe("bullet-mud")
    sim.environment.weather = { ...sim.environment.weather, wetness: 0, snowCover: 10 }
    expect(at(101)).toBe("bullet-snow")
  })

  it("hears rounds strike the ground nearby as they land, not one on top of another", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    expect(model.strike(LISTENER, LISTENER.x + 5, LISTENER.z, 10)?.cue).toBe("bullet-impact")
    expect(model.strike(LISTENER, LISTENER.x + 5, LISTENER.z, 10.01)).toBeNull()
    expect(model.strike(LISTENER, LISTENER.x + 80, LISTENER.z, 11)).toBeNull()
    expect(model.strike(LISTENER, LISTENER.x - 3, LISTENER.z + 3, 11)?.cue).toBe("bullet-impact")
  })

  it("hears Very lights go up", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim, { type: "flare", side: Side.French, x: 100, z: 60 })
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["flare"])
  })

  it("hears grenades thrown nearby, the thrower shouting it", () => {
    const { sim, french, german } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim, { type: "throw", soldier: french }, { type: "throw", soldier: german })
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["throw", "voice-grenade-fr"])
  })

  it("rains earth down after a burst close by, and leaves the controlled soldier's ears ringing", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    const crater = { minX: 95, minZ: 30, maxX: 105, maxZ: 40 }
    happen(sim, { type: "burst", shell: Shell.FieldHighExplosive, at: { x: 100, y: 5, z: 35 }, crater })
    const calls = model.step(LISTENER)
    expect(calls.map((call) => call.cue)).toEqual(["field-near", "voice-cover-fr", "debris", "ear-ring"])
    const delay = (cue: string) => calls.find((call) => call.cue === cue)?.delay ?? NaN
    expect(delay("debris")).toBeGreaterThan(delay("field-near"))
    expect(model.takeShock()).toBeCloseTo(1 - 5 / 15)
    expect(model.takeShock()).toBe(0)
  })

  it("hears a heavy shell rushing in just before it lands nearby, but never a field shell", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    const heavy = (z: number, seconds: number) => ({
      shell: Shell.HeavyHighExplosive,
      side: Side.German,
      x: 100,
      z,
      landsAtTick: sim.tick + seconds * TICK_RATE
    })
    sim.artillery.shells.push(heavy(60, 1), heavy(60, 5), {
      ...heavy(60, 1),
      shell: Shell.FieldHighExplosive
    })
    const rushes = model.step(LISTENER).filter((call) => call.cue === "incoming-heavy")
    expect(rushes).toHaveLength(1)
    expect(rushes[0]?.delay).toBeCloseTo(hearingDistance(LISTENER, 100, 60) / SPEED_OF_SOUND)
    expect(model.step(LISTENER).filter((call) => call.cue === "incoming-heavy")).toEqual([])
    sim.tick += 3 * TICK_RATE + 1
    expect(model.step(LISTENER).filter((call) => call.cue === "incoming-heavy")).toHaveLength(1)
  })

  it("plays each kind of burst, near or far", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    const burst = (shell: Shell, z: number): SimEvent => ({
      type: "burst",
      shell,
      at: { x: 100, y: 5, z },
      crater: null
    })
    happen(
      sim,
      burst(Shell.FieldHighExplosive, 60),
      burst(Shell.HeavyHighExplosive, 195),
      burst(Shell.FieldShrapnel, 50),
      burst(Shell.FieldGas, 45),
      burst(Shell.Grenade, 130)
    )
    // The machine gunner by the first burst shouts to take cover; no one else gets a word in so soon.
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual([
      "field-near",
      "voice-cover-de",
      "heavy-far",
      "shrapnel-near",
      "gas-shell",
      "grenade-far"
    ])
  })

  it("hears batteries far behind the lines as their shells are fired, delayed by the distance", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    sim.artillery.shells.push(
      { shell: Shell.HeavyHighExplosive, side: Side.German, x: 100, z: 150, landsAtTick: sim.tick + 200 },
      { shell: Shell.FieldHighExplosive, side: Side.German, x: 120, z: 150, landsAtTick: sim.tick + 200 }
    )
    const calls = model.step(LISTENER)
    // One report per interval, however many shells leave at once.
    expect(calls.map((call) => call.cue)).toEqual(["battery-heavy"])
    expect(calls[0]?.delay).toBeGreaterThan((mapDepth(sim.map) + 4000 - LISTENER.z) / SPEED_OF_SOUND)
    expect(model.step(LISTENER)).toEqual([])
  })

  it("hears men fall nearby, but not far off", () => {
    const { sim, french, german } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    sim.pendingCommands.push({ type: "kill", soldier: german })
    stepSimulation(sim)
    expect(model.step(LISTENER).filter((call) => call.cue === "death")).toEqual([])
    sim.pendingCommands.push({ type: "kill", soldier: french })
    stepSimulation(sim)
    expect(model.step(LISTENER).filter((call) => call.cue === "death")).toHaveLength(1)
  })

  it("strikes the gas gong when men nearby start masking, and breathes through the mask", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    sim.tick = 10
    happen(sim)
    expect(model.step(LISTENER)).toEqual([])
    sim.soldiers.mask.state[french] = MaskState.Donning
    sim.tick = 20
    const gongs = model.step(LISTENER).filter((call) => call.cue === "gas-gong")
    expect(gongs).toHaveLength(6)
    expect(gongs[5]?.delay).toBeGreaterThan(gongs[0]?.delay ?? Infinity)
    expect(model.breathingInMask()).toBe(false)
    sim.soldiers.mask.state[french] = MaskState.On
    expect(model.breathingInMask()).toBe(true)
    sim.tick = 30
    expect(model.step(LISTENER)).toEqual([])
  })

  it("breathes short and hard while pinned down, unless masked", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    expect(model.breathingPinned()).toBe(false)
    sim.soldiers.suppression.value[french] = 0.9
    expect(model.breathingPinned()).toBe(true)
    sim.soldiers.mask.state[french] = MaskState.On
    expect(model.breathingPinned()).toBe(false)
  })

  it("breathes in no mask when there's no soldier to control", () => {
    const { sim } = battle()
    expect(createBattleSoundModel(sim, { soldier: () => null }).breathingInMask()).toBe(false)
  })
})

/** Sight lines that are always blocked, or always clear. */
function sightLines(clear: boolean): LineOfSight {
  return { isClear: () => clear, rebuildRegion: () => 0, setSightHeight: () => undefined, dispose: () => undefined }
}

describe("airCutoff", () => {
  it("takes more of the highs off the further a sound comes", () => {
    expect(airCutoff(0)).toBeLessThanOrEqual(FULL_BAND)
    expect(airCutoff(150)).toBeLessThan(airCutoff(20))
    expect(airCutoff(4000)).toBeGreaterThanOrEqual(400)
    expect(placeSound(LISTENER, "heavy-far", 100, 900)?.cutoff).toBeCloseTo(
      airCutoff(hearingDistance(LISTENER, 100, 900))
    )
  })
})

describe("occlusion", () => {
  it("muffles sounds with the ground in the way when the camera is close, and not when it's high", () => {
    const { sim, french, german } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    const fire = () => shot(german, { x: 100, z: 190 }, { x: 100, z: 120 })
    happen(sim, fire())
    const open = model.step(LISTENER)[0]
    sim.lineOfSight = sightLines(false)
    happen(sim, fire())
    const blocked = model.step(LISTENER)[0]
    expect(blocked?.volume).toBeLessThan(open?.volume ?? 0)
    expect(blocked?.cutoff).toBeLessThanOrEqual(1400)
    happen(sim, fire())
    expect(model.step({ ...LISTENER, height: 300 })[0]?.cutoff).toBeGreaterThan(1400)
    sim.lineOfSight = sightLines(true)
    happen(sim, fire())
    expect(model.step(LISTENER)[0]?.cutoff).toBeCloseTo(open?.cutoff ?? 0)
  })
})

describe("listenerSpace", () => {
  const none = () => 0

  it("is a trench where the camera looks down into one, fading as the camera climbs", () => {
    const { sim } = battle()
    let inside: { x: number; z: number } | null = null
    for (let z = 0; z < 200 && !inside; z += 0.5) {
      for (let x = 0; x < 300 && !inside; x += 0.5) {
        if (isInTrench(sim.map, x, z)) {
          inside = { x, z }
        }
      }
    }
    expect(inside).not.toBeNull()
    const listener = { ...LISTENER, ...inside, height: 30 }
    expect(listenerSpace(sim, listener, null, none)).toEqual({ trench: 1, dugout: 0, ruins: 0 })
    expect(listenerSpace(sim, { ...listener, height: 90 }, null, none).trench).toBeCloseTo(0.5)
    expect(listenerSpace(sim, { ...listener, height: 200 }, null, none)).toEqual({ trench: 0, dugout: 0, ruins: 0 })
  })

  it("is the dugout when the controlled soldier shelters close by, and ruins where they stand thick", () => {
    const { sim, french } = battle()
    const close = { ...LISTENER, height: 30 }
    expect(listenerSpace(sim, close, french, () => 0.5).ruins).toBeCloseTo(0.5)
    sim.soldiers.stance.value[french] = Stance.Sheltering
    expect(listenerSpace(sim, close, french, () => 0.5)).toEqual({ trench: 0, dugout: 1, ruins: 0 })
    expect(listenerSpace(sim, { ...close, z: 150 }, french, none).dugout).toBe(0)
  })
})

describe("voices", () => {
  it("hears a man cry out when hit nearby, but not when he falls or is far off", () => {
    const { sim, french, german } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    sim.tick = 4
    happen(sim)
    sim.soldiers.health.value[french] = 0.5
    sim.soldiers.health.value[german] = 0.5
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["pain"])
    sim.tick = 8
    expect(model.step(LISTENER)).toEqual([])
  })

  it("cheers when a squad nearby goes over the top, once, and hears the enemy's counter-attack", () => {
    const { sim, french } = battle()
    const squad = createSquad(sim, Side.French, [french], "ai")
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim)
    expect(model.step(LISTENER)).toEqual([])
    squad.order = { kind: "advance", x: 100, z: 150 }
    const calls = model.step(LISTENER)
    // The leader cries out to go, and the men cheer after him.
    expect(calls.map((call) => call.cue)).toEqual(["voice-charge-fr", "charge"])
    expect(calls[1]?.delay).toBeGreaterThan(calls[0]?.delay ?? Infinity)
    expect(model.step(LISTENER)).toEqual([])
    happen(sim, { type: "counter-attack", side: Side.German })
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["charge"])
  })

  it("shouts one at a time, and not the same line again too soon", () => {
    const { sim, french } = battle()
    const comrade = spawnSoldier(sim, { side: Side.French, x: 105, z: 35 })
    const enemy = spawnSoldier(sim, { side: Side.German, x: 100, z: 60 })
    const model = createBattleSoundModel(sim, { soldier: () => french })
    const shouts = () => model.step(LISTENER).filter((call) => call.cue.startsWith("voice-"))
    happen(sim, { type: "throw", soldier: french }, { type: "throw", soldier: enemy })
    expect(shouts().map((call) => call.cue)).toEqual(["voice-grenade-fr"])
    sim.tick += 2 * TICK_RATE
    happen(sim, { type: "throw", soldier: comrade }, { type: "throw", soldier: enemy })
    // Each in his own language: the French line was just shouted, so the German's is heard.
    expect(shouts().map((call) => call.cue)).toEqual(["voice-grenade-de"])
    sim.tick += 5 * TICK_RATE
    happen(sim, { type: "throw", soldier: comrade })
    expect(shouts().map((call) => call.cue)).toEqual(["voice-grenade-fr"])
  })

  it("hears a leader shout his orders, and whistles blow at zero hour before the cry to go", () => {
    const { sim, french } = battle()
    const squad = createSquad(sim, Side.French, [french], "ai")
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim)
    model.step(LISTENER)
    squad.order = { kind: "follow" }
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["voice-follow-fr"])
    sim.tick += 2 * TICK_RATE
    squad.order = { kind: "hold" }
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["voice-hold-fr"])
    sim.tick += 2 * TICK_RATE
    squad.order = { kind: "creep", mission: 0, x: 100, standoff: 50, objectiveZ: 150 }
    const calls = model.step(LISTENER)
    expect(calls.map((call) => call.cue)).toEqual(["whistle", "voice-charge-fr", "charge"])
    expect(calls[1]?.delay).toBeGreaterThan(calls[0]?.delay ?? Infinity)
  })

  it("goes over the top in silence on a raid", () => {
    const { sim, french } = battle()
    const squad = createSquad(sim, Side.French, [french], "ai")
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim)
    model.step(LISTENER)
    squad.order = { kind: "raid", x: 100, z: 150, homeX: 100, homeZ: 30, phase: "out" }
    expect(model.step(LISTENER)).toEqual([])
  })

  it("hears men give themselves up, and the side taking ground cheer it", () => {
    const { sim, french, gunner } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim, { type: "capture", soldier: gunner })
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["voice-surrender-de"])
    sim.objectives.push({ name: "the farm", x: 100, z: 35, radius: 20, holder: Side.French, contested: false })
    sim.tick += 2 * TICK_RATE
    happen(sim, { type: "objective-taken", name: "the farm", side: Side.French })
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["voice-taken-fr", "cheer"])
  })

  it("hears a man break as his nerve goes", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim)
    sim.tick = 4
    sim.soldiers.morale.value[french] = 0.1
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["voice-broken-fr"])
    sim.tick = 8 + 10 * TICK_RATE
    expect(model.step(LISTENER)).toEqual([])
  })

  it("cries the gas alarm as the gong is struck", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    sim.tick = 10
    happen(sim)
    model.step(LISTENER)
    sim.soldiers.mask.state[french] = MaskState.Donning
    sim.tick = 20
    expect(model.step(LISTENER).map((call) => call.cue)).toContain("voice-gas-fr")
  })

  it("shouts as a man is pinned down, once, and calls out every second time a man is hit", () => {
    const { sim, french } = battle()
    const model = createBattleSoundModel(sim, { soldier: () => french })
    happen(sim)
    const at = (seconds: number) => {
      sim.tick = Math.round((seconds * TICK_RATE) / 4) * 4
      return model.step(LISTENER).map((call) => call.cue)
    }
    sim.soldiers.suppression.value[french] = 0.9
    expect(at(1)).toEqual(["voice-pinned-fr"])
    expect(at(10)).toEqual([])
    sim.soldiers.health.value[french] = 0.8
    expect(at(20)).toEqual(["pain"])
    sim.soldiers.health.value[french] = 0.6
    expect(at(30)).toEqual(["pain", "voice-hit-fr"])
  })
})
