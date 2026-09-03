import type { ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileChapterGrid } from "@/components/MobileChapterGrid";
import type { AppLanguage, ChapterSummary, LocalChapterProgress } from "@/data/schema";
import {
  nemuFontWeight,
  useNemuTheme,
  NemuInlineEmptyState,
  NemuPressable,
  radius,
} from "@/design-system";
import type { MobileChapterListPreference } from "@/lib/mobileChapterFilters";
import type { MobileChapterRow } from "@/lib/mobileChapterRows";
import type { MobileStrings } from "@/lib/mobileI18n";
import { formatMobileLanguageDisplayName } from "@/lib/mobileLanguageSettings";

type MobileMangaChapterSectionHeaderProps = {
  emptyIcon?: "reader-outline" | "albums-outline";
  emptyTitle: string;
  hasChapters: boolean;
  loading?: boolean;
  notice?: ReactNode;
  sortAction?: ReactNode;
  sourceSelector?: ReactNode;
  toolbar?: ReactNode;
  title: string;
};

type MobileMangaChapterRowProps = {
  appLanguage?: AppLanguage;
  busy: boolean;
  chapters: MobileChapterRow["chapters"];
  first: boolean;
  openChapterTemplate: string;
  progressByChapterId: Record<string, LocalChapterProgress | undefined>;
  strings: MobileStrings;
  onPressChapter: (chapter: ChapterSummary) => void;
  showLanguage?: boolean;
};

type MobileMangaChapterToolbarProps = {
  appLanguage: AppLanguage;
  languages: string[];
  preference: MobileChapterListPreference;
  strings: MobileStrings;
  unreadCount: number;
  onChange: (preference: MobileChapterListPreference) => void;
};

type MobileMangaChapterSortActionProps = {
  preference: MobileChapterListPreference;
  strings: MobileStrings;
  onChange: (preference: MobileChapterListPreference) => void;
};

function MobileChapterToolbarChip({
  accessibilityLabel,
  badge,
  label,
  selected,
  onPress,
}: {
  accessibilityLabel: string;
  badge?: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();

  return (
    <NemuPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hapticFeedback="selection"
      onPress={onPress}
      pressedScale={0.97}
      style={[
        styles.toolbarChip,
        {
          backgroundColor: selected ? tokens.toolbarAction : tokens.secondary,
          borderColor: selected ? tokens.toolbarActionBorder : "transparent",
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.toolbarChipText,
          { color: selected ? tokens.primary : tokens.secondaryForeground },
        ]}
      >
        {label}
      </Text>
      {badge ? (
        <View style={[styles.toolbarChipBadge, { backgroundColor: tokens.primary }]}>
          <Text
            numberOfLines={1}
            style={[
              styles.toolbarChipBadgeText,
              { color: tokens.primaryForeground },
            ]}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </NemuPressable>
  );
}

/**
 * Sort direction is a single trailing text action in the section header row,
 * not a chip: it toggles one value and never opens a menu.
 */
export function MobileMangaChapterSortAction({
  preference,
  strings,
  onChange,
}: MobileMangaChapterSortActionProps) {
  const { tokens } = useNemuTheme();
  const label =
    preference.sortDirection === "desc"
      ? strings.sourceBrowse.sortDescending
      : strings.sourceBrowse.sortAscending;

  return (
    <NemuPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hapticFeedback="selection"
      minimumTouchTarget
      onPress={() =>
        onChange({
          ...preference,
          sortDirection: preference.sortDirection === "desc" ? "asc" : "desc",
        })
      }
      pressProfile="icon"
      style={styles.sortAction}
    >
      <Ionicons name="swap-vertical-outline" size={16} color={tokens.primary} />
      <Text style={[styles.sortActionLabel, { color: tokens.primary }]}>
        {label}
      </Text>
    </NemuPressable>
  );
}

export function MobileMangaChapterToolbar({
  appLanguage,
  languages,
  preference,
  strings,
  unreadCount,
  onChange,
}: MobileMangaChapterToolbarProps) {
  const selectedLanguages = new Set(preference.languages);
  const toggleLanguage = (language: string) => {
    const next = new Set(selectedLanguages);
    if (next.has(language)) next.delete(language);
    else next.add(language);
    onChange({ ...preference, languages: [...next] });
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.toolbarRow}
    >
      <MobileChapterToolbarChip
        accessibilityLabel={strings.sourceBrowse.unreadOnly}
        badge={String(unreadCount)}
        label={strings.sourceBrowse.unreadOnly}
        selected={preference.unreadOnly}
        onPress={() =>
          onChange({ ...preference, unreadOnly: !preference.unreadOnly })
        }
      />
      {languages.length > 1
        ? languages.map((language) => {
            const label = formatMobileLanguageDisplayName(language, appLanguage, {
              multi: strings.sourceBrowse.multiLanguage,
              other: strings.browse.otherLanguages,
            });
            return (
              <MobileChapterToolbarChip
                key={language}
                accessibilityLabel={label}
                label={label}
                selected={selectedLanguages.has(language)}
                onPress={() => toggleLanguage(language)}
              />
            );
          })
        : null}
    </ScrollView>
  );
}

export function MobileMangaChapterSectionHeader({
  emptyIcon = "reader-outline",
  emptyTitle,
  hasChapters,
  loading = false,
  notice,
  sortAction,
  sourceSelector,
  toolbar,
  title,
}: MobileMangaChapterSectionHeaderProps) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: tokens.foreground }]}>
          {title}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={tokens.primary} />
        ) : (
          sortAction
        )}
      </View>
      {sourceSelector}
      {toolbar}
      {notice}
      {!hasChapters && !loading ? (
        <NemuInlineEmptyState icon={emptyIcon} title={emptyTitle} />
      ) : null}
    </View>
  );
}

export function MobileMangaChapterRow({
  appLanguage,
  busy,
  chapters,
  first,
  openChapterTemplate,
  progressByChapterId,
  strings,
  onPressChapter,
  showLanguage = false,
}: MobileMangaChapterRowProps) {
  return (
    <View style={first ? styles.firstChapterRow : styles.chapterRow}>
      <MobileChapterGrid
        appLanguage={appLanguage}
        busy={busy}
        chapters={chapters}
        openChapterTemplate={openChapterTemplate}
        progressByChapterId={progressByChapterId}
        strings={strings}
        onPressChapter={onPressChapter}
        showLanguage={showLanguage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 16,
  },
  sectionHeaderRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: nemuFontWeight.semibold,
  },
  sortAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sortActionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toolbarChip: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
  },
  toolbarChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  toolbarChipBadge: {
    flexShrink: 0,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  toolbarChipBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: nemuFontWeight.semibold,
  },
  firstChapterRow: {
    marginTop: 16,
  },
  chapterRow: {
    marginTop: 8,
  },
});
