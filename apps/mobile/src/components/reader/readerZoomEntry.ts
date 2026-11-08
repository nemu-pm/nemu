import { createContext, useContext } from "react";
import {
  createReaderOpeningGate,
  type ReaderOpeningGate,
} from "./readerOpeningGate";
import { NO_READER_OPENING_TIMES, type ReaderOpeningTimes } from "./readerOpeningHold";

/**
 * Provided by the reader route while a cover zoom opened it: the reader tells
 * the route when its first page has drawn (the landing cover then fades into
 * it), and the route tells the reader when that fade has ended (the opening
 * window, see `readerOpeningGate`). A no-op outside a zoom, whose gate is
 * settled from the start.
 */
export type ReaderZoomEntry = {
  onFirstPage: () => void;
  openingGate: ReaderOpeningGate;
  /**
   * `hold` (see `readerOpeningHold`): the cover stays until
   * `onFirstScreenImagesReady` (or the hold's cap), whatever "first page"
   * says. Ignored once the fade runs.
   */
  holdForFirstScreenImages: () => void;
  /** Every page in the first viewport has painted its image (or failed). */
  onFirstScreenImagesReady: () => void;
  /** Tap / landing / fade-end, for the opening's log lines. */
  openingTimes: () => ReaderOpeningTimes;
  /**
   * The pages the reader is placed on (paged reading): the route's opening
   * stand-in leaves without a fade only over these very pages.
   */
  onOpeningPages: (pageIds: readonly string[]) => void;
  /**
   * The HUD was asked for while the opening holds it (a tap, an unreadable
   * chapter): the loading screen leaves at once and the HUD shows.
   */
  releaseHud: () => void;
  /** The title's cover, for an opening without a zoom (none of its own to land on). */
  onTitleCover: (cover: { uri: string; headers?: Record<string, string> } | null) => void;
};

const noop = () => undefined;

const settledOpeningGate = createReaderOpeningGate();
settledOpeningGate.settle("no-fade");

export const ReaderZoomEntryContext = createContext<ReaderZoomEntry>({
  onFirstPage: noop,
  openingGate: settledOpeningGate,
  holdForFirstScreenImages: noop,
  onFirstScreenImagesReady: noop,
  openingTimes: () => NO_READER_OPENING_TIMES,
  onOpeningPages: noop,
  releaseHud: noop,
  onTitleCover: noop,
});

export function useReaderZoomEntry(): ReaderZoomEntry {
  return useContext(ReaderZoomEntryContext);
}

/**
 * True while the reader's first open holds its HUD back: until the opening's
 * loading screen (see `readerOpeningLoading`) has left and the first page
 * shows. Apart from the entry so that its change re-renders nothing else.
 */
export const ReaderOpeningHudHeldContext = createContext(false);

export function useReaderOpeningHudHeld(): boolean {
  return useContext(ReaderOpeningHudHeldContext);
}
