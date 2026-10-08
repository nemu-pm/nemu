import { MenuView } from "@expo/ui/community/menu";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { MobileSourceSelectorItem } from "@/components/MobileSourceSelector";
import type { AppLanguage } from "@/data/schema";
import { nemuColorWithAlpha, nemuFontWeight, NemuText, radius, useNemuTheme } from "@/design-system";
import type { MobileChapterListPreference } from "@/lib/mobileChapterFilters";
import type { MobileStrings } from "@/lib/mobileI18n";
import { formatMobileLanguageDisplayName } from "@/lib/mobileLanguageSettings";
import { hapticSelection } from "@/lib/haptics";

/**
 * The chapter list's one control, on the "Chapters" line's trailing edge: a
 * quiet pill naming the source and its chapter count ("MangaDex · 130") that
 * opens a system menu with the sources, the sort, the unread and language
 * filters and the jump to the next chapter to read.
 */
export function MobileExploreChapterMenu({
  appLanguage, languages, preference, strings, unreadCount, onChange, sources, jump, fallbackCount,
}: {
  /** The list's length, for the label when no source is named. */
  fallbackCount?: number;
  appLanguage: AppLanguage;
  languages: string[];
  preference: MobileChapterListPreference;
  strings: MobileStrings;
  unreadCount: number;
  onChange: (value: MobileChapterListPreference) => void;
  sources?: {
    items: MobileSourceSelectorItem[];
    selectedId: string | null;
    disabled?: boolean;
    onSelect: (id: string) => void;
  } | null;
  jump: { label: string | null; onPress: () => void } | null;
}) {
  const { tokens } = useNemuTheme();
  const selected = sources?.items.find((item) => item.id === sources.selectedId) ?? null;
  const count = selected?.count ?? fallbackCount;
  const label = selected
    ? `${selected.name}${count ? ` · ${count}` : ""}`
    : preference.sortDirection === "desc"
      ? strings.sourceBrowse.sortDescending
      : strings.sourceBrowse.sortAscending;
  const sourceActions: NonNullable<Parameters<typeof MenuView>[0]["actions"]> = sources && sources.items.length > 1 ? [{
    title: strings.sourceBrowse.source,
    image: "globe" as const,
    subactions: sources.items.map((item) => ({
      id: `source:${item.id}`,
      title: `${item.name}${item.count ? ` · ${item.count}` : ""}`,
      state: item.id === sources.selectedId ? "on" as const : "off" as const,
      attributes: { disabled: sources.disabled },
    })),
  }] : [];
  const actions: Parameters<typeof MenuView>[0]["actions"] = [
    { id: "sort:asc", title: strings.sourceBrowse.sortAscending, image: "arrow.up", state: preference.sortDirection === "asc" ? "on" as const : "off" as const },
    { id: "sort:desc", title: strings.sourceBrowse.sortDescending, image: "arrow.down", state: preference.sortDirection === "desc" ? "on" as const : "off" as const },
    { id: "unread", title: `${strings.sourceBrowse.unreadOnly} (${unreadCount})`, state: preference.unreadOnly ? "on" as const : "off" as const },
    ...(languages.length > 1 ? languages.map((language) => ({
      id: `language:${language}`,
      title: formatMobileLanguageDisplayName(language, appLanguage, { multi: strings.sourceBrowse.multiLanguage, other: strings.browse.otherLanguages }),
      state: preference.languages.includes(language) ? "on" as const : "off" as const,
    })) : []),
    ...sourceActions,
    ...(jump ? [{ id: "jump", title: jump.label ? `${strings.designExplore.chapterUpNext} · ${jump.label}` : strings.designExplore.chapterUpNext, image: "arrow.down.to.line" as const }] : []),
  ];
  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent: { event } }) => {
        void hapticSelection();
        if (event === "jump") jump?.onPress();
        else if (event === "unread") onChange({ ...preference, unreadOnly: !preference.unreadOnly });
        else if (event.startsWith("sort:")) onChange({ ...preference, sortDirection: event === "sort:asc" ? "asc" : "desc" });
        else if (event.startsWith("source:")) {
          const id = event.slice(7);
          if (!sources?.disabled && id !== sources?.selectedId) sources?.onSelect(id);
        } else if (event.startsWith("language:")) {
          const language = event.slice(9);
          const next = new Set(preference.languages);
          if (next.has(language)) next.delete(language); else next.add(language);
          onChange({ ...preference, languages: [...next] });
        }
      }}
      style={styles.menu}
    >
      <View accessibilityLabel={label} accessibilityRole="button" style={[styles.pill, { backgroundColor: nemuColorWithAlpha(tokens.foreground, 0.07) }]}>
        <NemuText numberOfLines={1} maxFontSizeMultiplier={1.4} color={tokens.foreground} style={styles.label}>
          {label}
        </NemuText>
        <Svg width={10} height={10} viewBox="0 0 10 10">
          <Path d="M2 3.6 5 6.6l3-3" stroke={tokens.mutedForeground} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  menu: { flexShrink: 1, maxWidth: "100%" },
  // A quiet pill: no glass, no fill-vs-page contrast fight with the two button styles.
  pill: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  label: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: nemuFontWeight.semibold },
});
