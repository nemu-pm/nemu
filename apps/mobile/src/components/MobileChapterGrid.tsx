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

export function MobileChapterGrid({
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
            onPress={() => onPressChapter(chapter)}
            showLanguage={showLanguage}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cellSlot: {
    flexGrow: 1,
    flexBasis: "48%",
    maxWidth: "48%",
  },
});
