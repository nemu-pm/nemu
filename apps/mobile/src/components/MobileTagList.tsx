import { StyleSheet, View } from "react-native";
import { MobileChip } from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  getMobileTagOverflowCount,
  getMobileVisibleTags,
} from "@/lib/mobileTags";

/**
 * Manga tags/genres. They are read-only, so they use the chip primitive's
 * `static` variant: the same pill as every interactive chip, minus the press
 * state and the 44pt touch frame.
 */
export function MobileTagList({
  tags,
  strings,
}: {
  tags: string[];
  strings: MobileStrings;
}) {
  const visibleTags = getMobileVisibleTags(tags);
  const overflowCount = getMobileTagOverflowCount(tags);

  if (!visibleTags.length) return null;

  return (
    <View style={styles.tagRow}>
      {visibleTags.map((tag) => (
        <MobileChip
          key={tag.key}
          accessibilityLabel={tag.label}
          label={tag.label}
          variant="static"
        />
      ))}
      {overflowCount > 0 ? (
        <MobileChip
          accessibilityLabel={formatMobileString(strings.common.moreTags, {
            count: overflowCount,
          })}
          label={`+${overflowCount}`}
          variant="static"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
