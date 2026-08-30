/**
 * Sync transport types.
 *
 * The Convex snapshot contract is shared with the React Native app through
 * @nemu/core; this module keeps the web-facing type names stable.
 */

import type {
  CloudChapterProgress,
  CloudLibraryItem,
  CloudMangaProgress,
  CloudSourceLink,
} from "@nemu/core";

export type SyncLibraryItem = CloudLibraryItem & {
  id: string;
  libraryItemId: string;
};

export type SyncLibrarySourceLink = CloudSourceLink & {
  id: string;
};

export type SyncChapterProgress = CloudChapterProgress & {
  id: string;
};

export type SyncMangaProgress = CloudMangaProgress & {
  id: string;
};
