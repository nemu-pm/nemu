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
import { getMobileDetailDescriptionPresentation } from "@/lib/mobileMangaDetailPaneLayout";

export function MobileExpandableDescription({
  value,
  strings,
  pane = false,
}: {
  value: string;
  strings: MobileStrings;
  /** Regular-width info pane: shown in full unless very long. */
  pane?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const { collapsible, collapsedLines } = getMobileDetailDescriptionPresentation({ value, pane });
  const [expanded, setExpanded] = useState(false);
  const toggleLabel = expanded ? strings.common.collapse : strings.common.expand;

  return (
    <View style={styles.descriptionBlock}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={collapsible && !expanded ? collapsedLines : undefined}
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
