import { createContext, createElement, useContext, type ReactNode } from "react";

const MobileSheetMaxHeightContext = createContext<number | null>(null);

/**
 * Caps every scaffold sheet presented inside it (`MobileNativeSheetScaffold`'s
 * `maxHeight`), e.g. the reader's sheets on an iPhone Duo half folded like a
 * laptop, which belong to the bottom pane and never reach past the hinge.
 * Null: no cap.
 */
export function MobileSheetMaxHeightProvider({ value, children }: { value: number | null; children: ReactNode }) {
  return createElement(MobileSheetMaxHeightContext.Provider, { value }, children);
}

/** The nearest `MobileSheetMaxHeightProvider`'s cap, or null. */
export function useMobileSheetMaxHeight(): number | null {
  return useContext(MobileSheetMaxHeightContext);
}
