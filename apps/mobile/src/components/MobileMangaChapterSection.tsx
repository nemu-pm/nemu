import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MobileChapterGrid } from "@/components/MobileChapterGrid";
import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
import {
  nemuFontWeight,
  useNemuTheme,
  NemuInlineEmptyState,
} from "@/design-system";
import type { MobileChapterRow } from "@/lib/mobileChapterRows";
import type { MobileStrings } from "@/lib/mobileI18n";

type MobileMangaChapterSectionHeaderProps = {
  emptyIcon?: "reader-outline" | "albums-outline";
  emptyTitle: string;
  hasChapters: boolean;
  loading?: boolean;
  notice?: ReactNode;
  sourceSelector?: ReactNode;
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
};

export function MobileMangaChapterSectionHeader({
  emptyIcon = "reader-outline",
  emptyTitle,
  hasChapters,
  loading = false,
  notice,
  sourceSelector,
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
  firstChapterRow: {
    marginTop: 16,
  },
  chapterRow: {
    marginTop: 8,
  },
});
