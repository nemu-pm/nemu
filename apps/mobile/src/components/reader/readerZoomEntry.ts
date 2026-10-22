import { createContext, useContext } from "react";
import {
  createReaderOpeningGate,
  type ReaderOpeningGate,
} from "./readerOpeningGate";

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
};

const noop = () => undefined;

const settledOpeningGate = createReaderOpeningGate();
settledOpeningGate.settle("no-fade");

export const ReaderZoomEntryContext = createContext<ReaderZoomEntry>({
  onFirstPage: noop,
  openingGate: settledOpeningGate,
});

export function useReaderZoomEntry(): ReaderZoomEntry {
  return useContext(ReaderZoomEntryContext);
}
