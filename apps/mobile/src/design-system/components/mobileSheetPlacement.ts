import { createContext, createElement, useContext, type ReactNode } from "react";

/** Where a system sheet sits in the window (iOS 27 `presentationPlacement`). */
export type MobileSheetPlacement = "automatic" | "leading" | "trailing";

const MobileSheetPlacementContext = createContext<MobileSheetPlacement>("automatic");

/**
 * Places every iOS system sheet presented inside it (the scaffold sheets and
 * the reader's native settings sheets), e.g. on an iPhone Duo half folded
 * like a book, where an `automatic` sheet takes the leading half: the reader
 * asks for the side pane's half so a sheet never covers the strip.
 */
export function MobileSheetPlacementProvider({ value, children }: { value: MobileSheetPlacement; children: ReactNode }) {
  return createElement(MobileSheetPlacementContext.Provider, { value }, children);
}

/** The nearest `MobileSheetPlacementProvider`'s placement, or `automatic`. */
export function useMobileSheetPlacement(): MobileSheetPlacement {
  return useContext(MobileSheetPlacementContext);
}
