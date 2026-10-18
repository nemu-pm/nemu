import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  NemuPressable,
  NemuText,
  nemuFontWeight,
  nemuMaxFontSizeMultiplier,
  nemuText,
  useNemuTheme,
} from "@/design-system";
import type { SearchSourceDisplay } from "@/lib/mobileSearch";
import { MobileSearchSourceIcon } from "./MobileSearchSourceIcon";

const SOURCE_ICON_SIZE = 22;

/**
 * The top level of the results ("Library", "Live Source Results"), shown only
 * while BOTH kinds are on screen (`mobileSearchShowsKindHeaders`): a quiet
 * sentence-case secondary label, like a grouped list's section header — the
 * source headers under it already say where each result comes from.
 */
export function MobileSearchKindHeader({ title }: { title: string }) {
  const { tokens } = useNemuTheme();
  return (
    <NemuText
      accessibilityRole="header"
      maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
      numberOfLines={1}
      style={[styles.kindTitle, { color: tokens.mutedForeground }]}
    >
      {title}
    </NemuText>
  );
}

/**
 * One source's result section header: the source icon, its name as a
 * semibold headline, the result count as secondary text beside it, and a
 * trailing "See All" when the source has more than this page shows — the
 * native grouped-results header (App Store / Music), never uppercase with a
 * middle dot.
 */
export function MobileSearchSourceSectionHeader({
  source,
  count,
  action,
}: {
  source: Pick<SearchSourceDisplay, "icon" | "name">;
  /** Already formatted ("8", "20+"). */
  count?: string;
  action?: { label: string; accessibilityLabel: string; onPress: () => void };
}) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.sourceHeader}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={count ? `${source.name}, ${count}` : source.name}
        style={styles.sourceTitleGroup}
      >
        <MobileSearchSourceIcon source={source} size={SOURCE_ICON_SIZE} />
        <NemuText
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          numberOfLines={1}
          style={[nemuText.sectionTitle, styles.sourceTitle, { color: tokens.foreground }]}
        >
          {source.name}
        </NemuText>
        {count ? (
          <NemuText
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            numberOfLines={1}
            style={[styles.sourceCount, { color: tokens.mutedForeground }]}
          >
            {count}
          </NemuText>
        ) : null}
      </View>
      {action ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          hapticFeedback="selection"
          hitSlop={8}
          onPress={action.onPress}
          pressProfile="row"
          style={styles.seeAll}
        >
          <NemuText
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            numberOfLines={1}
            style={[styles.seeAllText, { color: tokens.primary }]}
          >
            {action.label}
          </NemuText>
          <Ionicons name="chevron-forward" size={15} color={tokens.primary} />
        </NemuPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kindTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0,
  },
  sourceHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sourceTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sourceTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
  sourceCount: {
    ...nemuText.body,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  seeAll: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    ...nemuText.body,
    fontSize: 15,
  },
});
