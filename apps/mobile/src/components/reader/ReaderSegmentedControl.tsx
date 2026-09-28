import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { NemuPressable, NemuText, nemuFontWeight } from "@/design-system";
import { hapticSelection } from "@/lib/haptics";

export type ReaderSegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  accessibilityLabel?: string;
};

export type ReaderSegmentedControlProps<T extends string> = {
  accessibilityLabel: string;
  options: readonly ReaderSegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

/** iOS dark segmented control metrics (track, thumb, 32pt tall). */
const TRACK = "rgba(118,118,128,0.24)";
const THUMB = "rgba(99,99,102,0.92)";
const HEIGHT = 32;

/**
 * Segmented switch over the dark reader (the study desk's surface switch).
 * iOS uses the system `UISegmentedControl` (`ReaderSegmentedControl.ios.tsx`);
 * elsewhere this paints the same dark track-and-thumb shape, never a white
 * slab or a primary-coloured pill.
 */
export function ReaderSegmentedControl<T extends string>({
  accessibilityLabel,
  options,
  value,
  onChange,
  style,
}: ReaderSegmentedControlProps<T>) {
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="tablist" style={[styles.track, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <NemuPressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected }}
            containerStyle={styles.segmentContainer}
            hapticFeedback="none"
            onPress={() => {
              if (selected) return;
              void hapticSelection();
              onChange(option.value);
            }}
            pressedScale={0.97}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <NemuText
              numberOfLines={1}
              style={[styles.label, { color: selected ? "rgba(255,255,255,0.96)" : "rgba(235,235,245,0.64)" }]}
            >
              {option.label}
            </NemuText>
          </NemuPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    flexDirection: "row",
    padding: 2,
    borderRadius: HEIGHT / 2,
    backgroundColor: TRACK,
  },
  segmentContainer: {
    flex: 1,
    minWidth: 0,
  },
  segment: {
    height: HEIGHT - 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: (HEIGHT - 4) / 2,
    paddingHorizontal: 10,
  },
  segmentSelected: {
    backgroundColor: THUMB,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
});
