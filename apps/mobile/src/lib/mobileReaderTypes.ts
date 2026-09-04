import type {
  LibraryEntry,
  LocalChapterProgress,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";

/**
 * Snapshot of the currently-open manga's local data, used by the reader
 * screen and its extracted formatting helpers.
 */
export type ReaderState = {
  entry: LibraryEntry | null;
  sourceLink: LocalSourceLink | null;
  chapterProgress: LocalChapterProgress | null;
  mangaProgress: LocalMangaProgress | null;
};

/**
 * Discriminator for the in-progress reader settings action (used to show a
 * busy state on the corresponding control). Kept here (not in
 * `mobileReaderSettings`) because it is a reader-screen-local concern.
 */
export type ReaderSettingsAction =
  | "reading-mode"
  | "scroll-width"
  | "two-page-mode"
  | "page-pairing-mode"
  | "page-image-processing"
  | "keep-awake"
  | "lock-portrait";
