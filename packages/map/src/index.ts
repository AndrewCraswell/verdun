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
