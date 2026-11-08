import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { nemuFontWeight } from "@/design-system";
import { formatChapterTitle } from "@/lib/formatChapter";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  MOBILE_READER_STRIP_DIVIDER_HEIGHT,
  MOBILE_READER_STRIP_DIVIDER_MARGIN,
} from "@/lib/mobileReaderChapterStrip";
import type { ChapterSummary } from "@/data/schema";

/** The app's primary colour. */
const READER_STRIP_DIVIDER_ACTION_COLOR = "#5B6CEB";

export type ReaderChapterDividerProps = {
  /**
   * `next`: the chapter below; `end`: nothing follows (caught up);
   * `previous`: the chapter above (the pull-to-load header).
   */
  variant: "next" | "end" | "previous";
  chapter: ChapterSummary | null;
  /** The chapter below's state when it is not in the list yet. */
  status: "ready" | "idle" | "loading" | "failed" | "locked";
  sourceName: string | null;
  strings: MobileStrings;
  /** A failed / locked chapter below: try it again (or open it the old way). */
  onRetry?: () => void;
  /** The reader background is light (White, or a light page border): dark text. */
  lightBackground?: boolean;
};

/**
 * Seamless scroll: the band between two chapters. Two centred lines (the
 * chapter below, then the source), 64pt tall with 24pt above and below, on
 * the reader's background (the Page Background setting). The caught-up variant ends the last chapter.
 */
export const ReaderChapterDivider = memo(function ReaderChapterDivider({
  variant,
  chapter,
  status,
  sourceName,
  strings,
  onRetry,
  lightBackground = false,
}: ReaderChapterDividerProps) {
  const title =
    variant === "end" || !chapter
      ? strings.library.progressCaughtUp
      : formatChapterTitle(chapter, strings);
  const secondLine =
    variant === "end"
      ? null
      : status === "loading"
        ? strings.reader.fetchingPages
        : status === "locked"
          ? strings.reader.lockedChapter
          : status === "failed"
            ? strings.common.retry
            : sourceName;
  const actionable = (status === "failed" || status === "locked") && onRetry != null;
  // Screen readers: "Next chapter, Chapter 141, Shonen Jump+" — existing copy only.
  const accessibilityLabel =
    variant === "end"
      ? title
      : [
          variant === "previous" ? strings.reader.previousChapter : strings.reader.nextChapter,
          title,
          secondLine,
        ]
          .filter(Boolean)
          .join(", ");
  const content = (
    <View style={styles.box}>
      <Text numberOfLines={1} style={[styles.title, lightBackground ? styles.titleOnLight : null]}>
        {title}
      </Text>
      {secondLine ? (
        <Text numberOfLines={1} style={[
            styles.subtitle,
            lightBackground ? styles.subtitleOnLight : null,
            actionable ? styles.subtitleAction : null,
          ]}>
          {secondLine}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View style={styles.cell}>
      {actionable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onRetry}
          hitSlop={MOBILE_READER_STRIP_DIVIDER_MARGIN}
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityRole="header" accessibilityLabel={accessibilityLabel}>
          {content}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  cell: {
    width: "100%",
    paddingVertical: MOBILE_READER_STRIP_DIVIDER_MARGIN,
    // The reader's own background shows through: never a system white.
    backgroundColor: "transparent",
  },
  box: {
    height: MOBILE_READER_STRIP_DIVIDER_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 17,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    textAlign: "center",
  },
  titleOnLight: {
    color: "rgba(0,0,0,0.85)",
  },
  subtitleOnLight: {
    color: "rgba(60,60,67,0.6)",
  },
  // Failed / locked: the second line is the tap target (retry / locked), in
  // the app's primary colour at full opacity so it reads as tappable.
  subtitleAction: {
    color: READER_STRIP_DIVIDER_ACTION_COLOR,
  },
});
