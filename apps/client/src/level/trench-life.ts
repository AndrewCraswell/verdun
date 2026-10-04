import { Constants } from "@babylonjs/core/Engines/constants"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder"
import "@babylonjs/core/Meshes/instancedMesh"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import { Sprite } from "@babylonjs/core/Sprites/sprite"
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager"
import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import type { Placement } from "./placement.ts"
import { TRENCH_PIECES } from "./trench-dressing.ts"

/** A blanket a metre wide and 1.6 m deep, hanging in its x = 0 plane, pleated where it was folded. */
const CURTAIN = { width: 1.05, height: 1.6, pleats: 6, depth: 0.05 } as const

/**
 * The gas curtain: a blanket nailed over a dugout's doorway and kept damp, so gas drifting along the trench wouldn't
 * pour down the steps. Made here rather than taken from the kit, which has none. Disabled, like the kit's pieces: the
 * dressing instances it.
 */
export function createGasCurtain(scene: Scene): Mesh {
  const positions: number[] = []
  const indices: number[] = []
  const normals: number[] = []
  for (let strip = 0; strip <= CURTAIN.pleats; strip++) {
    const z = (strip / CURTAIN.pleats - 0.5) * CURTAIN.width
    const x = (strip % 2 === 0 ? 1 : -1) * CURTAIN.depth
    // The bottom hangs a little out from the wall, heavy with damp.
    positions.push(x, CURTAIN.height / 2, z, x + 0.06, -CURTAIN.height / 2, z)
    normals.push(1, 0, 0, 1, 0, 0)
    if (strip > 0) {
      const top = strip * 2
      indices.push(top - 2, top, top - 1, top, top + 1, top - 1)
    }
  }
  const curtain = new Mesh(TRENCH_PIECES.gasCurtain, scene)
  const data = new VertexData()
  data.positions = positions
  data.indices = indices
  data.normals = normals
  data.applyToMesh(curtain)
  const material = new StandardMaterial("gas-curtain", scene)
  material.diffuseColor = Color3.FromHexString("#4b4636")
  material.specularColor = Color3.Black()
  material.backFaceCulling = false
  curtain.material = material
  curtain.setEnabled(false)
  return curtain
}

/** A dugout stove's pipe: a length of iron a hand's width across, standing this high out of the ground. */
const STOVEPIPE = { height: 0.8, diameter: 0.13 } as const

/**
 * The stovepipe over a dugout (see trench-dressing.ts): rusted iron poking out of the earth over the room, made here
 * since the kit has none. Disabled, like the kit's pieces: the dressing places it.
 */
export function createStovepipe(scene: Scene): Mesh {
  const pipe = CreateCylinder(
    TRENCH_PIECES.stovepipe,
    { height: STOVEPIPE.height, diameter: STOVEPIPE.diameter, tessellation: 6 },
    scene
  )
  // Its foot on the ground rather than its middle.
  pipe.bakeTransformIntoVertices(Matrix.Translation(0, STOVEPIPE.height / 2, 0))
  const material = new StandardMaterial("stovepipe", scene)
  material.diffuseColor = Color3.FromHexString("#2b2420")
  material.specularColor = Color3.Black()
  pipe.material = material
  pipe.setEnabled(false)
  return pipe
}

/** The mouths of the stovepipes the dressing placed, where their smoke comes out. */
export function stovepipeTops(placements: readonly Placement[]): Vector3[] {
  return placements
    .filter((placement) => placement.piece === TRENCH_PIECES.stovepipe)
    .map((placement) => new Vector3(placement.x, placement.y + STOVEPIPE.height, placement.z))
}

/** Effect sprites the trenches' life draws with. */
export interface TrenchLifeSprites {
  readonly fire: Texture
  readonly ember: Texture
  readonly puff: Texture
}

/** Where the trenches' life burns: braziers' open tops and stovepipes' mouths, and the wind its smoke drifts on. */
export interface TrenchFires {
  readonly braziers: readonly Vector3[]
  readonly stoves?: readonly Vector3[]
  /** The wind near the ground, metres per second. */
  readonly wind?: () => { readonly x: number; readonly z: number }
}

export interface TrenchLife {
  /** Flames in the braziers. */
  readonly braziers: readonly Sprite[]
  readonly embers: ParticleSystem
  /** Smoke from the dugouts' stoves, drifting on the wind. */
  readonly smoke: ParticleSystem
  readonly crows: Crows
  /** Moves the crows and sends sparks up from the braziers. Call once per frame. */
  update(frameSeconds: number): void
  dispose(): void
}

/** The middle of the open top of every brazier the dressing placed: the kit's drum, at each one's height and size. */
export function brazierTops(placements: readonly Placement[], pieces: ReadonlyMap<string, Mesh>): Vector3[] {
  const drum = pieces.get(TRENCH_PIECES.brazier)
  if (!drum) {
    return []
  }
  const rim = drum.getBoundingInfo().boundingBox.maximum.y
  return placements
    .filter((placement) => placement.piece === TRENCH_PIECES.brazier)
    .map((placement) => new Vector3(placement.x, placement.y + rim * (placement.scale?.[1] ?? 1), placement.z))
}

/**
 * Fire in every brazier, with sparks rising from it; wisps of smoke from the dugouts' stovepipes, drifting on the wind;
 * and crows on the wire.
 */
export function createTrenchLife(
  scene: Scene,
  map: BattlefieldMap,
  { braziers: tops, stoves = [], wind = () => ({ x: 0, z: 0 }) }: TrenchFires,
  sprites: TrenchLifeSprites
): TrenchLife {
  const sheet = new SpriteManager("brazier-fires", "", Math.max(1, tops.length), 128, scene)
  sheet.texture = sprites.fire
  sheet.blendMode = Constants.ALPHA_ADD
  sheet.isPickable = false
  const braziers = tops.map((top, index) => {
    const sprite = new Sprite("brazier-fire", sheet)
    sprite.position.set(top.x, top.y + 0.28, top.z)
    sprite.size = 0.75
    // The flipbook is drawn near white: burn it orange.
    sprite.color = new Color4(1, 0.5, 0.2, 0.9)
    sprite.isPickable = false
    sprite.playAnimation(0, 99, true, 30 + (index % 5) * 3)
    return sprite
  })

  const embers = new ParticleSystem("brazier-embers", 40 * Math.max(1, tops.length), scene)
  embers.particleTexture = sprites.ember
  embers.emitter = Vector3.Zero()
  embers.startPositionFunction = (_world, position) => {
    const top = tops[Math.floor(Math.random() * tops.length)]
    if (top) {
      position.set(top.x + (Math.random() - 0.5) * 0.4, top.y + 0.1, top.z + (Math.random() - 0.5) * 0.4)
    }
  }
  embers.color1 = new Color4(1, 0.6, 0.2, 1)
  embers.color2 = new Color4(1, 0.4, 0.08, 1)
  embers.colorDead = new Color4(0.5, 0.1, 0, 0)
  embers.minSize = 0.03
  embers.maxSize = 0.07
  embers.minLifeTime = 0.8
  embers.maxLifeTime = 2
  embers.direction1 = new Vector3(-0.2, 1, -0.2)
  embers.direction2 = new Vector3(0.2, 1.4, 0.2)
  embers.minEmitPower = 0.5
  embers.maxEmitPower = 1.2
  embers.emitRate = 2.5 * tops.length
  embers.blendMode = ParticleSystem.BLENDMODE_ADD
  if (tops.length > 0) {
    embers.start()
  }

  const smoke = createStoveSmoke(scene, stoves, sprites.puff)

  const crows = createCrows(scene, map)
  return {
    braziers,
    embers,
    smoke,
    crows,
    update(frameSeconds) {
      crows.update(frameSeconds)
      // Light smoke rises a little, then goes with the wind.
      const { x, z } = wind()
      smoke.gravity.set(x * 0.2, 0.05, z * 0.2)
    },
    dispose() {
      smoke.dispose()
      embers.dispose()
      sheet.dispose()
      crows.dispose()
    }
  }
}

/** A stove's smoke: thin wisps from the pipe's mouth, a few metres up before they spread and drift away. */
function createStoveSmoke(scene: Scene, stoves: readonly Vector3[], puff: Texture): ParticleSystem {
  const smoke = new ParticleSystem("stove-smoke", 30 * Math.max(1, stoves.length), scene)
  smoke.particleTexture = puff
  smoke.emitter = Vector3.Zero()
  smoke.startPositionFunction = (_world, position) => {
    const mouth = stoves[Math.floor(Math.random() * stoves.length)]
    if (mouth) {
      position.set(mouth.x + (Math.random() - 0.5) * 0.08, mouth.y, mouth.z + (Math.random() - 0.5) * 0.08)
    }
  }
  // Pale blue-grey from wood, thickest at the mouth, thinning to nothing.
  smoke.addColorGradient(0, new Color4(0.42, 0.42, 0.44, 0))
  smoke.addColorGradient(0.08, new Color4(0.42, 0.42, 0.44, 0.32))
  smoke.addColorGradient(0.6, new Color4(0.5, 0.5, 0.52, 0.12))
  smoke.addColorGradient(1, new Color4(0.55, 0.55, 0.57, 0))
  // Size gradients are the size itself, in metres; each particle varies by its scale.
  smoke.addSizeGradient(0, 0.25)
  smoke.addSizeGradient(1, 2.6)
  smoke.minScaleX = 0.8
  smoke.maxScaleX = 1.2
  smoke.minScaleY = 0.8
  smoke.maxScaleY = 1.2
  smoke.minLifeTime = 6
  smoke.maxLifeTime = 10
  smoke.emitRate = 1.2 * stoves.length
  smoke.direction1 = new Vector3(-0.05, 1, -0.05)
  smoke.direction2 = new Vector3(0.05, 1, 0.05)
  smoke.minEmitPower = 0.35
  smoke.maxEmitPower = 0.6
  smoke.minInitialRotation = 0
  smoke.maxInitialRotation = Math.PI * 2
  smoke.minAngularSpeed = -0.2
  smoke.maxAngularSpeed = 0.2
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD
  smoke.preWarmCycles = 150
  smoke.preWarmStepOffset = 5
  if (stoves.length > 0) {
    smoke.start()
  }
  return smoke
}

/** Crows flight: how high and fast they circle, and how long before they settle again, in metres and seconds. */
const FLIGHT = { speed: 9, height: [12, 22], circle: [14, 28], airborne: [7, 14], hop: 80 } as const
/** A crow is drawn this much larger than life, so it reads from the game's camera. */
const CROW_SCALE = 1.7
/** Shells landing this close put a flock up. */
const SCARE_RADIUS = 55
const FLOCKS = 4

interface Crow {
  readonly root: TransformNode
  readonly wings: readonly [TransformNode, TransformNode]
  /** Its place in the flock: offsets from the flock's perch and circle. */
  readonly spot: { readonly x: number; readonly z: number; readonly phase: number }
}

interface Flock {
  readonly crows: Crow[]
  perch: Vector3
  state: "perched" | "circling" | "landing"
  /** Seconds left in this state, or until a perched flock moves on of its own accord. */
  left: number
  circleCentre: Vector3
  circleRadius: number
  height: number
  angle: number
  from: Vector3
  landingTime: number
}

export interface Crows {
  readonly flocks: readonly { readonly state: "perched" | "circling" | "landing"; readonly perch: Vector3 }[]
  /** A shell burst: flocks within reach take off. */
  scare(x: number, z: number): void
  update(frameSeconds: number): void
  dispose(): void
}

function crowMeshes(scene: Scene): { body: Mesh; wing: Mesh } {
  const material = new StandardMaterial("crow", scene)
  material.diffuseColor = Color3.FromHexString("#16161a")
  material.specularColor = Color3.Black()
  material.backFaceCulling = false
  const body = new Mesh("crow-body", scene)
  const bodyData = new VertexData()
  // Beak, tail, back, belly, left and right: a long faceted diamond.
  bodyData.positions = [0, 0, 0.22, 0, 0.02, -0.2, 0, 0.07, 0, 0, -0.05, 0.02, -0.06, 0.01, 0, 0.06, 0.01, 0]
  bodyData.indices = [0, 2, 4, 0, 5, 2, 0, 3, 5, 0, 4, 3, 1, 4, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4]
  const bodyNormals: number[] = []
  VertexData.ComputeNormals(bodyData.positions, bodyData.indices, bodyNormals)
  bodyData.normals = bodyNormals
  bodyData.applyToMesh(body)
  const wing = new Mesh("crow-wing", scene)
  const wingData = new VertexData()
  wingData.positions = [0, 0, 0.07, 0, 0, -0.08, 0.34, 0, -0.06]
  wingData.indices = [0, 1, 2]
  wingData.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0]
  wingData.applyToMesh(wing)
  for (const mesh of [body, wing]) {
    mesh.material = material
    mesh.isPickable = false
    mesh.isVisible = false
  }
  return { body, wing }
}

/** Points along the wire in no man's land where a flock might settle. */
function perches(map: BattlefieldMap): Vector3[] {
  const points = map.wire.flatMap((belt) => belt.points.filter((_, index) => index % 3 === 1))
  return points.map(([x, z]) => new Vector3(x, heightAt(map, x, z) + 0.9, z))
}

/**
 * Crows on the wire: a few flocks perched along the belts in no man's land. A shell bursting near one sends it up to
 * circle, wings beating, before it drops onto another stretch of wire; now and then a flock moves on of its own accord.
 */
export function createCrows(scene: Scene, map: BattlefieldMap, random: () => number = Math.random): Crows {
  const places = perches(map)
  const fallback = new Vector3(
    mapWidth(map) / 2,
    heightAt(map, mapWidth(map) / 2, mapDepth(map) / 2),
    mapDepth(map) / 2
  )
  const pick = () => places[Math.floor(random() * places.length)] ?? fallback
  const { body, wing } = crowMeshes(scene)
  const flocks: Flock[] = []
  for (let index = 0; index < FLOCKS; index++) {
    const perch = pick().clone()
    const crows: Crow[] = []
    const count = 4 + Math.floor(random() * 4)
    for (let member = 0; member < count; member++) {
      const root = new TransformNode(`crow-${index}-${member}`, scene)
      root.scaling.setAll(CROW_SCALE)
      const bodyInstance = body.createInstance(`crow-body-${index}-${member}`)
      bodyInstance.parent = root
      const left = new TransformNode("crow-wing-left", scene)
      const right = new TransformNode("crow-wing-right", scene)
      left.parent = root
      right.parent = root
      left.scaling.x = -1
      wing.createInstance("crow-wing").parent = left
      wing.createInstance("crow-wing").parent = right
      crows.push({
        root,
        wings: [left, right],
        spot: { x: (random() - 0.5) * 6, z: (random() - 0.5) * 1.5, phase: random() * Math.PI * 2 }
      })
    }
    flocks.push({
      crows,
      perch,
      state: "perched",
      left: 40 + random() * 80,
      circleCentre: perch.clone(),
      circleRadius: 20,
      height: 16,
      angle: 0,
      from: perch.clone(),
      landingTime: 1
    })
  }
  let clock = 0

  function takeOff(flock: Flock): void {
    flock.state = "circling"
    flock.left = FLIGHT.airborne[0] + random() * (FLIGHT.airborne[1] - FLIGHT.airborne[0])
    flock.circleCentre = flock.perch.clone()
    flock.circleRadius = FLIGHT.circle[0] + random() * (FLIGHT.circle[1] - FLIGHT.circle[0])
    flock.height = FLIGHT.height[0] + random() * (FLIGHT.height[1] - FLIGHT.height[0])
    flock.angle = random() * Math.PI * 2
  }

  function place(flock: Flock, crow: Crow, frameSeconds: number): void {
    const { root, wings, spot } = crow
    if (flock.state === "perched") {
      root.position.set(flock.perch.x + spot.x, flock.perch.y, flock.perch.z + spot.z)
      root.rotation.set(0, spot.phase + Math.sin(clock * 0.3 + spot.phase) * 0.6, 0)
      // Folded: swept back along the body, drooping a little.
      for (const [side, node] of wings.entries()) {
        node.rotation.set(0, (side === 0 ? -1 : 1) * 1.35, (side === 0 ? 1 : -1) * 0.25)
      }
      return
    }
    const flap = Math.sin(clock * 14 + spot.phase) * 0.8
    for (const [side, node] of wings.entries()) {
      node.rotation.set(0, (side === 0 ? -1 : 1) * 0.2, (side === 0 ? -1 : 1) * flap)
    }
    if (flock.state === "circling") {
      const angle = flock.angle + spot.phase * 0.15
      const radius = flock.circleRadius + spot.x
      const target = new Vector3(
        flock.circleCentre.x + Math.cos(angle) * radius,
        flock.circleCentre.y + flock.height + Math.sin(clock + spot.phase) * 1.5,
        flock.circleCentre.z + Math.sin(angle) * radius
      )
      // Ease up from the perch rather than jumping into the circle.
      Vector3.LerpToRef(root.position, target, Math.min(1, frameSeconds * 1.5), root.position)
      root.rotation.set(0, -angle, 0)
      return
    }
    const progress = Math.min(1, 1 - flock.left / flock.landingTime)
    const x = flock.from.x + (flock.perch.x + spot.x - flock.from.x) * progress
    const z = flock.from.z + (flock.perch.z + spot.z - flock.from.z) * progress
    const y = flock.from.y + (flock.perch.y - flock.from.y) * progress + Math.sin(progress * Math.PI) * 3
    root.rotation.set(0, Math.atan2(flock.perch.x - flock.from.x, flock.perch.z - flock.from.z), 0)
    root.position.set(x, y, z)
  }

  return {
    flocks,
    scare(x, z) {
      for (const flock of flocks) {
        if (flock.state === "perched" && Math.hypot(flock.perch.x - x, flock.perch.z - z) < SCARE_RADIUS) {
          takeOff(flock)
        }
      }
    },
    update(frameSeconds) {
      clock += frameSeconds
      for (const flock of flocks) {
        flock.left -= frameSeconds
        if (flock.state === "circling") {
          flock.angle += (FLIGHT.speed / flock.circleRadius) * frameSeconds
        }
        if (flock.left <= 0) {
          if (flock.state === "perched") {
            takeOff(flock)
          } else if (flock.state === "circling") {
            // Down onto another stretch of wire not far off.
            const nearby = places.filter(
              (point) => Math.hypot(point.x - flock.perch.x, point.z - flock.perch.z) < FLIGHT.hop
            )
            const next = nearby[Math.floor(random() * nearby.length)] ?? pick()
            flock.from = new Vector3(
              flock.circleCentre.x + Math.cos(flock.angle) * flock.circleRadius,
              flock.circleCentre.y + flock.height,
              flock.circleCentre.z + Math.sin(flock.angle) * flock.circleRadius
            )
            flock.perch = next.clone()
            flock.state = "landing"
            flock.landingTime = Math.max(2, Vector3.Distance(flock.from, flock.perch) / FLIGHT.speed)
            flock.left = flock.landingTime
          } else {
            flock.state = "perched"
            flock.left = 40 + random() * 80
          }
        }
        for (const crow of flock.crows) {
          place(flock, crow, frameSeconds)
        }
      }
    },
    dispose() {
      for (const flock of flocks) {
        for (const crow of flock.crows) {
          crow.root.dispose()
        }
      }
      body.dispose()
      wing.dispose()
    }
  }
}
