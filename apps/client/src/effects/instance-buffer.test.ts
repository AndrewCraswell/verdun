import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
import { bucketInstanceCounts, drawnCount, INSTANCE_BUCKET, instanceBuffer } from "./instance-buffer.ts"

const engines: NullEngine[] = []
afterEach(() => {
  bucketInstanceCounts(false)
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function mesh() {
  const engine = new NullEngine()
  engines.push(engine)
  return CreateBox("box", { size: 1 }, new Scene(engine))
}

/** Writes an instance standing at x. */
function place(data: Float32Array, index: number, x: number) {
  data.fill(0, index * 16, index * 16 + 16)
  data[index * 16] = 1
  data[index * 16 + 5] = 1
  data[index * 16 + 10] = 1
  data[index * 16 + 12] = x
  data[index * 16 + 15] = 1
}

describe("instanceBuffer", () => {
  it("draws exactly as many as live, unless bucketing for snapshot rendering", () => {
    expect(drawnCount(0, 100)).toBe(0)
    expect(drawnCount(37, 100)).toBe(37)
  })

  it("draws whole buckets, never more than there's room for", () => {
    bucketInstanceCounts(true)
    expect(drawnCount(0, 100)).toBe(0)
    expect(drawnCount(1, 100)).toBe(INSTANCE_BUCKET)
    expect(drawnCount(INSTANCE_BUCKET + 1, 100)).toBe(INSTANCE_BUCKET * 2)
    expect(drawnCount(90, 100)).toBe(96)
    expect(drawnCount(97, 100)).toBe(100)
  })

  it("collapses the bucket's spare instances, and those left from a busier frame, to nothing", () => {
    bucketInstanceCounts(true)
    const box = mesh()
    const buffer = instanceBuffer(box, 64)
    for (let index = 0; index < 40; index++) {
      place(buffer.data, index, index + 1)
    }
    buffer.commit(40)
    expect(box.thinInstanceCount).toBe(64)
    expect(buffer.matrices().map((matrix) => matrix.m[12])).toHaveLength(40)

    buffer.commit(3)
    expect(box.thinInstanceCount).toBe(INSTANCE_BUCKET)
    expect(buffer.matrices().map((matrix) => matrix.m[12])).toEqual([1, 2, 3])
    // Left over from the 40: zeroed, so drawn as nothing.
    expect(buffer.data.subarray(3 * 16, 40 * 16).every((value) => value === 0)).toBe(true)

    buffer.commit(0)
    buffer.commit(0)
    expect(box.thinInstanceCount).toBe(0)
  })

  it("hides the mesh while it draws nothing, rather than have Babylon draw it once at the origin", () => {
    const box = mesh()
    const buffer = instanceBuffer(box, 8)
    expect(box.isVisible).toBe(false)
    // Never given an instance: hidden still.
    buffer.commit(0)
    expect(box.isVisible).toBe(false)

    place(buffer.data, 0, 5)
    buffer.commit(1)
    expect(box.isVisible).toBe(true)
    buffer.commit(0)
    expect(box.isVisible).toBe(false)
    // In whole buckets too, none live is none drawn.
    bucketInstanceCounts(true)
    buffer.commit(1)
    expect(box.isVisible).toBe(true)
    buffer.commit(0)
    expect(box.isVisible).toBe(false)
  })

  it("grows when more instances are wanted, keeping those written", () => {
    const box = mesh()
    const buffer = instanceBuffer(box, 2)
    place(buffer.data, 0, 7)
    buffer.reserve(2)
    buffer.reserve(50)
    place(buffer.data, 49, 9)
    buffer.commit(50)

    expect(buffer.data.length).toBeGreaterThanOrEqual(50 * 16)
    expect(buffer.matrices()[0]?.m[12]).toBe(7)
    expect(buffer.matrices()[49]?.m[12]).toBe(9)
  })
})
