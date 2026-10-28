import { StyleSheet, View } from "react-native";
import { nemuFontWeight, NemuText, useNemuTheme } from "@/design-system";
import { MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE } from "@/lib/mobileCollectionFolderGeometry";

/** Section header above the library titles. */
export function MobileLibraryLayoutHeader({ title }: { title: string }) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.row}>
      <NemuText
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE}
        color={tokens.foreground}
        style={styles.title}
      >
        {title}
      </NemuText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: nemuFontWeight.bold,
  },
});
