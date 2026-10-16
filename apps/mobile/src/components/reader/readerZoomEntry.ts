import { createContext, useContext } from "react";

/**
 * Provided by the reader route while a cover zoom opened it: the reader tells
 * the route when its first page has drawn (the landing cover then fades into
 * it). A no-op outside a zoom.
 */
export type ReaderZoomEntry = {
  onFirstPage: () => void;
};

const noop = () => undefined;

export const ReaderZoomEntryContext = createContext<ReaderZoomEntry>({
  onFirstPage: noop,
});

export function useReaderZoomEntry(): ReaderZoomEntry {
  return useContext(ReaderZoomEntryContext);
}
