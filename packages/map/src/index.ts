export {
  type BattlefieldMap,
  createFlatMap,
  MAP_FORMAT_VERSION,
  mapDepth,
  mapWidth,
  sampleCount,
  sampleIndex
} from "./format.ts"
export { generateRollingTerrain, type RollingTerrainOptions } from "./generate.ts"
export { heightAt } from "./sampling.ts"
export { fromMapDocument, type MapDocument, toMapDocument } from "./serialization.ts"
