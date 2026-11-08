import { StyleSheet } from "react-native";
import { MobileNativeSheetScaffold } from "@/design-system";
import { ReaderChapterListBody } from "./ReaderChapterListBody";
import type { ReaderChapterListSheetProps } from "./ReaderChapterListSheet.types";
import { useReaderChapterListSelect } from "./useReaderChapterListSelect";

const SNAP_POINTS = ["85%"];

/** The reader's chapter list on Android / web: the design system's sheet around the same list. */
export function ReaderChapterListSheet({
  visible,
  mangaTitle,
  subtitle,
  list,
  currentChapterId,
  progressById,
  strings,
  onClose,
  onSelectChapter,
}: ReaderChapterListSheetProps) {
  const { select, onDismissed } = useReaderChapterListSelect(onClose, onSelectChapter);
  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      onDismiss={onDismissed}
      title={mangaTitle}
      subtitle={subtitle}
      dismissLabel={strings.reader.closeChapterList}
      // The list scrolls itself, in a fixed-height sheet.
      snapPoints={SNAP_POINTS}
      fillContent
      softBottomEdge
      contentStyle={styles.sheet}
      testID="ReaderChapterListSheet"
    >
      <ReaderChapterListBody
        list={list}
        currentChapterId={currentChapterId}
        progressById={progressById}
        strings={strings}
        onClose={onClose}
        onSelectChapter={select}
      />
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    minHeight: 0,
  },
});
