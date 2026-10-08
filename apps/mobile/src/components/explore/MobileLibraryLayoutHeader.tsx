import { StyleSheet, View } from "react-native";
import { nemuFontWeight, NemuText, useNemuTheme } from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import SegmentedControl from "@expo/ui/community/segmented-control";
import { MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE } from "@/lib/mobileCollectionFolderGeometry";

/** Section header above the library titles with the system Shelf | Grid segmented control. */
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
  const { scheme, tokens } = useNemuTheme();
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
      {/* The system segmented control (Liquid Glass on iOS 26); it labels itself for VoiceOver. */}
      <SegmentedControl
        appearance={scheme}
        selectedIndex={shelf ? 0 : 1}
        style={styles.segmented}
        testID={strings.designExplore.layoutPickerLabel}
        tintColor={tokens.primary}
        values={[strings.designExplore.layoutShelf, strings.designExplore.layoutGrid]}
        onChange={({ nativeEvent }) => onShelfChange(nativeEvent.selectedSegmentIndex === 0)}
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
  segmented: {
    width: 170,
    minHeight: 34,
  },
  title: {
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: nemuFontWeight.bold,
  },
});
