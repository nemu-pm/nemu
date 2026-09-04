import { StyleSheet, View } from "react-native";
import { radius } from "@/design-system";
import {
  READER_CHROME_LOADING_OPACITY,
  READER_CHROME_PANEL_CONTENT_MIN_HEIGHT,
} from "@/lib/mobileReaderHeader";

const TRACK_HEIGHT = 8;

/**
 * The bottom chrome scrubber while a chapter is still resolving its page list:
 * the same track geometry as `MobileSliderTrack`, greyed out and with no thumb,
 * so the bar reads as "not ready yet" instead of empty or draggable.
 */
export function ReaderChromeLoadingTrack({
  accessibilityLabel,
  color,
}: {
  accessibilityLabel: string;
  color: string;
}) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true, disabled: true }}
      pointerEvents="none"
      style={styles.root}
    >
      <View style={[styles.track, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: READER_CHROME_PANEL_CONTENT_MIN_HEIGHT,
    justifyContent: "center",
    opacity: READER_CHROME_LOADING_OPACITY,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.sm,
  },
});
