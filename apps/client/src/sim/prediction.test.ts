import { beltLayout, createFlatMap, Surface, type WireBelt } from "@verdun/map"
import {
  applySync,
  type Command,
  createSimulation,
  createSquad,
  createSyncSource,
  enqueueCommand,
  isVaulting,
  Side,
  spawnSoldier,
  stepSimulation
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createPrediction } from "./prediction.ts"

const field = () => createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)

/** A server's battle with one player's squad, and the player's mirror of it. */
function battle() {
  const server = createSimulation({ map: field(), seed: 3 })
  const men = Array.from({ length: 4 }, (_, index) =>
    spawnSoldier(server, { side: Side.French, x: 40 + index * 3, z: 40 })
  )
  createSquad(server, Side.French, men, "player")
  const source = createSyncSource(server)
  const mirror = createSimulation({ map: field(), seed: 3 })
  applySync(mirror, source.take())
  return { server, source, mirror, leader: men[0] ?? -1 }
}

/**
 * Plays a battle over a link `delay` steps each way: the page steers its soldier by `steering(step)`, and its commands
 * reach the server `delay` steps later, as the server's syncs (every second step) and acknowledgements reach the page.
 * Returns where the page showed the soldier at each of its steps, and where the server had him at each tick.
 */
function play(
  delay: number,
  steps: number,
  steering: (step: number) => { x: number; z: number; run?: boolean } | null
) {
  const { server, source, mirror, leader } = battle()
  const prediction = createPrediction(mirror)
  const toServer: { arrives: number; step: number; commands: Command[] }[] = []
  const toPage: { arrives: number; deliver: () => void }[] = []
  const shown: number[] = []
  const truth: number[] = [server.soldiers.position.x[leader]]
  for (let step = 1; step <= steps; step++) {
    // The page's step: what it commands, and where it shows its soldier.
    const wanted = steering(step)
    if (wanted) {
      const commands: Command[] = [
        { type: "steer", soldier: leader, ...wanted },
        { type: "face", soldier: leader, x: 1, z: 0 }
      ]
      prediction.sent(step, commands)
      toServer.push({ arrives: step + delay, step, commands })
    }
    for (const message of toPage.filter((each) => each.arrives === step)) {
      message.deliver()
    }
    prediction.predict(step, leader)
    shown[step] = mirror.soldiers.position.x[leader]

    // The server's tick: commands that have arrived, a step, and a sync now and then.
    const batches = toServer.filter((each) => each.arrives === step)
    for (const batch of batches) {
      for (const command of batch.commands) {
        enqueueCommand(server, command)
      }
    }
    stepSimulation(server)
    source.stepped()
    truth[server.tick] = server.soldiers.position.x[leader]
    const tick = server.tick
    for (const batch of batches) {
      toPage.push({ arrives: step + delay, deliver: () => prediction.acknowledged(batch.step, tick) })
    }
    if (tick % 2 === 0) {
      const sync = source.take()
      toPage.push({
        arrives: step + delay,
        deliver: () => {
          applySync(mirror, sync)
          prediction.synced(sync.tick)
        }
      })
    }
  }
  return { shown, truth, mirror, leader }
}

describe("predicting the player's soldier", () => {
  it("shows him where the server will have him, a round trip before the server's word comes back", () => {
    const delay = 4
    const { shown, truth } = play(delay, 120, (step) => {
      if (step === 10) {
        return { x: 1, z: 0 }
      }
      if (step === 50) {
        return { x: 1, z: 0, run: true }
      }
      return step === 90 ? { x: 0, z: 0 } : null
    })

    // Once the first acknowledgement is in, the page is where the server gets to as its commands land.
    for (let step = 20; step <= 110; step++) {
      expect(shown[step]).toBeCloseTo(truth[step + delay] ?? 0, 2)
    }
    // Without prediction the page would show him a round trip late, metres behind at a run.
    expect((shown[80] ?? 0) - (truth[80 - delay] ?? 0)).toBeGreaterThan(1)
  })

  it("shows him as the server last had him until the server has acknowledged anything, facing where he's aimed", () => {
    const { shown, mirror, leader } = play(30, 25, (step) => (step === 2 ? { x: 1, z: 0 } : null))

    expect(shown[25]).toBe(40)
    expect(mirror.soldiers.facing.x[leader]).toBe(1)
    expect(mirror.soldiers.facing.z[leader]).toBe(0)
  })

  it("leaves him where the server has him while he climbs a fence, whatever the steering", () => {
    const belt: WireBelt = {
      points: [
        [0, 50],
        [100, 50]
      ]
    }
    const { fences, tangles } = beltLayout(belt)
    const bare = fences.find((fence) => !tangles.some((tangle) => Math.abs(tangle.x - fence.x) < 3))
    const fenced = () => ({ ...field(), wire: [belt] })
    const server = createSimulation({ map: fenced(), seed: 3 })
    // Facing the fence from 3 m short of it.
    const leader = spawnSoldier(server, { side: Side.French, x: bare?.x ?? 0, z: 47 })
    server.soldiers.facing.x[leader] = 0
    server.soldiers.facing.z[leader] = 1
    createSquad(server, Side.French, [leader], "player")
    const source = createSyncSource(server)
    const mirror = createSimulation({ map: fenced(), seed: 3 })
    applySync(mirror, source.take())
    const prediction = createPrediction(mirror)

    const commands: Command[] = [
      { type: "vault", soldier: leader },
      { type: "steer", soldier: leader, x: 1, z: 0 }
    ]
    prediction.sent(1, commands)
    for (const command of commands) {
      enqueueCommand(server, command)
    }
    stepSimulation(server)
    source.stepped()
    prediction.acknowledged(1, server.tick)
    applySync(mirror, source.take())
    prediction.synced(server.tick)
    prediction.predict(5, leader)

    expect(isVaulting(mirror, leader)).toBe(true)
    expect(mirror.soldiers.position.x[leader]).toBe(server.soldiers.position.x[leader])
    expect(mirror.soldiers.position.z[leader]).toBe(server.soldiers.position.z[leader])
  })

  it("follows the server's word when the server moved him otherwise", () => {
    const { server, source, mirror, leader } = battle()
    const prediction = createPrediction(mirror)
    prediction.sent(1, [{ type: "steer", soldier: leader, x: 1, z: 0 }])
    prediction.acknowledged(1, 1)
    // The server never got the steering: he stood still.
    stepSimulation(server)
    source.stepped()
    applySync(mirror, source.take())
    prediction.synced(server.tick)
    prediction.predict(1, leader)

    expect(mirror.soldiers.position.x[leader]).toBe(40)
    prediction.predict(5, leader)
    expect(mirror.soldiers.position.x[leader]).toBeGreaterThan(40)
    // Another soldier taken over starts from where the server has him.
    prediction.predict(5, leader + 1)
    expect(mirror.soldiers.position.x[leader + 1]).toBe(43)
  })
})
