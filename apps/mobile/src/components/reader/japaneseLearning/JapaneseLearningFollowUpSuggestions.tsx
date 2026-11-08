import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";
import {
  getJapaneseLearningFollowUpSuggestionColors,
  JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT,
  JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_PRESS,
  type JapaneseLearningFollowUpSuggestionColors,
} from "@/lib/mobileJapaneseLearningChatTheme";

type JapaneseLearningFollowUpSuggestionsProps = {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
};

/**
 * Web `motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}`
 * with motion's defaults: opacity tweens 0.3s ease-out, `y` uses the
 * under-damped transform spring (stiffness 500, damping 25).
 */
const ENTER_OFFSET = 10;
const ENTER_OPACITY_MS = 300;
const ENTER_SPRING = { stiffness: 500, damping: 25, mass: 1 };

/**
 * Mobile mirror of web `Suggestions` + `Suggestion` in NemuChatDrawer.
 * Renders follow-up pills inline in the thread with web indent and styling.
 */
export function JapaneseLearningFollowUpSuggestions({
  suggestions,
  onSelect,
}: JapaneseLearningFollowUpSuggestionsProps) {
  const { reduceMotion, tokens, scheme } = useNemuTheme();
  const colors = getJapaneseLearningFollowUpSuggestionColors(scheme, tokens);
  const animate = reduceMotion !== true;
  const opacity = useSharedValue(animate ? 0 : 1);
  const translateY = useSharedValue(animate ? ENTER_OFFSET : 0);

  useEffect(() => {
    if (!animate) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withTiming(1, {
      duration: ENTER_OPACITY_MS,
      easing: Easing.out(Easing.ease),
    });
    translateY.value = withSpring(0, ENTER_SPRING);
  }, [animate, opacity, translateY]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (suggestions.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { marginLeft: JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT },
        enterStyle,
      ]}
    >
      <View style={styles.row}>
        {suggestions.map((suggestion) => (
          <SuggestionPill
            key={suggestion}
            suggestion={suggestion}
            colors={colors}
            animate={animate}
            onSelect={onSelect}
          />
        ))}
      </View>
    </Animated.View>
  );
}

type SuggestionPillProps = {
  suggestion: string;
  colors: JapaneseLearningFollowUpSuggestionColors;
  animate: boolean;
  onSelect: (suggestion: string) => void;
};

/**
 * Web `Button` (`active:scale-[0.97] transition-all duration-200 ease-out`)
 * with `.btn-nemu-outline:hover`'s brighter fill while pressed. The fill
 * animates on its own layer (Reanimated) so it never shares a node with the
 * pressable's native-driven scale.
 */
function SuggestionPill({ suggestion, colors, animate, onSelect }: SuggestionPillProps) {
  const pressed = useSharedValue(0);
  const setPressed = (value: 0 | 1) => {
    pressed.value = animate
      ? withTiming(value, {
          duration: JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_PRESS.durationMs,
          // CSS `ease-out`.
          easing: Easing.bezier(0, 0, 0.58, 1),
        })
      : value;
  };
  const restBackground = colors.backgroundColor;
  const pressedBackground = colors.pressedBackgroundColor;
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      pressed.value,
      [0, 1],
      [restBackground, pressedBackground],
    ),
  }));

  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={suggestion}
      hitSlop={{ top: 4, bottom: 4 }}
      // The send path plays web's single `hapticPress`.
      hapticFeedback="none"
      onPress={() => onSelect(suggestion)}
      onPressIn={() => setPressed(1)}
      onPressOut={() => setPressed(0)}
      pressedScale={JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_PRESS.scale}
      pressAnimationDuration={JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_PRESS.durationMs}
      containerStyle={styles.pillTarget}
      style={[styles.pill, { borderColor: colors.borderColor }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.pillFill, { boxShadow: colors.boxShadow }, fillStyle]}
      />
      <Text style={[styles.text, { color: colors.textColor }]}>{suggestion}</Text>
    </NemuPressable>
  );
}

const styles = StyleSheet.create({
  // Web: `ml-11` + `ml-4` puts the pills on the bubble column (x = 60).
  // Web's drawer is at most 672 wide, so a long pill wraps inside it; on a
  // phone the thread runs to the screen edge, so keep a 12pt right margin
  // (Colo msg 854) and let long pills wrap inside the row.
  container: {
    marginTop: 0,
    paddingRight: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    // Spans the container's content box (inside its right padding), so the
    // pills' `maxWidth: "100%"` is the row's width.
    alignSelf: "stretch",
  },
  // The Pressable itself is the row's flex item; capping it at the row's
  // width is what lets the pill (and its text) wrap instead of overflowing.
  pillTarget: {
    maxWidth: "100%",
    flexShrink: 1,
  },
  pill: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: radius.pill,
    // Web `.btn-nemu-outline`: a 0.5px edge (hairline is 1/3pt at 3x).
    borderWidth: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // The pill's fill and shadow, under its 0.5px edge (inset to cover it).
  pillFill: {
    position: "absolute",
    top: -0.5,
    right: -0.5,
    bottom: -0.5,
    left: -0.5,
    borderRadius: radius.pill,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
    textAlign: "left",
    // Wraps within the pill instead of pushing it past the row.
    flexShrink: 1,
  },
});
