import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderChapterList, MobileReaderChapterListStartAt } from "@/lib/mobileReaderChapterList";
import type { ReaderSettingsNativeRows } from "@/lib/readerSettingsNativePopoverLayout";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

export type ReaderChapterListSheetProps = {
  visible: boolean;
  mangaTitle: string;
  /** The open chapter and page. */
  subtitle: string;
  list: MobileReaderChapterList;
  currentChapterId: string;
  progressById: Record<string, LocalChapterProgress | undefined>;
  strings: MobileStrings;
  onClose: () => void;
  /** A chapter to open, once the sheet is down. */
  onSelectChapter: (chapter: ChapterSummary, startAt: MobileReaderChapterListStartAt) => void;
  // iOS: presented as the reader settings are (`ReaderSettingsNativePopover`),
  // from the same inputs, so the two take the same shape and size everywhere.
  /** The chapter button's frame in reader-root coordinates; a popover's arrow points at it. */
  anchor: WindowLayoutRect | null;
  availableHeight: number;
  regularWidth: boolean;
  maxSheetHeight: number | null;
  /** iOS book posture: the sheet sits beside the page, which stays undimmed and interactive. */
  pageInteractive: boolean;
  /** The rows the settings Form has now: its height is this sheet's. */
  settingsRows: ReaderSettingsNativeRows;
};
