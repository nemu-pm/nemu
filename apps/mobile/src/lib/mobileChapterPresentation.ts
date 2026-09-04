import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
import type { NemuTokens } from "@/design-system";
// eslint-disable-next-line no-restricted-imports -- pure color helper; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { nemuColorWithAlpha } from "@/design/colorAlpha";

export const MOBILE_NEW_CHAPTER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type MobileChapterPresentation = {
  isRead: boolean;
  isInProgress: boolean;
  isLocked: boolean;
  isNew: boolean;
};

export type MobileChapterVisualState =
  | "default"
  | "locked"
  | "new"
  | "progress"
  | "read";

export function getMobileChapterPresentation(
  chapter: ChapterSummary,
  progress: Pick<LocalChapterProgress, "completed" | "progress"> | null | undefined,
  now: number = Date.now()
): MobileChapterPresentation {
  const isRead = progress?.completed ?? false;
  const isInProgress = !isRead && Boolean(progress && progress.progress > 0);
  const isLocked = Boolean(chapter.locked && !isRead);
  const isNew = Boolean(
    !isRead &&
      chapter.dateUploaded &&
      Number.isFinite(chapter.dateUploaded) &&
      now - chapter.dateUploaded < MOBILE_NEW_CHAPTER_WINDOW_MS
  );

  return {
    isRead,
    isInProgress,
    isLocked,
    isNew,
  };
}

export function getMobileChapterVisualState(
  presentation: MobileChapterPresentation,
): MobileChapterVisualState {
  if (presentation.isLocked) return "locked";
  if (presentation.isRead) return "read";
  if (presentation.isNew) return "new";
  if (presentation.isInProgress) return "progress";
  return "default";
}

export function getMobileChapterRowPalette(
  visualState: MobileChapterVisualState,
  tokens: NemuTokens,
): {
  backgroundColor: string;
  borderColor: string;
  titleColor: string;
} {
  switch (visualState) {
    case "locked":
      return {
        backgroundColor: tokens.sourceGlass,
        borderColor: tokens.border,
        titleColor: tokens.mutedForeground,
      };
    case "read":
      return {
        backgroundColor: tokens.successSoft,
        borderColor: nemuColorWithAlpha(tokens.success, 0.19),
        titleColor: tokens.mutedForeground,
      };
    case "new":
      return {
        backgroundColor: tokens.primarySoft,
        borderColor: tokens.primary,
        titleColor: tokens.foreground,
      };
    case "progress":
      return {
        backgroundColor: tokens.primarySoft,
        borderColor: nemuColorWithAlpha(tokens.primary, 0.19),
        titleColor: tokens.foreground,
      };
    case "default":
      return {
        backgroundColor: tokens.sourceGlass,
        borderColor: tokens.border,
        titleColor: tokens.foreground,
      };
  }
}
