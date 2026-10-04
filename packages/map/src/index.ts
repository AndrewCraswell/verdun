export {
  type BattlefieldMap,
  createFlatMap,
  isSurface,
  MAP_FORMAT_VERSION,
  mapDepth,
  mapWidth,
  sampleCount,
  sampleIndex,
  Surface,
  SURFACE_COUNT
} from "./format.ts"
export { generatePrototypeSector, generateRollingTerrain, type RollingTerrainOptions } from "./generate.ts"
export { latticeValue, valueNoise } from "./noise.ts"
export { heightAt } from "./sampling.ts"
export { fromMapDocument, type MapDocument, toMapDocument } from "./serialization.ts"
export {
  carveTrenches,
  type GroundPoint,
  layOutFront,
  pointsAlong,
  type Trench,
  TRENCH_PROFILE,
  type TrenchSystemOptions
} from "./trenches.ts"
export { type ChangedArea, type Crater, mergeAreas, stampCrater } from "./craters.ts"
export { decodeElevation, type Elevation } from "./elevation.ts"
export { generateFleurySector } from "./fleury.ts"
export {
  footprintRadius,
  SCENERY_FOOTPRINTS,
  SCENERY_KINDS,
  type Scenery,
  type SceneryFootprint,
  type SceneryKind,
  type WireBelt
} from "./scenery.ts"
export { TRENCH_GRID } from "./trench-trace.ts"
export {
  checkTrenchKit,
  fromTiledMap,
  TILED_PIXELS_PER_METRE,
  toTiledMap,
  type TiledImport,
  type TiledLayout,
  type TiledMap,
  type TrenchKitWarning
} from "./tiled.ts"
