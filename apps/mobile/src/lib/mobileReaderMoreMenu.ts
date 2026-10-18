import type { ChapterSummary } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import { formatChapterTitle } from "@/lib/formatChapter";
import { formatChapterAccessibilityLabel } from "@/lib/mobileReaderFormat";

/**
 * The reader's ⋯ menu (phone chrome, top trailing circle). Every entry is an
 * action the reader already performs elsewhere — the scrubber's chapter
 * buttons, the error state's retry, the settings sheet's "Mark complete" and
 * "Plugins" rows — gathered where a thumb resting on the top row finds them.
 *
 * Deliberately absent: a chapter list (the reader has none; Back returns to
 * the title's page, which is that list) and "open in browser" (chapters carry
 * no URL and the reader never loads the title's).
 */
export type MobileReaderMoreMenuActionId =
  | "previous-chapter"
  | "next-chapter"
  | "reload-chapter"
  | "mark-complete"
  | "reader-settings"
  | "reader-plugins";

/** Android leading icon (Material Symbols); iOS uses `systemImage`. */
export type MobileReaderMoreMenuIcon =
  | "skipPrevious"
  | "skipNext"
  | "refresh"
  | "checkCircle"
  | "settings"
  | "extension";

export type MobileReaderMoreMenuItem = {
  id: MobileReaderMoreMenuActionId;
  title: string;
  /** Second line (the chapter it opens), when there is one. */
  subtitle?: string;
  /** SF Symbol. */
  systemImage: string;
  icon: MobileReaderMoreMenuIcon;
  disabled: boolean;
  accessibilityLabel: string;
};

export type MobileReaderMoreMenuSection = {
  id: "chapters" | "chapter" | "reader";
  items: MobileReaderMoreMenuItem[];
};

export type MobileReaderMoreMenuInput = {
  strings: MobileStrings;
  /** Previous / next chapter in reading order (not screen side). */
  previousChapter: ChapterSummary | null;
  nextChapter: ChapterSummary | null;
  pagesStatus: "idle" | "loading" | "ready" | "error" | "blocked";
  pageCount: number;
  completed: boolean;
  saving: boolean;
  /** Same condition as the settings sheet's Plugins row. */
  showPlugins: boolean;
};

function chapterItem(
  direction: "previous" | "next",
  chapter: ChapterSummary | null,
  strings: MobileStrings,
): MobileReaderMoreMenuItem {
  const previous = direction === "previous";
  // Locked chapters stay reachable, as from the scrubber: the reader then
  // explains the lock instead of the menu hiding why nothing happens.
  return {
    id: previous ? "previous-chapter" : "next-chapter",
    title: previous ? strings.reader.previousChapter : strings.reader.nextChapter,
    subtitle: chapter ? formatChapterTitle(chapter, strings) : undefined,
    systemImage: previous ? "backward.end" : "forward.end",
    icon: previous ? "skipPrevious" : "skipNext",
    disabled: !chapter,
    accessibilityLabel: chapter
      ? formatChapterAccessibilityLabel(direction, chapter, strings)
      : previous
        ? strings.reader.noPreviousChapter
        : strings.reader.noNextChapter,
  };
}

export function buildMobileReaderMoreMenu(input: MobileReaderMoreMenuInput): MobileReaderMoreMenuSection[] {
  const { strings } = input;
  const ready = input.pagesStatus === "ready" && input.pageCount > 0;
  const markTitle = input.completed
    ? strings.reader.markedComplete
    : input.saving
      ? strings.reader.savingProgress
      : strings.reader.markComplete;
  const readerItems: MobileReaderMoreMenuItem[] = [
    {
      id: "reader-settings",
      title: strings.reader.readerSettingsMenu,
      systemImage: "gearshape",
      icon: "settings",
      disabled: false,
      accessibilityLabel: strings.reader.readerSettingsMenu,
    },
  ];
  if (input.showPlugins) {
    readerItems.push({
      id: "reader-plugins",
      title: strings.reader.readerPluginsMenu,
      systemImage: "puzzlepiece.extension",
      icon: "extension",
      disabled: false,
      accessibilityLabel: strings.reader.readerPluginsMenu,
    });
  }
  return [
    {
      id: "chapters",
      items: [
        chapterItem("previous", input.previousChapter, strings),
        chapterItem("next", input.nextChapter, strings),
      ],
    },
    {
      id: "chapter",
      items: [
        {
          id: "reload-chapter",
          title: strings.reader.reloadChapter,
          systemImage: "arrow.clockwise",
          icon: "refresh",
          // Already fetching: a second request would only restart it.
          disabled: input.pagesStatus === "idle" || input.pagesStatus === "loading",
          accessibilityLabel: strings.reader.reloadChapter,
        },
        {
          id: "mark-complete",
          title: markTitle,
          systemImage: input.completed ? "checkmark.circle.fill" : "checkmark.circle",
          icon: "checkCircle",
          // Completion records the last page: only once the pages are known.
          disabled: input.completed || input.saving || !ready,
          accessibilityLabel: markTitle,
        },
      ],
    },
    { id: "reader", items: readerItems },
  ];
}
