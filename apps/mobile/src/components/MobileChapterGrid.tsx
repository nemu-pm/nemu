import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { MobileChapterCell } from "@/components/MobileChapterCell";
import type { AppLanguage, ChapterSummary, LocalChapterProgress } from "@/data/schema";
import type { MobileChapterRow } from "@/lib/mobileChapterRows";
import type { MobileStrings } from "@/lib/mobileI18n";

type MobileChapterGridProps = {
  appLanguage?: AppLanguage;
  busy: boolean;
  chapters: MobileChapterRow["chapters"];
  openChapterTemplate: string;
  progressByChapterId: Record<string, LocalChapterProgress | undefined>;
  strings: MobileStrings;
  onPressChapter: (chapter: ChapterSummary) => void;
  showLanguage?: boolean;
};

export const MobileChapterGrid = memo(function MobileChapterGrid({
  appLanguage,
  busy,
  chapters,
  openChapterTemplate,
  progressByChapterId,
  strings,
  onPressChapter,
  showLanguage = false,
}: MobileChapterGridProps) {
  return (
    <View style={styles.grid}>
      {chapters.map((chapter) => (
        <View key={chapter.id} style={styles.cellSlot}>
          <MobileChapterCell
            appLanguage={appLanguage}
            chapter={chapter}
            progress={progressByChapterId[chapter.id]}
            busy={busy}
            openChapterTemplate={openChapterTemplate}
            strings={strings}
            onPress={onPressChapter}
            showLanguage={showLanguage}
          />
        </View>
      ))}
      {chapters.length === 1 ? <View style={styles.cellSlot} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // Two equal columns that fill the row exactly: the grid's trailing edge is
  // the content edge (the section header's sort action ends on it too). A
  // 48% basis left ~4% of the row empty past the second column.
  grid: {
    flexDirection: "row",
    gap: 8,
  },
  cellSlot: {
    flex: 1,
    minWidth: 0,
  },
});
