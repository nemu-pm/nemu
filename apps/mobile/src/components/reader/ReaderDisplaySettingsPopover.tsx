import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileReaderWidthSlider } from "@/components/MobileReaderWidthSlider";
import type { ReadingMode } from "@/data/schema";
import {
  MobileSheetBackdrop,
  NemuPressable,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";

type ReaderPagePairingMode = "book" | "manga";

type ReaderDisplaySettingsPopoverProps = {
  visible: boolean;
  mode: ReadingMode;
  activeScrollWidthPct: number;
  isTwoPageMode: boolean;
  twoPageSupported: boolean;
  showPagePairingControls: boolean;
  pagePairingMode: ReaderPagePairingMode;
  processPageImages: boolean;
  busy: boolean;
  saving: boolean;
  hasReaderPlugins: boolean;
  canOpenReaderPluginSettings: boolean;
  strings: MobileStrings;
  onClose: () => void;
  onDismissComplete?: () => void;
  onSetMode: (mode: ReadingMode) => void;
  onToggleTwoPageMode: () => void;
  onTogglePagePairingMode: () => void;
  onToggleProcessPageImages: () => void;
  onPreviewScrollWidth: (value: number) => void;
  onCommitScrollWidth: (value: number) => void;
  onScrollWidthInteractionStart?: () => void;
  onScrollWidthInteractionEnd?: () => void;
  onOpenReaderPluginSettings: () => void;
  onMarkComplete: () => void;
};

function readerModeLabel(mode: ReadingMode, strings: MobileStrings): string {
  if (mode === "rtl") return strings.reader.rtl;
  if (mode === "ltr") return strings.reader.ltr;
  return strings.reader.scroll;
}

export function ReaderDisplaySettingsPopover({
  visible,
  mode,
  activeScrollWidthPct,
  isTwoPageMode,
  twoPageSupported,
  showPagePairingControls,
  pagePairingMode,
  processPageImages,
  busy,
  saving,
  hasReaderPlugins,
  canOpenReaderPluginSettings,
  strings,
  onClose,
  onDismissComplete,
  onSetMode,
  onToggleTwoPageMode,
  onTogglePagePairingMode,
  onToggleProcessPageImages,
  onPreviewScrollWidth,
  onCommitScrollWidth,
  onScrollWidthInteractionStart,
  onScrollWidthInteractionEnd,
  onOpenReaderPluginSettings,
  onMarkComplete,
}: ReaderDisplaySettingsPopoverProps) {
  const { tokens, scheme } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const previousVisibleRef = useRef(visible);
  const dismissPendingRef = useRef(false);
  const onDismissCompleteRef = useRef(onDismissComplete);

  useLayoutEffect(() => {
    onDismissCompleteRef.current = onDismissComplete;
  }, [onDismissComplete]);

  useLayoutEffect(() => {
    const wasVisible = previousVisibleRef.current;
    previousVisibleRef.current = visible;
    if (wasVisible && !visible) dismissPendingRef.current = true;
    if (visible) dismissPendingRef.current = false;
  }, [visible]);

  const notifyDismissComplete = useCallback(() => {
    if (!dismissPendingRef.current) return;
    dismissPendingRef.current = false;
    onDismissCompleteRef.current?.();
  }, []);

  // React Native's iOS Modal reports the end of its native dismissal through
  // onDismiss. Android removes its Dialog synchronously when `visible` becomes
  // false, so the first passive effect after that committed unmount is the
  // equivalent completion boundary.
  useEffect(() => {
    if (Platform.OS === "android" && !visible) notifyDismissComplete();
  }, [notifyDismissComplete, visible]);

  const modeOptions: ReadingMode[] = ["rtl", "ltr", "scrolling"];
  const bottomOffset = insets.bottom + 86;
  const maxPanelHeight = Math.max(
    140,
    window.height - bottomOffset - Math.max(insets.top, 8) - 12,
  );
  const panelColors =
    scheme === "dark"
      ? {
          panel: "rgb(36,36,36)",
          border: "rgba(255,255,255,0.12)",
        }
      : {
          panel: "rgb(250,250,250)",
          border: "rgba(0,0,0,0.12)",
        };

  return (
    <Modal
      animationType="fade"
      onDismiss={Platform.OS === "ios" ? notifyDismissComplete : undefined}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <MobileSheetBackdrop
        accessibilityLabel={strings.reader.closeSettings}
        backgroundColor="rgba(0,0,0,0.18)"
        onPress={onClose}
      />
      <View
        pointerEvents="box-none"
        style={[
          styles.readerSettingsPopoverFrame,
          { bottom: bottomOffset },
        ]}
      >
        <View
          style={[
            styles.readerSettingsPopoverShell,
            {
              backgroundColor: panelColors.panel,
              borderColor: panelColors.border,
              maxHeight: maxPanelHeight,
            },
          ]}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.readerSettingsPopover}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.readerSettingsPopoverScroll}
          >
          <View style={styles.readerSettingsPopoverHeader}>
            <View style={styles.readerSettingsPopoverTitleBlock}>
              <Text
                style={[
                  styles.readerSettingsPopoverTitle,
                  { color: tokens.foreground },
                ]}
              >
                {strings.reader.title}
              </Text>
              <Text
                style={[
                  styles.readerSettingsPopoverDescription,
                  { color: tokens.mutedForeground },
                ]}
              >
                {strings.reader.description}
              </Text>
            </View>
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={strings.reader.closeSettings}
              onPress={onClose}
              style={[
                styles.readerSettingsPopoverClose,
                { backgroundColor: tokens.muted },
              ]}
            >
              <Ionicons
                name="close-outline"
                size={18}
                color={tokens.mutedForeground}
              />
            </NemuPressable>
          </View>

          <View
            style={[
              styles.readerSettingsTabs,
              { backgroundColor: tokens.muted },
            ]}
          >
            {modeOptions.map((option) => {
              const selected = option === mode;
              return (
                <NemuPressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={readerModeLabel(option, strings)}
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  hapticFeedback={selected ? "none" : "selection"}
                  onPress={() => onSetMode(option)}
                  pressedScale={0.985}
                  containerStyle={styles.readerSettingsTabContainer}
                  style={[
                    styles.readerSettingsTab,
                    {
                      backgroundColor: selected ? tokens.card : "transparent",
                      opacity: busy ? 0.56 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.readerSettingsTabText,
                      {
                        color: selected
                          ? tokens.foreground
                          : tokens.mutedForeground,
                      },
                    ]}
                  >
                    {readerModeLabel(option, strings)}
                  </Text>
                </NemuPressable>
              );
            })}
          </View>

          {twoPageSupported ? (
            <View style={[styles.readerSettingRow, { borderColor: tokens.border }]}>
              <View style={styles.readerSettingCopy}>
                <Text
                  style={[styles.readerSettingTitle, { color: tokens.foreground }]}
                >
                  {strings.reader.twoPageView}
                </Text>
                <Text
                  style={[
                    styles.readerSettingDescription,
                    { color: tokens.mutedForeground },
                  ]}
                >
                  {strings.reader.spread}
                </Text>
              </View>
              <Switch
                accessibilityLabel={strings.reader.twoPageView}
                accessibilityRole="switch"
                accessibilityState={{
                  checked: isTwoPageMode,
                  disabled: busy,
                }}
                disabled={busy}
                ios_backgroundColor={tokens.muted}
                thumbColor={
                  isTwoPageMode ? tokens.primary : tokens.mutedForeground
                }
                trackColor={{
                  false: tokens.muted,
                  true: `${tokens.primary}66`,
                }}
                value={isTwoPageMode}
                onValueChange={onToggleTwoPageMode}
              />
            </View>
          ) : null}

          {showPagePairingControls ? (
            <View style={styles.pairingTabs}>
              {(["book", "manga"] as const).map((option) => {
                const selected = option === pagePairingMode;
                return (
                  <NemuPressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityLabel={
                      option === "book"
                        ? strings.reader.bookPairing
                        : strings.reader.mangaPairing
                    }
                    accessibilityState={{ selected, disabled: busy }}
                    disabled={busy}
                    hapticFeedback={selected ? "none" : "selection"}
                    onPress={() => {
                      if (!selected) onTogglePagePairingMode();
                    }}
                    containerStyle={styles.pairingButtonContainer}
                    style={[
                      styles.pairingButton,
                      {
                        backgroundColor: selected ? tokens.primary : tokens.muted,
                        opacity: busy ? 0.56 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pairingButtonText,
                        {
                          color: selected
                            ? tokens.primaryForeground
                            : tokens.mutedForeground,
                        },
                      ]}
                    >
                      {option === "book" ? "1-2" : "1,2"}
                    </Text>
                  </NemuPressable>
                );
              })}
            </View>
          ) : null}

          <View style={[styles.readerSettingRow, { borderColor: tokens.border }]}>
            <View style={styles.readerSettingCopy}>
              <Text
                style={[styles.readerSettingTitle, { color: tokens.foreground }]}
              >
                {strings.reader.processPageImages}
              </Text>
              <Text
                style={[
                  styles.readerSettingDescription,
                  { color: tokens.mutedForeground },
                ]}
              >
                {strings.reader.processPageImagesDescription}
              </Text>
            </View>
            <Switch
              accessibilityLabel={strings.reader.processPageImages}
              accessibilityRole="switch"
              accessibilityState={{
                checked: processPageImages,
                disabled: busy,
              }}
              disabled={busy}
              ios_backgroundColor={tokens.muted}
              thumbColor={
                processPageImages ? tokens.primary : tokens.mutedForeground
              }
              trackColor={{
                false: tokens.muted,
                true: `${tokens.primary}66`,
              }}
              value={processPageImages}
              onValueChange={onToggleProcessPageImages}
            />
          </View>

          {mode === "scrolling" ? (
            <View style={styles.widthControlBlock}>
              <View style={styles.widthControlHeader}>
                <Text
                  style={[
                    styles.widthControlLabel,
                    { color: tokens.mutedForeground },
                  ]}
                >
                  {strings.reader.pageWidth}
                </Text>
                <Text
                  style={[
                    styles.widthControlValue,
                    { color: tokens.foreground },
                  ]}
                >
                  {activeScrollWidthPct}%
                </Text>
              </View>
              <MobileReaderWidthSlider
                value={activeScrollWidthPct}
                strings={strings}
                disabled={busy}
                onPreview={onPreviewScrollWidth}
                onCommit={onCommitScrollWidth}
                onInteractionStart={onScrollWidthInteractionStart}
                onInteractionEnd={onScrollWidthInteractionEnd}
              />
            </View>
          ) : null}

          {hasReaderPlugins ? (
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={strings.settings.plugins}
              accessibilityState={{
                disabled: !canOpenReaderPluginSettings,
              }}
              disabled={!canOpenReaderPluginSettings}
              onPress={onOpenReaderPluginSettings}
              pressedScale={0.985}
              style={[
                styles.readerSettingsSecondaryAction,
                {
                  backgroundColor: tokens.muted,
                  opacity: canOpenReaderPluginSettings ? 1 : 0.56,
                },
              ]}
            >
              <Ionicons
                name="extension-puzzle-outline"
                size={17}
                color={tokens.mutedForeground}
              />
              <Text
                style={[
                  styles.readerSettingsSecondaryActionText,
                  { color: tokens.foreground },
                ]}
              >
                {strings.settings.plugins}
              </Text>
            </NemuPressable>
          ) : null}

          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={
              saving ? strings.reader.savingProgress : strings.reader.markComplete
            }
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={onMarkComplete}
            pressedScale={0.985}
            style={[
              styles.completeButton,
              {
                backgroundColor: tokens.primary,
                opacity: saving ? 0.72 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={tokens.primaryForeground} />
            ) : (
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={tokens.primaryForeground}
              />
            )}
            <Text
              style={[
                styles.completeText,
                { color: tokens.primaryForeground },
              ]}
            >
              {saving ? strings.reader.savingProgress : strings.reader.markComplete}
            </Text>
          </NemuPressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  readerSettingsPopoverFrame: {
    position: "absolute",
    right: 16,
    left: 16,
    alignItems: "center",
  },
  readerSettingsPopoverShell: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  readerSettingsPopoverScroll: {
    flexGrow: 0,
  },
  readerSettingsPopover: {
    gap: 12,
    padding: 14,
  },
  readerSettingsPopoverHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  readerSettingsPopoverTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  readerSettingsPopoverTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  readerSettingsPopoverDescription: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
  },
  readerSettingsPopoverClose: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  readerSettingsTabs: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.lg,
    padding: 3,
  },
  readerSettingsTab: {
    width: "100%",
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 8,
  },
  readerSettingsTabContainer: {
    flex: 1,
    minWidth: 0,
  },
  readerSettingsTabText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.semibold,
  },
  readerSettingRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  readerSettingCopy: {
    flex: 1,
    minWidth: 0,
  },
  readerSettingTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  readerSettingDescription: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
  },
  pairingTabs: {
    flex: 2,
    flexDirection: "row",
    gap: 8,
  },
  pairingButton: {
    minHeight: 38,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 8,
  },
  pairingButtonContainer: {
    flex: 1,
    minWidth: 0,
  },
  pairingButtonText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.semibold,
  },
  widthControlBlock: {
    gap: 8,
  },
  widthControlHeader: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  widthControlLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: nemuFontWeight.medium,
  },
  widthControlValue: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.semibold,
  },
  readerSettingsSecondaryAction: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  readerSettingsSecondaryActionText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  completeButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.xl,
  },
  completeText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
});
