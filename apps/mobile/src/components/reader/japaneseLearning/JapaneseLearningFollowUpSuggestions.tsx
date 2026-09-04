import { StyleSheet, Text, View } from "react-native";
import {
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import {
  getJapaneseLearningFollowUpSuggestionColors,
  JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT,
} from "@/lib/mobileJapaneseLearningChatTheme";

type JapaneseLearningFollowUpSuggestionsProps = {
  suggestions: string[];
  disabled?: boolean;
  onSelect: (suggestion: string) => void;
};

/**
 * Mobile mirror of web `Suggestions` + `Suggestion` in NemuChatDrawer.
 * Renders follow-up pills inline in the thread with web indent and styling.
 */
export function JapaneseLearningFollowUpSuggestions({
  suggestions,
  disabled = false,
  onSelect,
}: JapaneseLearningFollowUpSuggestionsProps) {
  const { tokens, scheme } = useNemuTheme();
  const colors = getJapaneseLearningFollowUpSuggestionColors(scheme, tokens);

  if (suggestions.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        { marginLeft: JAPANESE_LEARNING_FOLLOW_UP_SUGGESTION_INDENT },
      ]}
    >
      <View style={styles.row}>
        {suggestions.map((suggestion) => (
          <NemuPressable
            key={suggestion}
            accessibilityRole="button"
            accessibilityLabel={suggestion}
            accessibilityState={{ disabled }}
            disabled={disabled}
            minimumTouchTarget
            hapticFeedback="selection"
            onPress={() => onSelect(suggestion)}
            pressedScale={0.985}
            style={[
              styles.pill,
              {
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor,
                opacity: disabled ? 0.56 : 1,
              },
            ]}
          >
            <Text style={[styles.text, { color: colors.textColor }]}>
              {suggestion}
            </Text>
          </NemuPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 2,
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
    borderWidth: StyleSheet.hairlineWidth,
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
