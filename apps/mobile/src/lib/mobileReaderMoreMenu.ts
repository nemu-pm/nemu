import type { ChapterSummary } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import { formatChapterTitle } from "@/lib/formatChapter";
import { formatChapterAccessibilityLabel } from "@/lib/mobileReaderFormat";
import type { MobileReaderBarActionId } from "@/lib/mobileReaderBarActions";

/**
 * The reader's ⋯ menu (phone chrome, top trailing circle). Every entry is an
 * action the reader already performs elsewhere — the scrubber's chapter
 * buttons, the error state's retry, the settings sheet's "Mark complete" and
 * "Plugins" rows — gathered where a thumb resting on the top row finds them —
 * headed by whichever bar actions the capsule had no room for.
 *
 * Deliberately absent: "open in browser" (chapters carry no URL and the
 * reader never loads the title's).
 */
export type MobileReaderMoreMenuActionId =
  | "previous-chapter"
  | "next-chapter"
  | "reload-chapter"
  | "mark-complete"
  | "reader-settings"
  | "reader-plugins"
  | MobileReaderOverflowActionId;

/** The gear never overflows. */
export type MobileReaderOverflowActionId = Exclude<MobileReaderBarActionId, "settings">;

/** Android leading icon (Material Symbols); iOS uses `systemImage`. */
export type MobileReaderMoreMenuIcon =
  | "skipPrevious"
  | "skipNext"
  | "refresh"
  | "checkCircle"
  | "settings"
  | "extension"
  | "detectText"
  | "nemuChat"
  | "dualRead"
  | "bilingualLayout"
  | "chapterList";

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
  /** A state the bar button shows lit: the row carries a checkmark. Absent on plain actions. */
  checked?: boolean;
};

export type MobileReaderMoreMenuSection = {
  id: "actions" | "chapters" | "chapter" | "reader";
  items: MobileReaderMoreMenuItem[];
};

export type MobileReaderMoreMenuInput = {
  strings: MobileStrings;
  /** Previous / next chapter in reading order (not screen side). */
  previousChapter: ChapterSummary | null;
  nextChapter: ChapterSummary | null;
  /** The chapter list is in: a missing neighbour is really absent (default true). */
  chaptersKnown?: boolean;
  pagesStatus: "idle" | "loading" | "ready" | "error" | "blocked";
  pageCount: number;
  completed: boolean;
  saving: boolean;
  /** Same condition as the settings sheet's Plugins row. */
  showPlugins: boolean;
  /** Bar actions the capsule has no room for (`buildMobileReaderOverflowItems`). */
  overflowItems?: MobileReaderMoreMenuItem[];
};

export type MobileReaderOverflowState = {
  /** The states the bar buttons light up for. */
  detectTextActive: boolean;
  nemuChatActive: boolean;
  dualReadEnabled: boolean;
  dualReadAvailable: boolean;
  /** The bilingual toggle's current layout, named as its value. */
  bilingualLayoutValue: string;
};

/** Overflowed bar actions as menu rows: the bar button's title and state, the menu's icon style. */
export function buildMobileReaderOverflowItems(
  overflow: readonly MobileReaderBarActionId[],
  state: MobileReaderOverflowState,
  strings: MobileStrings,
): MobileReaderMoreMenuItem[] {
  const plain = (title: string) => ({ title, disabled: false, accessibilityLabel: title });
  return overflow.flatMap((id): MobileReaderMoreMenuItem[] => {
    switch (id) {
      case "settings":
        return [];
      case "detect-text":
        return [{
          id,
          ...plain(strings.reader.pluginJapaneseLearningDetectText),
          systemImage: "text.viewfinder",
          icon: "detectText",
          checked: state.detectTextActive,
        }];
      case "nemu-chat":
        return [{
          id,
          ...plain(strings.reader.pluginJapaneseLearningNemuChat),
          systemImage: "bubble.left.and.text.bubble.right",
          icon: "nemuChat",
          checked: state.nemuChatActive,
        }];
      case "bilingual-layout":
        return [{
          id,
          title: strings.duo.bilingualLayoutLabel,
          subtitle: state.bilingualLayoutValue,
          systemImage: "rectangle.split.2x1",
          icon: "bilingualLayout",
          disabled: false,
          accessibilityLabel: `${strings.duo.bilingualLayoutLabel}, ${state.bilingualLayoutValue}`,
        }];
      case "chapter-list":
        return [{
          id,
          ...plain(strings.reader.chapterList),
          systemImage: "list.bullet",
          icon: "chapterList",
        }];
      default:
        // The capsule's plugin slot: every plugin but Japanese Learning is Dual Read.
        return [{
          id,
          ...plain(strings.reader.pluginDualReadName),
          systemImage: "square.on.square",
          icon: "dualRead",
          disabled: !state.dualReadAvailable,
          checked: state.dualReadEnabled,
        }];
    }
  });
}

/**
 * What a previous / next chapter control says. Until the chapter list is in
 * (`chaptersKnown` false: the pages are still loading, or the list is
 * fetched after them) it is neutral — "Previous chapter" — never "No
 * previous chapter", which is only true once the list says so.
 */
export function mobileReaderChapterNeighbourLabel(
  direction: "previous" | "next",
  chapter: ChapterSummary | null,
  chaptersKnown: boolean,
  strings: MobileStrings,
): string {
  const previous = direction === "previous";
  if (chapter) return formatChapterAccessibilityLabel(direction, chapter, strings);
  if (!chaptersKnown) return previous ? strings.reader.previousChapter : strings.reader.nextChapter;
  return previous ? strings.reader.noPreviousChapter : strings.reader.noNextChapter;
}

function chapterItem(
  direction: "previous" | "next",
  chapter: ChapterSummary | null,
  chaptersKnown: boolean,
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
    accessibilityLabel: mobileReaderChapterNeighbourLabel(direction, chapter, chaptersKnown, strings),
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
    ...(input.overflowItems?.length ? [{ id: "actions" as const, items: input.overflowItems }] : []),
    {
      id: "chapters",
      items: [
        chapterItem("previous", input.previousChapter, input.chaptersKnown ?? true, strings),
        chapterItem("next", input.nextChapter, input.chaptersKnown ?? true, strings),
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
