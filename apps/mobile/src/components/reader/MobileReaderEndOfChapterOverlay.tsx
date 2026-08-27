import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  GlassSurface,
  NemuButton,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";

type MobileReaderEndOfChapterOverlayProps = {
  visible: boolean;
  /** Formatted label of the chapter that follows, or null at the newest chapter. */
  nextChapterLabel: string | null;
  strings: MobileStrings;
  bottomInset: number;
  topInset: number;
  onGoToNextChapter: () => void;
  onDismiss: () => void;
};

/**
 * The affordance shown when the reader tries to advance past the final page.
 *
 * It renders above the gallery rather than as an appended list item so the
 * FlatList's index math (paging offsets, RTL reversal, spread frames, restore
 * offsets) stays exactly as it is.
 */
export function MobileReaderEndOfChapterOverlay({
  visible,
  nextChapterLabel,
  strings,
  bottomInset,
  topInset,
  onGoToNextChapter,
  onDismiss,
}: MobileReaderEndOfChapterOverlayProps) {
  const { tokens } = useNemuTheme();
  if (!visible) return null;

  const caughtUp = nextChapterLabel === null;

  return (
    <View
      style={[
        styles.root,
        { paddingTop: topInset + 24, paddingBottom: bottomInset + 24 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.reader.endOfChapterDismiss}
        onPress={onDismiss}
        style={styles.scrim}
      />
      <GlassSurface style={styles.card} contentStyle={styles.cardContent}>
        <View
          style={[
            styles.iconShell,
            { backgroundColor: `${tokens.primary}18` },
          ]}
        >
          <Ionicons
            name={caughtUp ? "checkmark-done-outline" : "arrow-forward-outline"}
            size={22}
            color={tokens.primary}
          />
        </View>
        <Text style={[styles.title, { color: tokens.foreground }]}>
          {caughtUp
            ? strings.reader.endOfChapterCaughtUpTitle
            : strings.reader.endOfChapterTitle}
        </Text>
        <Text
          numberOfLines={3}
          style={[styles.detail, { color: tokens.mutedForeground }]}
        >
          {caughtUp
            ? strings.reader.endOfChapterCaughtUpDetail
            : formatMobileString(strings.reader.endOfChapterNextLabel, {
                chapter: nextChapterLabel,
              })}
        </Text>
        <View style={styles.actions}>
          {caughtUp ? null : (
            <NemuButton
              accessibilityLabel={strings.reader.endOfChapterNextAction}
              containerStyle={styles.action}
              hapticFeedback="press"
              label={strings.reader.nextChapter}
              onPress={onGoToNextChapter}
              variant="default"
            />
          )}
          <NemuButton
            accessibilityLabel={strings.reader.endOfChapterKeepReading}
            containerStyle={styles.action}
            hapticFeedback="none"
            label={strings.reader.endOfChapterKeepReading}
            onPress={onDismiss}
            variant="secondary"
          />
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: radius.xl,
  },
  cardContent: {
    alignItems: "center",
    gap: 10,
    padding: 22,
  },
  iconShell: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  detail: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  actions: {
    alignSelf: "stretch",
    gap: 8,
    marginTop: 6,
  },
  action: {
    alignSelf: "stretch",
  },
});
