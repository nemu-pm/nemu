import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import {
  NemuPressable,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";

const DESCRIPTION_COLLAPSED_LINES = 3;
const DESCRIPTION_COLLAPSED_CHAR_LIMIT = 260;

function shouldCollapseDescription(value: string): boolean {
  return (
    value.length > DESCRIPTION_COLLAPSED_CHAR_LIMIT ||
    value.split(/\r?\n/).length > DESCRIPTION_COLLAPSED_LINES
  );
}

export function MobileExpandableDescription({
  value,
  strings,
}: {
  value: string;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const collapsible = shouldCollapseDescription(value);
  const [expanded, setExpanded] = useState(false);
  const toggleLabel = expanded ? strings.common.collapse : strings.common.expand;

  return (
    <View style={styles.descriptionBlock}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={collapsible && !expanded ? DESCRIPTION_COLLAPSED_LINES : undefined}
        style={[styles.description, { color: tokens.mutedForeground }]}
      >
        {value}
      </Text>
      {collapsible ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          pressedScale={0.98}
          style={styles.descriptionToggle}
        >
          <Ionicons
            name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
            size={14}
            color={tokens.mutedForeground}
          />
          <Text style={[styles.descriptionToggleText, { color: tokens.mutedForeground }]}>
            {toggleLabel}
          </Text>
        </NemuPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  description: {
    fontSize: 14,
    lineHeight: 22,
  },
  descriptionBlock: {
    gap: 6,
  },
  descriptionToggle: {
    alignSelf: "flex-start",
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.md,
    paddingHorizontal: 2,
  },
  descriptionToggleText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
});
