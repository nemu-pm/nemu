// Aidoku source adapter for nemu
export { createAidokuMangaSource, type BrowsableSource, type CreateAidokuSourceResult, hasHomeBeenRefreshed, markHomeRefreshed } from "./adapter";
export { AidokuUrlRegistry, AIDOKU_REGISTRIES } from "./url-registry";

// Re-export from @nemu.pm/aidoku-runtime
export { extractAix, isAixPackage, loadSource, type AixContents, type AsyncAidokuSource } from "@nemu.pm/aidoku-runtime";

// Re-export types from @nemu.pm/aidoku-runtime for convenience
export type {
  Manga,
  Chapter,
  Page,
  MangaPageResult,
  SourceManifest,
  SourceInfo,
  DiscoveredSource,
  Filter,
  FilterValue,
  FilterInfo,
  Listing,
  HomeLayout,
  HomeComponent,
  HomeComponentValue,
} from "@nemu.pm/aidoku-runtime";

export { FilterType, MangaStatus, ContentRating, Viewer } from "@nemu.pm/aidoku-runtime";
