import { createContext, useContext } from "react";

/**
 * Provided by the reader route while a cover zoom opened it: the reader tells
 * the route when its first page has drawn (the landing cover then fades into
 * it) and when it is about to leave (the cover comes back, so the zoom back
 * shrinks a cover into the cover). No-ops outside a zoom.
 */
export type ReaderZoomEntry = {
  onFirstPage: () => void;
  onLeave: () => void;
};

const noop = () => undefined;

export const ReaderZoomEntryContext = createContext<ReaderZoomEntry>({
  onFirstPage: noop,
  onLeave: noop,
});

export function useReaderZoomEntry(): ReaderZoomEntry {
  return useContext(ReaderZoomEntryContext);
}
