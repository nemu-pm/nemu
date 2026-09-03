import type { ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileChapterGrid } from "@/components/MobileChapterGrid";
import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
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

type MobileMangaChapterSectionHeaderProps = {
  emptyIcon?: "reader-outline" | "albums-outline";
  emptyTitle: string;
  hasChapters: boolean;
  loading?: boolean;
  notice?: ReactNode;
  sourceSelector?: ReactNode;
  toolbar?: ReactNode;
  title: string;
};

type MobileMangaChapterRowProps = {
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
  languages: string[];
  preference: MobileChapterListPreference;
  strings: MobileStrings;
  unreadCount: number;
  onChange: (preference: MobileChapterListPreference) => void;
};

export function MobileMangaChapterToolbar({
  languages,
  preference,
  strings,
  unreadCount,
  onChange,
}: MobileMangaChapterToolbarProps) {
  const { tokens } = useNemuTheme();
  const selectedLanguages = new Set(preference.languages);
  const toggleLanguage = (language: string) => {
    const next = new Set(selectedLanguages);
    if (next.has(language)) next.delete(language);
    else next.add(language);
    onChange({ ...preference, languages: [...next] });
  };

  return (
    <View style={styles.toolbarStack}>
      <View style={styles.toolbarRow}>
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={
            preference.sortDirection === "desc"
              ? strings.sourceBrowse.sortDescending
              : strings.sourceBrowse.sortAscending
          }
          onPress={() =>
            onChange({
              ...preference,
              sortDirection: preference.sortDirection === "desc" ? "asc" : "desc",
            })
          }
          pressProfile="icon"
          style={[styles.toolbarChip, { backgroundColor: tokens.muted }]}
        >
          <Ionicons
            name={preference.sortDirection === "desc" ? "arrow-down-outline" : "arrow-up-outline"}
            size={16}
            color={tokens.foreground}
          />
          <Text style={[styles.toolbarChipText, { color: tokens.foreground }]}>
            {preference.sortDirection === "desc"
              ? strings.sourceBrowse.sortDescending
              : strings.sourceBrowse.sortAscending}
          </Text>
        </NemuPressable>
        <NemuPressable
          accessibilityRole="button"
          accessibilityState={{ selected: preference.unreadOnly }}
          onPress={() => onChange({ ...preference, unreadOnly: !preference.unreadOnly })}
          pressProfile="row"
          style={[
            styles.toolbarChip,
            {
              backgroundColor: preference.unreadOnly ? tokens.primary : tokens.muted,
            },
          ]}
        >
          <View
            style={[
              styles.toolbarUnreadDot,
              {
                backgroundColor: preference.unreadOnly
                  ? tokens.primaryForeground
                  : tokens.primary,
              },
            ]}
          />
          <Text
            style={[
              styles.toolbarChipText,
              {
                color: preference.unreadOnly
                  ? tokens.primaryForeground
                  : tokens.foreground,
              },
            ]}
          >
            {strings.library.progressUnread} · {unreadCount}
          </Text>
        </NemuPressable>
      </View>
      {languages.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.languageToolbar}
        >
          {languages.map((language) => {
            const selected = selectedLanguages.has(language);
            return (
              <NemuPressable
                key={language}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleLanguage(language)}
                pressProfile="row"
                style={[
                  styles.languageChip,
                  {
                    backgroundColor: selected ? tokens.primary : tokens.card,
                    borderColor: selected ? tokens.primary : tokens.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.languageChipText,
                    { color: selected ? tokens.primaryForeground : tokens.foreground },
                  ]}
                >
                  {language.toUpperCase()}
                </Text>
              </NemuPressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

export function MobileMangaChapterSectionHeader({
  emptyIcon = "reader-outline",
  emptyTitle,
  hasChapters,
  loading = false,
  notice,
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
        ) : null}
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
  toolbarStack: {
    gap: 9,
  },
  toolbarRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toolbarChip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  toolbarChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  toolbarUnreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  languageToolbar: {
    gap: 7,
  },
  languageChip: {
    minWidth: 44,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
  },
  languageChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.semibold,
  },
  firstChapterRow: {
    marginTop: 16,
  },
  chapterRow: {
    marginTop: 8,
  },
});
