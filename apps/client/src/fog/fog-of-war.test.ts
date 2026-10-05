import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { Scene } from "@babylonjs/core/scene"
import { carveTrenches, createFlatMap, sampleIndex, TRENCH_PROFILE, type Trench } from "@verdun/map"
import {
  createSimulation,
  createSquad,
  enqueueCommand,
  EYE_HEIGHT,
  type LineOfSight,
  Side,
  spawnSoldier,
  Stance,
  stepSimulation
} from "@verdun/sim"
import { createLineOfSight } from "@verdun/sim/physics"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FogOfWarPlugin } from "./fog-of-war-plugin.ts"
import { createFogOfWar } from "./fog-of-war.ts"
import { computeViewshed, createFogGrid, type FogGrid } from "./viewshed.ts"

function seen(grid: FogGrid, x: number, z: number): boolean {
  return grid.values[Math.floor(z / grid.cellSize) * grid.columns + Math.floor(x / grid.cellSize)] === 255
}

/** Flat ground 100 m square with a 4 m high ridge running east-west at z = 50. */
function ridgeMap() {
  const map = createFlatMap({ name: "ridge", cellSize: 0.5, columns: 200, rows: 200 })
  for (let row = 96; row <= 104; row++) {
    for (let column = 0; column <= 200; column++) {
      map.heights[sampleIndex(map, column, row)] = 4
    }
  }
  return map
}

describe("computeViewshed", () => {
  it("covers the map in coarse fog cells", () => {
    const grid = createFogGrid(createFlatMap({ name: "m", cellSize: 0.5, columns: 1200, rows: 800 }))

    expect([grid.columns, grid.rows, grid.values.length]).toEqual([300, 200, 60_000])
  })

  it("can't see past a house's shell, as the enemy can't", () => {
    const map = {
      ...createFlatMap({ name: "village", cellSize: 0.5, columns: 200, rows: 200 }),
      scenery: [{ kind: "ruin" as const, x: 50, z: 60, heading: 0, variant: 1, scale: 1 }]
    }
    const grid = createFogGrid(map)
    computeViewshed(map, { x: 50, y: EYE_HEIGHT, z: 40 }, 45, grid)

    expect(seen(grid, 50, 50)).toBe(true)
    // Behind the house, and beside it in the open.
    expect(seen(grid, 50, 75)).toBe(false)
    expect(seen(grid, 75, 75)).toBe(true)
  })

  it("sees open ground out to its range and nothing beyond", () => {
    const map = createFlatMap({ name: "flat", cellSize: 0.5, columns: 200, rows: 200 })
    const grid = createFogGrid(map)
    computeViewshed(map, { x: 50, y: EYE_HEIGHT, z: 50 }, 30, grid)

    expect(seen(grid, 50, 50)).toBe(true)
    expect(seen(grid, 75, 50)).toBe(true)
    expect(seen(grid, 50, 25)).toBe(true)
    expect(seen(grid, 90, 50)).toBe(false)
  })

  it("hides the dead ground behind a ridge but sees the ridge itself", () => {
    const map = ridgeMap()
    const grid = createFogGrid(map)
    computeViewshed(map, { x: 50, y: EYE_HEIGHT, z: 20 }, 100, grid)

    expect(seen(grid, 50, 40)).toBe(true)
    expect(seen(grid, 50, 49)).toBe(true)
    expect(seen(grid, 50, 60)).toBe(false)
    expect(seen(grid, 50, 90)).toBe(false)
  })

  it("clears previous results and stops at the map edge", () => {
    const map = createFlatMap({ name: "flat", cellSize: 0.5, columns: 200, rows: 200 })
    const grid = createFogGrid(map)
    computeViewshed(map, { x: 10, y: EYE_HEIGHT, z: 10 }, 20, grid)
    computeViewshed(map, { x: 99, y: EYE_HEIGHT, z: 99 }, 20, grid)

    expect(seen(grid, 10, 10)).toBe(false)
    expect(seen(grid, 99, 99)).toBe(true)
  })
})

const engines: NullEngine[] = []
const sightLines: LineOfSight[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
  for (const lineOfSight of sightLines.splice(0)) {
    lineOfSight.dispose()
  }
})

function scene(): Scene {
  const engine = new NullEngine()
  engines.push(engine)
  return new Scene(engine)
}

describe("FogOfWarPlugin", () => {
  it("darkens unseen ground in both shader languages, before distance fog", () => {
    const material = new StandardMaterial("ground", scene())
    const texture = new Texture(null, null)
    const plugin = new FogOfWarPlugin(material, { texture, mapWidth: 200, mapDepth: 100 })
    const samplers: string[] = []
    const textures: unknown[] = []
    plugin.getSamplers(samplers)
    plugin.getActiveTextures(textures as never[])

    expect(plugin.getClassName()).toBe("FogOfWarPlugin")
    expect(plugin.isCompatible(ShaderLanguage.WGSL)).toBe(true)
    expect(plugin.isCompatible(ShaderLanguage.GLSL)).toBe(true)
    expect(samplers).toEqual(["fogOfWar"])
    expect(textures).toEqual([texture])
    expect(plugin.hasTexture(texture)).toBe(true)
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      expect(plugin.getCustomCode("fragment", language)?.CUSTOM_FRAGMENT_BEFORE_FOG).toContain("fogOfWarParams")
    }
    expect(plugin.getCustomCode("vertex")).toBeNull()
    expect(plugin.getUniforms(ShaderLanguage.GLSL).fragment).toContain("uniform vec4 fogOfWarParams;")
    expect(plugin.getUniforms(ShaderLanguage.WGSL).fragment).toBe("")
  })

  it("binds the map scale and how dark unseen ground is", () => {
    const material = new StandardMaterial("ground", scene())
    const texture = new Texture(null, null)
    const plugin = new FogOfWarPlugin(material, { texture, mapWidth: 200, mapDepth: 100, unseenBrightness: 0.3 })
    const buffer = {
      updateFloat4: vi.fn<UniformBuffer["updateFloat4"]>(),
      setTexture: vi.fn<UniformBuffer["setTexture"]>()
    }
    plugin.bindForSubMesh(buffer as unknown as UniformBuffer)

    expect(buffer.updateFloat4).toHaveBeenCalledWith("fogOfWarParams", 0.005, 0.01, 0.3, 0)
    expect(buffer.setTexture).toHaveBeenCalledWith("fogOfWar", texture)

    plugin.darkenUnseen = false
    plugin.bindForSubMesh(buffer as unknown as UniformBuffer)
    expect(buffer.updateFloat4).toHaveBeenLastCalledWith("fogOfWarParams", 0.005, 0.01, 1, 0)
  })
})

describe("createFogOfWar", () => {
  async function trenchSetup() {
    const map = createFlatMap({ name: "trench", cellSize: 0.5, columns: 200, rows: 200 })
    const trench: Trench = {
      kind: "fire",
      points: [
        [10, 30],
        [90, 30]
      ],
      facing: "north"
    }
    carveTrenches(map, [trench])
    const sim = createSimulation({ map, seed: 1 })
    const player = spawnSoldier(sim, { side: Side.French, x: 50, z: 30 })
    const lookout = spawnSoldier(sim, { side: Side.French, x: 40, z: 30 })
    const friend = spawnSoldier(sim, { side: Side.French, x: 20, z: 30 })
    const enemyInOpen = spawnSoldier(sim, { side: Side.German, x: 55, z: 80 })
    const squad = createSquad(sim, Side.French, [player, lookout])
    const lineOfSight = await createLineOfSight(map)
    sightLines.push(lineOfSight)
    const fog = createFogOfWar(scene(), sim, lineOfSight, {
      squad,
      groundMaterial: new StandardMaterial("ground", scene()),
      framesPerUpdate: 1
    })
    return { sim, squad, player, lookout, friend, enemyInOpen, fog, lineOfSight }
  }

  it("hides enemies from a soldier down in the trench, but always shows friends", async () => {
    const { friend, enemyInOpen, fog } = await trenchSetup()

    expect(fog.update(0)).toBe(true)
    expect(fog.visibleEnemies.has(enemyInOpen)).toBe(false)
    expect(fog.isShown(enemyInOpen)).toBe(false)
    expect(fog.isShown(friend)).toBe(true)
  })

  it("shows an enemy in the open once the player steps up onto the fire step", async () => {
    const { sim, player, enemyInOpen, fog } = await trenchSetup()
    sim.soldiers.position.z[player] = 30 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2
    fog.update(0)

    expect(fog.isShown(enemyInOpen)).toBe(true)
    expect(fog.plugin.getClassName()).toBe("FogOfWarPlugin")
  })

  it("never shows an enemy the server hasn't said its side can see, fog or not", async () => {
    const { sim, squad, player, friend, enemyInOpen, lineOfSight } = await trenchSetup()
    sim.soldiers.position.z[player] = 30 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2
    const known = new Set<number>()
    const fog = createFogOfWar(scene(), sim, lineOfSight, {
      squad,
      groundMaterial: new StandardMaterial("ground", scene()),
      framesPerUpdate: 1,
      known: (soldier) => known.has(soldier)
    })
    fog.update(0)

    expect(fog.isShown(enemyInOpen)).toBe(false)
    expect(fog.isShown(friend)).toBe(true)
    fog.enabled = false
    expect(fog.isShown(enemyInOpen)).toBe(false)
    known.add(enemyInOpen)
    expect(fog.isShown(enemyInOpen)).toBe(true)
  })

  it("only recomputes a few times a second", async () => {
    const { fog } = await trenchSetup()

    expect(fog.update(0)).toBe(true)
    expect(fog.update(0.1)).toBe(false)
    expect(fog.update(0.2)).toBe(true)
  })

  it("spreads each look over several frames, and does nothing while turned off", async () => {
    const { sim, squad, player, enemyInOpen, lineOfSight } = await trenchSetup()
    sim.soldiers.position.z[player] = 30 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2
    const sliced = createFogOfWar(scene(), sim, lineOfSight, {
      squad,
      groundMaterial: new StandardMaterial("ground", scene()),
      framesPerUpdate: 3
    })
    const casts = vi.spyOn(lineOfSight, "isClear")
    sliced.update(0)
    sliced.update(0)
    expect(sliced.update(0)).toBe(true)
    expect(sliced.isShown(enemyInOpen)).toBe(true)

    sliced.enabled = false
    casts.mockClear()
    expect(sliced.update(1)).toBe(true)
    expect(sliced.update(1)).toBe(false)
    expect(casts).not.toHaveBeenCalled()
  })

  it("doesn't see enemies beyond its range", async () => {
    const { sim, squad, player, enemyInOpen } = await trenchSetup()
    const lineOfSight = await createLineOfSight(sim.map)
    sightLines.push(lineOfSight)
    sim.soldiers.position.z[player] = 30 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2
    const shortSighted = createFogOfWar(scene(), sim, lineOfSight, {
      squad,
      groundMaterial: new StandardMaterial("ground", scene()),
      range: 20,
      framesPerUpdate: 1
    })
    shortSighted.update(0)

    expect(shortSighted.isShown(enemyInOpen)).toBe(false)
  })

  it("loses an enemy in the dark, finds him again under a flare, and shrinks the lit ground", async () => {
    const { sim, player, enemyInOpen, fog } = await trenchSetup()
    sim.soldiers.position.z[player] = 30 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2
    enqueueCommand(sim, { type: "clock", at: Date.UTC(1916, 5, 30, 23) })
    stepSimulation(sim)
    // Stepping lets the squad lay him down; stand him on the fire step to look out.
    sim.soldiers.stance.value[player] = Stance.Standing
    fog.update(0)
    expect(fog.isShown(enemyInOpen)).toBe(false)

    sim.flares.push({
      side: Side.French,
      fromX: 50,
      fromZ: 30,
      x: 55,
      z: 80,
      vx: 0,
      vz: 0,
      firedAt: sim.tick - 40,
      burnsOutAt: sim.tick + 100
    })
    fog.update(1)
    expect(fog.isShown(enemyInOpen)).toBe(true)
  })

  it("shows enemies any squad member can see, even when the soldier in control can't", async () => {
    const { sim, lookout, enemyInOpen, fog } = await trenchSetup()
    sim.soldiers.position.z[lookout] = 30 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2
    fog.update(0)

    expect(fog.isShown(enemyInOpen)).toBe(true)
  })

  it("lights everything and shows every soldier while turned off, and recomputes when turned back on", async () => {
    const { enemyInOpen, fog } = await trenchSetup()
    fog.update(0)
    fog.enabled = false

    expect(fog.plugin.darkenUnseen).toBe(false)
    expect(fog.isShown(enemyInOpen)).toBe(true)

    fog.enabled = true
    expect(fog.update(0)).toBe(true)
    expect(fog.isShown(enemyInOpen)).toBe(false)
  })

  it("darkens other materials too, such as props, and toggles them together", async () => {
    const { sim, squad } = await trenchSetup()
    const lineOfSight = await createLineOfSight(sim.map)
    sightLines.push(lineOfSight)
    const props = new StandardMaterial("props", scene())
    const fog = createFogOfWar(scene(), sim, lineOfSight, {
      squad,
      groundMaterial: new StandardMaterial("ground", scene()),
      materials: [props],
      framesPerUpdate: 1
    })

    expect(fog.plugins).toHaveLength(2)
    expect(fog.plugins[1]?.getClassName()).toBe("FogOfWarPlugin")
    fog.enabled = false
    expect(fog.plugins.every((plugin) => !plugin.darkenUnseen)).toBe(true)
  })

  it("fed from a worker, asks for looks only while shown, and darkens again only once a fresh look comes", async () => {
    const { sim, squad, enemyInOpen } = await trenchSetup()
    const watched: boolean[] = []
    let next: { ground: Uint8Array; enemies: Int32Array } | null = null
    const feed = {
      take: () => {
        const look = next
        next = null
        return look
      },
      watch: (on: boolean) => watched.push(on)
    }
    const fog = createFogOfWar(scene(), sim, feed, {
      squad,
      groundMaterial: new StandardMaterial("ground", scene()),
      enabled: false
    })
    expect(watched).toEqual([false])

    fog.enabled = true
    expect(watched).toEqual([false, true])
    fog.update(0.1)
    // No look yet: nothing darkened, everyone shown, though the fog counts as on.
    expect(fog.enabled).toBe(true)
    expect(fog.plugin.darkenUnseen).toBe(false)
    expect(fog.isShown(enemyInOpen)).toBe(true)

    next = { ground: new Uint8Array(0), enemies: new Int32Array() }
    fog.update(0.1)
    expect(fog.plugin.darkenUnseen).toBe(true)
    expect(fog.isShown(enemyInOpen)).toBe(false)
  })

  it("can start turned off", async () => {
    const { sim, squad, enemyInOpen } = await trenchSetup()
    const lineOfSight = await createLineOfSight(sim.map)
    sightLines.push(lineOfSight)
    const fog = createFogOfWar(scene(), sim, lineOfSight, {
      squad,
      groundMaterial: new StandardMaterial("ground", scene()),
      enabled: false,
      framesPerUpdate: 1
    })

    expect(fog.enabled).toBe(false)
    expect(fog.isShown(enemyInOpen)).toBe(true)
  })

  it("goes dark once the whole squad has fallen", async () => {
    const { sim, player, lookout, enemyInOpen, fog } = await trenchSetup()
    sim.soldiers.position.z[lookout] = 30 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2
    sim.pendingCommands.push({ type: "kill", soldier: player }, { type: "kill", soldier: lookout })
    stepSimulation(sim)
    fog.update(0)

    expect(fog.visibleEnemies.size).toBe(0)
    expect(fog.isShown(enemyInOpen)).toBe(false)
  })
})
