import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import {
  NemuPressable,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import { MobileMangaDetailDescriptionSheet } from "@/components/MobileMangaDetailDescriptionSheet";
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
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <View style={styles.descriptionBlock}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={collapsible ? collapsedLines : undefined}
        style={[styles.description, { color: tokens.mutedForeground }]}
      >
        {value}
      </Text>
      {collapsible ? (
        <>
          {/* The whole description opens in a sheet; the page never expands in place. */}
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={strings.designExplore.descriptionMore}
            accessibilityHint={strings.designExplore.descriptionMoreHint}
            onPress={() => setSheetOpen(true)}
            pressedScale={0.98}
            style={styles.descriptionToggle}
          >
            <Text style={[styles.descriptionToggleText, { color: tokens.mutedForeground }]}>
              {strings.designExplore.descriptionMore}
            </Text>
            <Ionicons name="chevron-forward-outline" size={14} color={tokens.mutedForeground} />
          </NemuPressable>
          <MobileMangaDetailDescriptionSheet
            visible={sheetOpen}
            description={value}
            strings={strings}
            onClose={() => setSheetOpen(false)}
          />
        </>
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
