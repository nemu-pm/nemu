import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  ZoomIn,
  useReducedMotion,
} from "react-native-reanimated";
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
  busy?: boolean;
  error?: string | null;
  /**
   * End-of-chapter celebration: a bare success check with a spring scale-in.
   * Owned by the 章节完成提示 settings toggle (default off).
   */
  celebration?: boolean;
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
  busy = false,
  error = null,
  celebration = false,
  onGoToNextChapter,
  onDismiss,
}: MobileReaderEndOfChapterOverlayProps) {
  const { tokens } = useNemuTheme();
  const reducedMotion = useReducedMotion();
  const modalHeadingRef = useRef<View | null>(null);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      const tag = findNodeHandle(modalHeadingRef.current);
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  if (!visible) return null;

  const caughtUp = nextChapterLabel === null;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={[
        styles.root,
        { paddingTop: topInset + 24, paddingBottom: bottomInset + 24 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.reader.endOfChapterDismiss}
        disabled={busy}
        onPress={onDismiss}
        style={styles.scrim}
      />
      <ScrollView
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={styles.cardScrollContent}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator
        style={styles.cardScroll}
      >
        <GlassSurface style={styles.card} contentStyle={styles.cardContent}>
          <View
            ref={modalHeadingRef}
            accessible
            accessibilityRole="header"
            importantForAccessibility="yes"
            style={styles.heading}
          >
            {celebration ? (
              <Animated.View
                entering={
                  reducedMotion
                    ? undefined
                    : ZoomIn.springify().damping(15).stiffness(210)
                }
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.celebrationCheck}
              >
                <Ionicons
                  name={caughtUp ? "checkmark-done" : "checkmark"}
                  size={28}
                  color={tokens.success}
                />
              </Animated.View>
            ) : (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.iconShell,
                  { backgroundColor: `${tokens.primary}18` },
                ]}
              >
                <Ionicons
                  name={
                    caughtUp
                      ? "checkmark-done-outline"
                      : "arrow-forward-outline"
                  }
                  size={22}
                  color={tokens.primary}
                />
              </View>
            )}
            <Text style={[styles.title, { color: tokens.foreground }]}>
              {caughtUp
                ? strings.reader.endOfChapterCaughtUpTitle
                : strings.reader.endOfChapterTitle}
            </Text>
            <Text style={[styles.detail, { color: tokens.mutedForeground }]}>
              {caughtUp
                ? strings.reader.endOfChapterCaughtUpDetail
                : formatMobileString(strings.reader.endOfChapterNextLabel, {
                    chapter: nextChapterLabel,
                  })}
            </Text>
          </View>
          {error ? (
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={[styles.error, { color: tokens.danger }]}
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {caughtUp && !error ? null : (
              <NemuButton
                accessibilityLabel={
                  caughtUp
                    ? strings.common.retry
                    : strings.reader.endOfChapterNextAction
                }
                containerStyle={styles.action}
                disabled={busy}
                hapticFeedback="press"
                label={
                  caughtUp ? strings.common.retry : strings.reader.nextChapter
                }
                loading={busy}
                onPress={onGoToNextChapter}
                variant="default"
              />
            )}
            <NemuButton
              accessibilityLabel={strings.reader.endOfChapterKeepReading}
              containerStyle={styles.action}
              disabled={busy}
              hapticFeedback="none"
              label={strings.reader.endOfChapterKeepReading}
              onPress={onDismiss}
              variant="secondary"
            />
          </View>
        </GlassSurface>
      </ScrollView>
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
    // Reader chrome uses z/elevation 20. This modal must remain the final
    // touch and focus surface on both platform compositors.
    zIndex: 100,
    elevation: 100,
  },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  cardScroll: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "100%",
    flexShrink: 1,
  },
  cardScrollContent: {
    flexGrow: 0,
  },
  card: {
    width: "100%",
    borderRadius: radius.xl,
  },
  cardContent: {
    // GlassSurface's default flex: 1 content needs an explicit intrinsic-size
    // override when its shell has no fixed height. Without this, Android Yoga
    // can collapse the modal card to a thin bar and clip every text/action.
    flex: 0,
    alignItems: "center",
    gap: 10,
    padding: 22,
  },
  heading: {
    alignItems: "center",
    gap: 10,
  },
  iconShell: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  celebrationCheck: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
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
  error: {
    alignSelf: "stretch",
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
