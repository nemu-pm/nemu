// MangaSource adapter
export { createAidokuMangaSource } from "./adapter";

// URL registry implementation
export { AidokuUrlRegistry, AIDOKU_REGISTRIES } from "./url-registry";

// Types
export type {
  DiscoveredSource,
  SourceManifest,
  SourceInfo,
  Manga,
  Chapter,
  Page,
  MangaPageResult,
  Filter,
  FilterValue,
} from "./types";

// Async source (internal)
export { createAsyncSource, type AsyncAidokuSource } from "./async-source";
