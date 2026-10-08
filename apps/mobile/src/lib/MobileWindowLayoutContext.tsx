import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { WindowLayoutObserver } from "../../modules/nemu-window-layout";
import { reportMobileSystemTransition } from "@/lib/mobileTransitionTiming";
import { mobileAdaptiveLayout, type MobileAdaptiveLayout } from "@/lib/mobileAdaptiveLayout";
import type { MobileWindowLayout } from "@/lib/mobileWindowLayout";

const MobileWindowLayoutContext = createContext<MobileWindowLayout | null>(null);

function sameLayout(a: MobileWindowLayout | null, b: MobileWindowLayout) {
  return !!a && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One app-wide observer of the root view's geometry and reserved regions
 * (fold divisions, camera occlusions). Screens read it through
 * `useMobileAdaptiveLayout`; the reader keeps its own local observer because
 * its stage is not the window.
 */
export function MobileWindowLayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<MobileWindowLayout | null>(null);
  const onLayoutChange = useCallback((next: MobileWindowLayout) => {
    setLayout((previous) => (sameLayout(previous, next) ? previous : next));
  }, []);
  return (
    <MobileWindowLayoutContext.Provider value={layout}>
      <WindowLayoutObserver
        style={StyleSheet.absoluteFill}
        onLayoutChange={onLayoutChange}
        onWillTransition={reportMobileSystemTransition}
      />
      {children}
    </MobileWindowLayoutContext.Provider>
  );
}

/** Raw window geometry; falls back to window dimensions until native geometry arrives. */
export function useMobileWindowLayout(): MobileWindowLayout {
  const observed = useContext(MobileWindowLayoutContext);
  const window = useWindowDimensions();
  // Stable identity: consumers memoize on this object, and render-phase
  // trackers (MobilePoseTransitionProvider) would loop on a fresh fallback.
  const fallback = useMemo<MobileWindowLayout>(() => ({
    width: window.width,
    height: window.height,
    supported: false,
    divisions: [],
    occlusions: [],
  }), [window.height, window.width]);
  return observed ?? fallback;
}

export function useMobileAdaptiveLayout(): MobileAdaptiveLayout {
  const layout = useMobileWindowLayout();
  return useMemo(() => mobileAdaptiveLayout(layout), [layout]);
}
