import { StyleSheet, View } from "react-native";
import { MobileChip, MobileNativeSheetScaffold } from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";

/** Past this many chips the sheet gets a detent and scrolls instead of fitting its content. */
const SCROLLING_TAG_COUNT = 30;

/**
 * Every tag of a title, opened from the hero's "+N" chip (detail design A).
 * A native bottom sheet rather than an inline expansion, so the hero card and
 * its Read button never move when the full list is shown.
 */
export function MobileMangaDetailTagSheet({
  visible,
  tags,
  strings,
  onClose,
}: {
  visible: boolean;
  tags: string[];
  strings: MobileStrings;
  onClose: () => void;
}) {
  const scrolls = tags.length > SCROLLING_TAG_COUNT;
  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      title={formatMobileString(strings.common.tagsSheetTitle, { count: tags.length })}
      dismissLabel={strings.common.closeTagsSheet}
      snapPoints={scrolls ? ["60%", "90%"] : undefined}
      scroll={scrolls}
      scrollContentBottomInset={18}
      testID="MangaDetailTagSheet"
    >
      <View style={styles.tags}>
        {tags.map((tag, index) => (
          <MobileChip
            key={`${index}:${tag}`}
            accessibilityLabel={tag}
            label={tag}
            variant="static"
            // The sheet is where a long tag is read in full: the hero row
            // keeps its capped, single-line chips.
            wrapLabel
          />
        ))}
      </View>
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
