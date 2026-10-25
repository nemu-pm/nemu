import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  MOBILE_READER_PAGE_SPINNER_DELAY_MS,
  MOBILE_READER_PAGE_SPINNER_SIZE,
  type MobileReaderScrollCellRef,
  type MobileReaderScrollViewportStore,
} from "@/lib/mobileReaderPageLoading";

/** The scroll list's viewport (none outside a scroll list: paged, curl leaves, thumbnails). */
export const MobileReaderScrollViewportContext = createContext<MobileReaderScrollViewportStore | null>(null);
/** The scroll list cell a page renders in. */
export const MobileReaderScrollCellContext = createContext<MobileReaderScrollCellRef | null>(null);

const NO_SCROLL_SUBSCRIBE = () => () => undefined;
const NOT_IN_SCROLL = () => undefined;

/**
 * The spinner over a page that has no image yet: native, small (20pt),
 * appearing `MOBILE_READER_PAGE_SPINNER_DELAY_MS` after it starts waiting.
 * In the scroll list it mounts only while its page is on screen, centred in
 * the part on screen; elsewhere it is centred on its frame.
 */
export function MobileReaderPageSpinner({
  color,
  delayMs = MOBILE_READER_PAGE_SPINNER_DELAY_MS,
}: {
  color: string;
  delayMs?: number;
}) {
  const store = useContext(MobileReaderScrollViewportContext);
  const cell = useContext(MobileReaderScrollCellContext);
  const inScroll = store != null && cell != null;
  // null: off screen (no spinner); undefined: not in a scroll list (centred).
  const centre = useSyncExternalStore(
    inScroll ? store.subscribe : NO_SCROLL_SUBSCRIBE,
    inScroll ? () => store.spinnerCentre(cell) : NOT_IN_SCROLL,
    inScroll ? () => store.spinnerCentre(cell) : NOT_IN_SCROLL,
  );
  const onScreen = centre !== null;
  const [shown, setShown] = useState(delayMs <= 0);
  useEffect(() => {
    if (!onScreen || delayMs <= 0) return;
    setShown(false);
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, onScreen]);
  if (!onScreen || !shown) return null;
  return (
    <View
      pointerEvents="none"
      style={
        centre === undefined
          ? styles.centred
          : [styles.placed, { top: centre - MOBILE_READER_PAGE_SPINNER_SIZE / 2 }]
      }
    >
      <ActivityIndicator color={color} size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  centred: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  placed: {
    position: "absolute",
    left: 0,
    right: 0,
    height: MOBILE_READER_PAGE_SPINNER_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
