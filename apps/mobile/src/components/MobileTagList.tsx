import { StyleSheet, Text, View } from "react-native";
import { radius, nemuFontWeight, useNemuTheme } from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  getMobileTagOverflowCount,
  getMobileVisibleTags,
} from "@/lib/mobileTags";

export function MobileTagList({
  tags,
  strings,
}: {
  tags: string[];
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const visibleTags = getMobileVisibleTags(tags);
  const overflowCount = getMobileTagOverflowCount(tags);

  if (!visibleTags.length) return null;

  return (
    <View style={styles.tagRow}>
      {visibleTags.map((tag) => (
        <View key={tag.key} style={[styles.tag, { backgroundColor: tokens.muted }]}>
          <Text style={[styles.tagText, { color: tokens.mutedForeground }]}>{tag.label}</Text>
        </View>
      ))}
      {overflowCount > 0 ? (
        <View
          accessible
          accessibilityLabel={formatMobileString(strings.common.moreTags, {
            count: overflowCount,
          })}
          style={[
            styles.overflowTag,
            {
              borderColor: tokens.border,
              backgroundColor: tokens.card,
            },
          ]}
        >
          <Text style={[styles.tagText, { color: tokens.mutedForeground }]}>
            +{overflowCount}
          </Text>
        </View>
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
  tag: {
    minHeight: 28,
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 9,
  },
  overflowTag: {
    minHeight: 28,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
  },
  tagText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
});
