import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
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
          <NemuPressable
            key={suggestion}
            accessibilityRole="button"
            accessibilityLabel={suggestion}
            hitSlop={{ top: 4, bottom: 4 }}
            // The send path plays web's single `hapticPress`.
            hapticFeedback="none"
            onPress={() => onSelect(suggestion)}
            pressedScale={0.985}
            style={[
              styles.pill,
              {
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor,
                boxShadow: colors.boxShadow,
              },
            ]}
          >
            <Text style={[styles.text, { color: colors.textColor }]}>
              {suggestion}
            </Text>
          </NemuPressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Web: `ml-11` + `ml-4` puts the pills on the bubble column (x = 60).
  container: {
    marginTop: 0,
    paddingRight: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
    textAlign: "left",
  },
});
