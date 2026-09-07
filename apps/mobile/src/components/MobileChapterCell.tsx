import { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { MobileChapterProgressAccessory } from "@/components/MobileChapterProgressAccessory";
import {
  NemuPressable,
  NemuText,
  createNemuShadowStyle,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import type { AppLanguage, ChapterSummary, LocalChapterProgress } from "@/data/schema";
import { formatChapterSubtitle, formatChapterTitle } from "@/lib/formatChapter";
import {
  getMobileChapterPresentation,
  getMobileChapterRowPalette,
  getMobileChapterVisualState,
} from "@/lib/mobileChapterPresentation";
import {
  formatMobileChapterProgressStatus,
  getMobileChapterProgressAccessory,
} from "@/lib/mobileChapterProgress";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  DEFAULT_APP_LANGUAGE,
  formatMobileLanguageDisplayName,
} from "@/lib/mobileLanguageSettings";

type MobileChapterCellProps = {
  appLanguage?: AppLanguage;
  busy: boolean;
  chapter: ChapterSummary;
  openChapterTemplate: string;
  progress: LocalChapterProgress | undefined;
  strings: MobileStrings;
  /**
   * Takes the chapter so the caller can pass one stable handler for the whole
   * grid instead of allocating a closure per cell (which defeats `memo`).
   */
  onPress: (chapter: ChapterSummary) => void;
  showLanguage?: boolean;
};

export const MobileChapterCell = memo(function MobileChapterCell({
  appLanguage = DEFAULT_APP_LANGUAGE,
  busy,
  chapter,
  openChapterTemplate,
  progress,
  strings,
  onPress,
  showLanguage = false,
}: MobileChapterCellProps) {
  const { tokens } = useNemuTheme();
  const handlePress = useCallback(() => {
    onPress(chapter);
  }, [chapter, onPress]);
  const chapterPresentation = getMobileChapterPresentation(chapter, progress);
  const chapterVisualState = getMobileChapterVisualState(chapterPresentation);
  const cellPalette = getMobileChapterRowPalette(chapterVisualState, tokens);
  const progressLabel = formatMobileChapterProgressStatus(
    getMobileChapterProgressAccessory(progress, {
      locked: chapterPresentation.isLocked,
    }),
    strings,
  );
  const chapterAccessibilityLabel = formatMobileString(openChapterTemplate, {
    chapter: formatChapterTitle(chapter, strings),
  });
  const chapterAccessibilityDetails = [
    chapterAccessibilityLabel,
    chapterPresentation.isNew ? strings.common.new : null,
    progressLabel,
  ]
    .filter(Boolean)
    .join(". ");
  const chapterDisabled = chapterPresentation.isLocked || busy;
  const baseSubtitle = formatChapterSubtitle(chapter);
  const chapterSubtitle = [
    baseSubtitle,
    showLanguage && chapter.lang
      ? formatMobileLanguageDisplayName(chapter.lang, appLanguage, {
          multi: strings.sourceBrowse.multiLanguage,
          other: strings.browse.otherLanguages,
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ") || null;
  const cellShadow = createNemuShadowStyle({
    color: tokens.shadow,
    offsetY: 1,
    radius: 3,
    opacity: chapterVisualState === "locked" ? 0 : 0.06,
    elevation: chapterVisualState === "locked" ? 0 : 1,
  });

  return (
    <NemuPressable
      accessibilityLabel={chapterAccessibilityDetails}
      accessibilityRole="button"
      accessibilityState={{ disabled: chapterDisabled }}
      disabled={chapterDisabled}
      onPress={handlePress}
      pressedScale={0.985}
      style={[
        styles.cell,
        cellShadow,
        {
          backgroundColor: cellPalette.backgroundColor,
          borderColor: cellPalette.borderColor,
          opacity: chapterDisabled ? 0.72 : 1,
        },
      ]}
    >
      <View style={styles.text}>
        <NemuText
          numberOfLines={1}
          style={[styles.title, { color: cellPalette.titleColor }]}
        >
          {formatChapterTitle(chapter, strings)}
        </NemuText>
        {chapterSubtitle ? (
          <NemuText
            numberOfLines={1}
            style={[styles.subtitle, { color: tokens.mutedForeground }]}
          >
            {chapterSubtitle}
          </NemuText>
        ) : null}
      </View>
      <MobileChapterProgressAccessory
        progress={progress}
        locked={chapterPresentation.isLocked}
        showChevron={false}
      />
    </NemuPressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
  },
  subtitle: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
  },
});
