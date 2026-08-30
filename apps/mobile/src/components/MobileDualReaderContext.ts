/**
 * Shared context for the mobile dual-reader orchestrator tree
 * (SessionManager / SecondaryPrefetcher / AutoAligner / ConfigSheet / DebugOverlay / Fab),
 * the native counterpart to web's `DualReadReaderOverlay` 6-child tree
 * (`src/lib/plugins/builtin/dual-reader/components.tsx:3022`).
 *
 * Mobile has no `ReaderPluginContext` object (web does); ReaderScreen derives
 * everything from route params + hooks. This context bundles what the
 * dual-reader tree needs (route ids, primary chapter list, installed sources,
 * the source-settings loader, reading mode, strings) plus the renderer +
 * byte-fetcher the Root owns. Per-page geometry (frame size, primary natural
 * size, chapterId, localIndex) is NOT here — it's passed per-page to
 * `MobileDualReaderOverlay` at its mount site in the reader page frame.
 */
import { createContext, useContext } from "react";
import type { ChapterSummary, InstalledSource, LocalSourceLink, ReadingMode } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";

export type MobileDualReaderContextValue = {
  registryId: string;
  sourceId: string;
  mangaId: string;
  /** Current primary chapter (the chapter the reader is open to). */
  primaryChapter: ChapterSummary | null;
  /** All primary chapters (reader chapter list); empty when not loaded. */
  primaryChapters: ChapterSummary[];
  /** Pages of the current primary chapter (`pagesState.pages`); empty when not loaded. */
  primaryPages: MobileReaderPage[];
  /** Local index of the currently displayed primary page; null when unknown. */
  currentLocalIndex: number | null;
  /** All installed sources (resolved from the sources store). */
  installedSources: InstalledSource[];
  /** All source links for this manga (ordered); the primary is `sourceLink`. */
  linkedSources: LocalSourceLink[];
  /** Loads merged per-source settings (mirrors ReaderScreen's getReaderSourceSettings). */
  getSourceSettings: (
    sourceKey: string,
    source: InstalledSource,
  ) => Promise<Record<string, unknown>>;
  readingMode: ReadingMode;
  strings: MobileStrings;
  /** Current source link (the primary source). */
  sourceLink: LocalSourceLink | null;
};

export const MobileDualReaderContext = createContext<MobileDualReaderContextValue | null>(null);

export function useMobileDualReaderContext(): MobileDualReaderContextValue {
  const ctx = useContext(MobileDualReaderContext);
  if (!ctx) {
    throw new Error(
      "useMobileDualReaderContext: missing provider — MobileDualReaderRoot must wrap this tree.",
    );
  }
  return ctx;
}