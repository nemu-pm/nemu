import { StyleSheet, Text, View } from "react-native";
import { MobileChapterProgressAccessory } from "@/components/MobileChapterProgressAccessory";
import {
  NemuPressable,
  createNemuShadowStyle,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
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

type MobileChapterCellProps = {
  busy: boolean;
  chapter: ChapterSummary;
  openChapterTemplate: string;
  progress: LocalChapterProgress | undefined;
  strings: MobileStrings;
  onPress: () => void;
};

export function MobileChapterCell({
  busy,
  chapter,
  openChapterTemplate,
  progress,
  strings,
  onPress,
}: MobileChapterCellProps) {
  const { tokens } = useNemuTheme();
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
      onPress={onPress}
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
        <Text numberOfLines={1} style={[styles.title, { color: cellPalette.titleColor }]}>
          {formatChapterTitle(chapter, strings)}
        </Text>
        {formatChapterSubtitle(chapter) ? (
          <Text
            numberOfLines={1}
            style={[styles.subtitle, { color: tokens.mutedForeground }]}
          >
            {formatChapterSubtitle(chapter)}
          </Text>
        ) : null}
      </View>
      <MobileChapterProgressAccessory
        progress={progress}
        locked={chapterPresentation.isLocked}
        showChevron={false}
      />
    </NemuPressable>
  );
}

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
