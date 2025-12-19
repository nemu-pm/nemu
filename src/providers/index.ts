// Provider layer exports
export * from "./types";
export {
  RegistryManager,
  getRegistryManager,
  type SourceRegistryProvider,
  type RegistrySourceInfo,
} from "./registry";

// Aidoku-specific exports (for advanced usage)
export { createAidokuMangaSource } from "./aidoku";

