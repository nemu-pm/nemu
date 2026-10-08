import { StyleSheet, View } from "react-native";
import { nemuFontWeight, NemuText, useNemuTheme } from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import { ExploreGlassSegmented } from "./ExploreGlass";
import { MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE } from "@/lib/mobileCollectionFolderGeometry";

/** Section header above the library titles with a glass Shelf | Grid switch. */
export function MobileLibraryLayoutHeader({
  title,
  shelf,
  onShelfChange,
  strings,
}: {
  title: string;
  shelf: boolean;
  onShelfChange: (shelf: boolean) => void;
  strings: MobileStrings;
}) {
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
      <ExploreGlassSegmented
        accessibilityLabel={strings.designExplore.layoutPickerLabel}
        value={shelf ? "shelf" : "grid"}
        onChange={(value) => onShelfChange(value === "shelf")}
        options={[
          { value: "shelf", label: strings.designExplore.layoutShelf },
          { value: "grid", label: strings.designExplore.layoutGrid },
        ]}
      />
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
