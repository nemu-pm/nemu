import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useIsFocused } from "expo-router";
import { NemuText } from "@/design-system";
import {
  getMobileOdometerPlan,
  getMobileOdometerTiming,
  type MobileOdometerColumn,
  type MobileOdometerPlan,
} from "@/lib/mobileOdometer";

/**
 * Fast off the mark and a long, soft stop on the digit, like a counter wheel
 * coasting to rest. No overshoot: on a wheel that turns fifteen digits any
 * proportional overshoot is a third of a line.
 */
const TURN_EASING = Easing.bezier(0.16, 1, 0.3, 1);
/**
 * A screen regains focus as the screen over it starts to leave; the wheels
 * wait for it to be gone (a stack pop or the reader's zoom back, ~0.35 s).
 */
const AFTER_FOCUS_MS = 380;

type Props = {
  value: string;
  color: string;
  /** Needs a `lineHeight`: each wheel is one line tall. */
  style?: StyleProp<TextStyle>;
  maxFontSizeMultiplier?: number;
};

/**
 * A short label whose number turns over like a mechanical counter when it
 * changes (the card's chapter, "N new", the shelf's "+N", the detail facts):
 * each digit is a wheel that spins through every digit in between, ones
 * first, carries rippling into the tens and hundreds a beat later, a new
 * leading digit rolling in from empty. The words around the number stay put.
 *
 * Only a real change turns it, never the first render, and only where it is
 * seen: a change that lands while its screen is covered (the reader over the
 * Library) waits, and the wheels turn as the screen comes back. At rest (and under
 * Reduce Motion, where the new value simply replaces the old) it is one plain
 * text, so truncation, Dynamic Type and VoiceOver behave as usual. Digits are
 * tabular, so the label does not shift width as the wheels turn.
 */
export function MobileOdometerText({ value, color, style, maxFontSizeMultiplier }: Props) {
  const reducedMotion = useReducedMotion();
  const focused = useIsFocused();
  // Visible: focused, and past the transition that brought the screen back.
  const [settled, setSettled] = useState(focused);
  if (!focused && settled) setSettled(false);
  useEffect(() => {
    if (!focused) return undefined;
    const timer = setTimeout(() => setSettled(true), AFTER_FOCUS_MS);
    return () => clearTimeout(timer);
  }, [focused]);
  const visible = focused && settled;
  const [shown, setShown] = useState(value);
  const [plan, setPlan] = useState<{ id: number; plan: MobileOdometerPlan } | null>(null);
  // Out of view the old value stays (VoiceOver is not on a covered screen).
  if (shown !== value && visible) {
    const next = reducedMotion ? null : getMobileOdometerPlan(shown, value);
    setShown(value);
    setPlan(next ? { id: (plan?.id ?? 0) + 1, plan: next } : null);
  }
  const label = visible ? value : shown;
  const planId = plan?.id;
  const total = plan
    ? Math.max(...plan.plan.columns.map((column) => {
        const timing = getMobileOdometerTiming(column);
        return timing.delay + timing.duration;
      }))
    : 0;
  useEffect(() => {
    if (planId === undefined) return undefined;
    const timer = setTimeout(() => setPlan((current) => (current?.id === planId ? null : current)), total + 40);
    return () => clearTimeout(timer);
  }, [planId, total]);

  const textStyle = [style, styles.tabular];
  if (!plan) {
    return (
      <NemuText numberOfLines={1} maxFontSizeMultiplier={maxFontSizeMultiplier} color={color} style={textStyle}>
        {label}
      </NemuText>
    );
  }
  const lineHeight = StyleSheet.flatten(style)?.lineHeight ?? 18;
  const text = (content: string) => (
    <NemuText
      numberOfLines={1}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      color={color}
      style={[textStyle, styles.part]}
    >
      {content}
    </NemuText>
  );
  return (
    <View accessible accessibilityLabel={value} style={styles.row}>
      {plan.plan.prefix ? text(plan.plan.prefix) : null}
      {plan.plan.columns.map((column) => (
        <OdometerWheel
          key={`${plan.id}:${column.place}`}
          column={column}
          lineHeight={lineHeight}
          render={text}
        />
      ))}
      {plan.plan.suffix ? text(plan.plan.suffix) : null}
    </View>
  );
}

function OdometerWheel({
  column,
  lineHeight,
  render,
}: {
  column: MobileOdometerColumn;
  lineHeight: number;
  render: (content: string) => ReactNode;
}) {
  const steps = column.strip.length - 1;
  // The strip is laid out so it always moves the same way on screen: up
  // when the number grows (the next digit comes from below), down when it
  // shrinks.
  const items = column.direction === 1 ? column.strip : [...column.strip].reverse();
  const from = column.direction === 1 ? 0 : -steps * lineHeight;
  const to = column.direction === 1 ? -steps * lineHeight : 0;
  const offset = useSharedValue(from);
  useEffect(() => {
    if (steps <= 0) return;
    const { delay, duration } = getMobileOdometerTiming(column);
    offset.value = withDelay(delay, withTiming(to, { duration, easing: TURN_EASING }));
  }, [column, offset, steps, to]);
  const strip = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const last = column.strip[column.strip.length - 1];
  const first = column.strip[0];
  // Sized by a digit that is on screen at one end, so an appearing or
  // vanishing place still has a slot to turn in.
  const sizer = last ?? first ?? 0;
  return (
    <View style={[styles.wheel, { height: lineHeight }]}>
      <View style={styles.sizer}>{render(String(sizer))}</View>
      <Animated.View style={[styles.strip, strip]}>
        {items.map((digit, index) => (
          <View key={index} style={{ height: lineHeight }}>
            {render(digit === null ? " " : String(digit))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  part: {
    textAlign: "left",
  },
  tabular: {
    fontVariant: ["tabular-nums"],
  },
  wheel: {
    overflow: "hidden",
  },
  sizer: {
    opacity: 0,
  },
  strip: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
