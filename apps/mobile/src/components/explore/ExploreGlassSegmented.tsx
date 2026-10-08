import { useEffect, useState, type ComponentType } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { nemuFontWeight, NemuPressable, NemuText, radius, useNemuTheme } from "@/design-system";
import { NativeGlassViewHost } from "../../../modules/nemu-window-layout";
import { ExploreGlass } from "./ExploreGlass";

/**
 * Two-way switch (Shelf | Grid) on a glass track whose selection is a
 * Liquid Glass lens in the accent colour: on a change it slides to the other
 * segment with a spring and stretches along its travel (the lens elongates
 * mid-way and settles), as the system's own glass selections do. Without
 * native glass (older iOS, Android) the lens is the animated accent pill.
 * Reduce Motion: a short cross-fade in place, no travel.
 */
const SPRING = { damping: 17, stiffness: 240, mass: 0.85 } as const;
/** How much longer than its segment the lens gets at the middle of its travel. */
const STRETCH = 0.28;
const LENS_INSET = 3;

const AnimatedGlass = (NativeGlassViewHost
  ? Animated.createAnimatedComponent(NativeGlassViewHost as ComponentType<Record<string, unknown>>)
  : null) as ComponentType<Record<string, unknown>> | null;

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
      ? withTiming(selectedIndex, { duration: 150, easing: Easing.out(Easing.quad) })
      : withSpring(selectedIndex, SPRING);
  }, [progress, reducedMotion, selectedIndex]);

  const lensStyle = useAnimatedStyle(() => {
    const cs = centers.value;
    const ws = widths.value;
    if (cs.length < 2) return { opacity: 0 };
    const index = [0, 1];
    const center = interpolate(progress.value, index, [cs[0]!, cs[1]!]);
    const width = interpolate(progress.value, index, [ws[0]!, ws[1]!]);
    // Elongates with the distance travelled, never while resting.
    const travel = Math.min(1, Math.sin(Math.PI * Math.min(1, Math.max(0, progress.value))));
    const stretch = reducedMotion ? 1 : 1 + STRETCH * travel;
    return {
      opacity: 1,
      transform: [
        { translateX: center - ws[0]! / 2 },
        { scaleX: (width / ws[0]!) * stretch },
        { scaleY: reducedMotion ? 1 : 1 - 0.06 * travel },
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
  const lensBase = [styles.lens, { width: firstWidth, left: LENS_INSET, top: LENS_INSET, bottom: LENS_INSET }];

  return (
    <ExploreGlass style={styles.track}>
      <View style={styles.row}>
        {/* Under the labels, over the track. */}
        {firstWidth > 0 ? (
          AnimatedGlass ? (
            <AnimatedGlass
              pointerEvents="none"
              tintColor={tokens.primary}
              cornerRadius={0}
              interactive={false}
              clear={false}
              concentricMinimum={0}
              materialized
              animateAppearance={false}
              materializeDurationMs={0}
              style={[lensBase, lensStyle]}
            />
          ) : (
            <Animated.View
              pointerEvents="none"
              style={[lensBase, { backgroundColor: tokens.primary, borderRadius: radius.pill }, lensStyle]}
            />
          )
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
