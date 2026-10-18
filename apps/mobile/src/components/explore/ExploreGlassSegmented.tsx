import { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { nemuFontWeight, NemuPressable, NemuText, radius, useNemuTheme } from "@/design-system";
import { NativeSegmentedControl } from "../../../modules/nemu-window-layout";
import { ExploreGlass } from "./ExploreGlass";

/** A's compact accent selection; UIKit owns glass tracking and transitions on iOS. */
const SPRING = { damping: 20, stiffness: 260, mass: 0.85 } as const;
const LENS_INSET = 3;

type Layout = { x: number; width: number };

export function ExploreGlassSegmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const { tokens } = useNemuTheme();
  const reducedMotion = useReducedMotion();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [layouts, setLayouts] = useState<Array<Layout | null>>(() => options.map(() => null));
  const progress = useSharedValue(selectedIndex);
  const centers = useSharedValue<number[]>([]);
  const widths = useSharedValue<number[]>([]);

  useEffect(() => {
    if (!layouts.every(Boolean)) return;
    centers.value = layouts.map((layout) => layout!.x + layout!.width / 2);
    widths.value = layouts.map((layout) => layout!.width);
  }, [centers, layouts, widths]);
  useEffect(() => {
    // Settles on the selected segment whenever the value changes.
    progress.value = reducedMotion
      ? selectedIndex
      : withSpring(selectedIndex, SPRING);
  }, [progress, reducedMotion, selectedIndex]);

  const lensStyle = useAnimatedStyle(() => {
    const cs = centers.value;
    const ws = widths.value;
    if (cs.length < 2) return { opacity: 0 };
    const index = [0, 1];
    const center = interpolate(progress.value, index, [cs[0]!, cs[1]!]);
    const width = interpolate(progress.value, index, [ws[0]!, ws[1]!]);
    return {
      opacity: 1,
      transform: [
        { translateX: center - ws[0]! / 2 },
        { scaleX: width / ws[0]! },
      ],
    };
  });

  const onSegmentLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((current) => {
      const previous = current[index];
      if (previous && previous.x === x && previous.width === width) return current;
      const next = [...current];
      next[index] = { x, width };
      return next;
    });
  };

  const firstWidth = layouts[0]?.width ?? 0;
  const lensBase = [styles.lens, { width: firstWidth, left: 0, top: 0, bottom: 0 }];

  if (NativeSegmentedControl) {
    return (
      <ExploreGlass>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.row, styles.track, { opacity: 0 }]}>
          {options.map((option) => <View key={option.value} style={styles.segment}><NemuText maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.segmentText}>{option.label}</NemuText></View>)}
        </View>
        <NativeSegmentedControl
          style={StyleSheet.absoluteFill}
          labels={options.map((option) => option.label)}
          selectedIndex={selectedIndex}
          selectionColor={tokens.primary}
          textColor={tokens.mutedForeground}
          selectedTextColor={tokens.primaryForeground}
          accessibilityLabel={accessibilityLabel}
          onSelectionChange={({ nativeEvent }) => {
            const next = options[nativeEvent.selectedIndex];
            if (next && next.value !== value) onChange(next.value);
          }}
        />
      </ExploreGlass>
    );
  }

  return (
    <ExploreGlass style={styles.track}>
      <View style={styles.row}>
        {/* Under the labels, over the track. */}
        {firstWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[lensBase, { backgroundColor: tokens.primary, borderRadius: radius.pill }, lensStyle]}
          />
        ) : null}
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <NemuPressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={accessibilityLabel}
              accessibilityState={{ selected }}
              hapticFeedback="selection"
              pressedScale={0.96}
              onPress={() => {
                if (!selected) onChange(option.value);
              }}
              onLayout={onSegmentLayout(index)}
              style={styles.segment}
            >
              <NemuText
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                color={selected ? tokens.primaryForeground : tokens.mutedForeground}
                style={styles.segmentText}
              >
                {option.label}
              </NemuText>
            </NemuPressable>
          );
        })}
      </View>
    </ExploreGlass>
  );
}

const styles = StyleSheet.create({
  track: { padding: LENS_INSET },
  row: { flexDirection: "row" },
  lens: { position: "absolute", borderRadius: radius.pill },
  segment: {
    minHeight: 30,
    minWidth: 58,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
});
