import { WindowLayoutObserver } from "../../../modules/nemu-window-layout";
import { mobileWindowReaderLayout, mobileWindowPopoverFrame, type MobileWindowLayout, type WindowLayoutRect } from "@/lib/mobileWindowLayout";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileReaderWidthSlider } from "@/components/MobileReaderWidthSlider";
import type { ReadingMode } from "@/data/schema";
import {
  MobileSheetBackdrop,
  NemuButton,
  NemuPressable,
  NemuNativeSheetHeaderAction,
  NemuNativeSwitch,
  NemuText,
  NEMU_PROMINENT_CTA_SIZE,
  iconSize,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/mobileModalOrientations";
import {
  READER_CHROME_PANEL_CORNER_RADIUS,
  READER_CHROME_PANEL_HORIZONTAL_INSET,
  READER_CHROME_PANEL_MAX_WIDTH,
  readerChromeSettingsPopoverBottomOffset,
} from "@/lib/mobileReaderHeader";
import { ReaderReadingModePicker } from "./ReaderReadingModePicker";
import { ReaderSegmentedChipRow } from "./ReaderSegmentedChipRow";
import { notebookPaneLabel } from "./readerNotebookPaneOptions";
import {
  READER_FIT_MODE_ORDER,
  READER_SPREAD_MODE_ORDER,
  readerFitModeLabel,
  readerSpreadModeLabel,
  readerSpreadPairingLabel,
} from "./readerPageOptions";
import type { ReaderFitMode } from "@/lib/mobileReaderFit";
import type { ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import type { ReaderWindowShape } from "@/lib/mobileReaderWindowShape";
import {
  MOBILE_READER_NOTEBOOK_PANE_PREFERENCES,
  type MobileReaderNotebookPanePreference,
} from "@/lib/mobileReaderNotebookPane";

import {
  MOBILE_READER_SPREAD_PAIRINGS,
  type MobileReaderSpreadPairing,
} from "@/lib/mobileReaderPairing";

type ReaderDisplaySettingsPopoverProps = {
  visible: boolean;
  mode: ReadingMode;
  activeScrollWidthPct: number;
  isTwoPageMode: boolean;
  /** Paged reading: the page layout and page fit choices apply (not scroll / long strip). */
  twoPageSupported: boolean;
  spreadMode: ReaderSpreadMode;
  onSetSpreadMode: (mode: ReaderSpreadMode) => void;
  fitMode: ReaderFitMode;
  windowShape: ReaderWindowShape;
  onSetFitMode: (mode: ReaderFitMode) => void;
  showCameraMode?: boolean;
  avoidCamera?: boolean;
  onSetAvoidCamera?: (enabled: boolean) => void;
  showPagePairingControls: boolean;
  spreadPairing: MobileReaderSpreadPairing;
  pairingShifted: boolean;
  processPageImages: boolean;
  busy: boolean;
  saving: boolean;
  completed: boolean;
  strings: MobileStrings;
  onClose: () => void;
  onDismissComplete?: () => void;
  onSetMode: (mode: ReadingMode) => void;
  onSetSpreadPairing: (value: MobileReaderSpreadPairing) => void;
  onShiftPairing: () => void;
  onToggleProcessPageImages: () => void;
  onPreviewScrollWidth: (value: number) => void;
  onCommitScrollWidth: (value: number) => void;
  onScrollWidthInteractionStart?: () => void;
  onScrollWidthInteractionEnd?: () => void;
  keepAwake: boolean;
  onToggleKeepAwake: () => void;
  /** Orientation Lock row: only where the reader can rotate (Duo inner display, iPad, Android). */
  showOrientationLock?: boolean;
  lockPortrait: boolean;
  onToggleLockPortrait: () => void;
  /** Foldables: what the bottom half holds in the notebook posture. */
  showNotebookPane?: boolean;
  notebookPane?: MobileReaderNotebookPanePreference;
  thumbnailSpoilerSafe?: boolean;
  onToggleThumbnailSpoilerSafe?: () => void;
  onSetNotebookPane?: (value: MobileReaderNotebookPanePreference) => void;
  onMarkComplete: () => void;
  /**
   * Shows the "Plugins" row that hands off to the reader plugin settings
   * sheet (web parity: the reader settings popover hosts plugin settings).
   */
  showReaderPluginSettings?: boolean;
  onOpenReaderPluginSettings?: () => void;
  /**
   * Region (reader/window coordinates) the popover must stay inside, from the
   * reader pose layout: beside the vertical rail, inside a fold pane, or in
   * the notebook console. Omitted = the classic bottom-anchored placement.
   */
  anchor?: { frame: WindowLayoutRect; bottomGap: number } | null;
};

function readerModeLabel(mode: ReadingMode, strings: MobileStrings): string {
  if (mode === "rtl") return strings.reader.rtl;
  if (mode === "ltr") return strings.reader.ltr;
  return strings.reader.scroll;
}

/**
 * One popover row: a 20pt leading glyph, a 14/500 label (with an optional
 * secondary line) and a trailing control. Blocks whose control needs the full
 * width pass `below` instead of `control`. Rows are separated by spacing
 * alone — no hairlines.
 */
function ReaderSettingRow({
  below,
  control,
  description,
  icon,
  title,
}: {
  below?: ReactNode;
  control?: ReactNode;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.settingBlock}>
      <View style={styles.settingRow}>
        <View style={styles.settingLabel}>
          <Ionicons
            name={icon}
            size={iconSize.md}
            color={tokens.mutedForeground}
          />
          <View style={styles.settingCopy}>
            <NemuText
              color={tokens.foreground}
              numberOfLines={1}
              style={styles.settingTitle}
            >
              {title}
            </NemuText>
            {description ? (
              <NemuText
                color={tokens.mutedForeground}
                style={styles.settingDescription}
              >
                {description}
              </NemuText>
            ) : null}
          </View>
        </View>
        {control}
      </View>
      {below}
    </View>
  );
}

export function ReaderDisplaySettingsPopover({
  visible,
  mode,
  activeScrollWidthPct,
  twoPageSupported,
  spreadMode,
  onSetSpreadMode,
  fitMode,
  onSetFitMode,
  showCameraMode = false,
  avoidCamera = true,
  onSetAvoidCamera,
  showPagePairingControls,
  spreadPairing,
  pairingShifted,
  processPageImages,
  busy,
  saving,
  completed,
  strings,
  onClose,
  onDismissComplete,
  onSetMode,
  onSetSpreadPairing,
  onShiftPairing,
  onToggleProcessPageImages,
  onPreviewScrollWidth,
  onCommitScrollWidth,
  onScrollWidthInteractionStart,
  onScrollWidthInteractionEnd,
  keepAwake,
  onToggleKeepAwake,
  showOrientationLock = true,
  lockPortrait,
  onToggleLockPortrait,
  showNotebookPane = false,
  notebookPane = "filmstrip",
  thumbnailSpoilerSafe = false,
  onToggleThumbnailSpoilerSafe,
  onSetNotebookPane,
  onMarkComplete,
  showReaderPluginSettings = false,
  onOpenReaderPluginSettings,
  anchor = null,
}: ReaderDisplaySettingsPopoverProps) {
  const { tokens, scheme } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [modalLayout, setModalLayout] = useState<MobileWindowLayout | null>(null);
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

  const bottomOffset = readerChromeSettingsPopoverBottomOffset(insets.bottom);
  const modalGeometry = modalLayout ? mobileWindowReaderLayout(modalLayout, {
    twoPage: false, paged: true, rtl: mode === "rtl",
  }) : null;
  const reservedPanel = anchor
    ? mobileWindowPopoverFrame(modalLayout ?? window, anchor.frame, anchor.bottomGap)
    : modalLayout && modalGeometry?.constrained
      ? mobileWindowPopoverFrame(modalLayout, modalGeometry.controls, bottomOffset)
      : null;
  const maxPanelHeight = reservedPanel?.maxHeight ?? Math.max(
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
      supportedOrientations={MOBILE_MODAL_SUPPORTED_ORIENTATIONS}
      transparent
      visible={visible}
    >
      <WindowLayoutObserver style={StyleSheet.absoluteFill} enabled={visible} onLayoutChange={setModalLayout} />
      <MobileSheetBackdrop
        accessibilityLabel={strings.reader.closeSettings}
        backgroundColor="rgba(0,0,0,0.18)"
        onPress={onClose}
      />
      <View
        pointerEvents="box-none"
        style={[
          styles.readerSettingsPopoverFrame,
          {
            bottom: reservedPanel?.bottom ?? bottomOffset,
            // Clear the landscape Dynamic Island like the reader chrome does.
            left: reservedPanel?.left ?? Math.max(READER_CHROME_PANEL_HORIZONTAL_INSET, insets.left),
            right: reservedPanel?.right ?? Math.max(READER_CHROME_PANEL_HORIZONTAL_INSET, insets.right),
          },
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
              <NemuText
                color={tokens.foreground}
                style={styles.readerSettingsPopoverTitle}
              >
                {strings.reader.title}
              </NemuText>
              <NemuText
                color={tokens.mutedForeground}
                style={styles.readerSettingsPopoverDescription}
              >
                {strings.reader.description}
              </NemuText>
            </View>
            <NemuNativeSheetHeaderAction
              accessibilityLabel={strings.reader.closeSettings}
              androidIcon="close-outline"
              iosSystemImage="xmark"
              onPress={onClose}
            />
          </View>

          <ReaderSettingRow
            icon="swap-horizontal-outline"
            title={strings.reader.readingDirection}
            below={
              <View style={styles.settingControlBlock}>
                <ReaderReadingModePicker
                  accessibilityLabel={strings.reader.readingDirection}
                  disabled={busy}
                  labelForMode={(option) => readerModeLabel(option, strings)}
                  mode={mode}
                  onSetMode={onSetMode}
                />
              </View>
            }
          />

          {twoPageSupported ? (
            <>
              <ReaderSettingRow
                icon="book-outline"
                title={strings.reader.pageLayout}
                description={strings.reader.pageLayoutFootnote}
                below={
                  <View style={styles.settingControlBlock}>
                    <ReaderSegmentedChipRow<ReaderSpreadMode>
                      accessibilityLabel={strings.reader.pageLayout}
                      disabled={busy}
                      onChange={(next) => {
                        if (next === spreadMode) return;
                        onSetSpreadMode(next);
                      }}
                      options={READER_SPREAD_MODE_ORDER.map((option) => ({
                        value: option,
                        label: readerSpreadModeLabel(option, strings),
                      }))}
                      value={spreadMode}
                    />
                  </View>
                }
              />
              {showPagePairingControls ? (
                <ReaderSettingRow
                  icon="albums-outline"
                  title={strings.reader.spreadPairing}
                  description={strings.reader.spreadPairingFootnote}
                  below={
                    <View style={styles.settingControlBlock}>
                      <ReaderSegmentedChipRow<MobileReaderSpreadPairing>
                        accessibilityLabel={strings.reader.spreadPairing}
                        disabled={busy}
                        onChange={(next) => {
                          if (next === spreadPairing) return;
                          onSetSpreadPairing(next);
                        }}
                        options={MOBILE_READER_SPREAD_PAIRINGS.map((option) => ({
                          value: option,
                          label: readerSpreadPairingLabel(option, strings),
                        }))}
                        value={spreadPairing}
                      />
                      <NemuButton
                        accessibilityLabel={strings.reader.shiftByOnePage}
                        accessibilityState={{ selected: pairingShifted }}
                        disabled={busy}
                        label={strings.reader.shiftByOnePage}
                        onPress={onShiftPairing}
                        size="sm"
                        variant="secondary"
                      />
                    </View>
                  }
                />
              ) : null}
              <ReaderSettingRow
                icon="scan-outline"
                title={strings.reader.pageFit}
                description={strings.reader.pageFitFootnote}
                below={
                  <View style={styles.settingControlBlock}>
                    <ReaderSegmentedChipRow<ReaderFitMode>
                      accessibilityLabel={strings.reader.pageFit}
                      disabled={busy}
                      onChange={(next) => {
                        if (next === fitMode) return;
                        onSetFitMode(next);
                      }}
                      options={READER_FIT_MODE_ORDER.map((option) => ({
                        value: option,
                        label: readerFitModeLabel(option, strings),
                      }))}
                      value={fitMode}
                    />
                  </View>
                }
              />
            </>
          ) : null}

          {showCameraMode && onSetAvoidCamera ? (
            <ReaderSettingRow
              icon="phone-portrait-outline"
              title={strings.reader.avoidCamera}
              description={strings.reader.avoidCameraFootnote}
              control={
                <NemuNativeSwitch
                  accessibilityLabel={strings.reader.avoidCamera}
                  disabled={busy}
                  value={avoidCamera}
                  onValueChange={(value) => onSetAvoidCamera(value)}
                />
              }
            />
          ) : null}

          <ReaderSettingRow
            icon="color-wand-outline"
            title={strings.reader.processPageImages}
            control={
              <NemuNativeSwitch
                accessibilityLabel={strings.reader.processPageImages}
                disabled={busy}
                value={processPageImages}
                onValueChange={onToggleProcessPageImages}
              />
            }
          />

          {mode === "scrolling" ? (
            <ReaderSettingRow
              icon="resize-outline"
              title={strings.reader.pageWidth}
              control={
                // Inline like the mock's slider row: label left, track
                // middle, percent right — not a stacked control block.
                <View style={styles.inlineSliderControl}>
                  <View style={styles.inlineSliderTrack}>
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
                  <NemuText
                    color={tokens.mutedForeground}
                    style={styles.settingValue}
                  >
                    {`${activeScrollWidthPct}%`}
                  </NemuText>
                </View>
              }
            />
          ) : null}

          <ReaderSettingRow
            icon="moon-outline"
            title={strings.feedback.displayKeepAwake}
            control={
              <NemuNativeSwitch
                accessibilityLabel={strings.feedback.displayKeepAwake}
                disabled={busy}
                value={keepAwake}
                onValueChange={onToggleKeepAwake}
              />
            }
          />

          {showOrientationLock ? (
            <ReaderSettingRow
              icon="phone-portrait-outline"
              title={strings.feedback.displayLockPortrait}
              control={
                <NemuNativeSwitch
                  accessibilityLabel={strings.feedback.displayLockPortrait}
                  disabled={busy}
                  value={lockPortrait}
                  onValueChange={onToggleLockPortrait}
                />
              }
            />
          ) : null}

          {showNotebookPane && onSetNotebookPane ? (
            <ReaderSettingRow
              icon="tablet-landscape-outline"
              title={strings.duo.notebookPane}
              description={strings.duo.notebookPaneFootnote}
              below={
                <View style={styles.settingControlBlock}>
                  <ReaderSegmentedChipRow<MobileReaderNotebookPanePreference>
                    accessibilityLabel={strings.duo.notebookPane}
                    disabled={busy}
                    onChange={(next) => {
                      if (next === notebookPane) return;
                      onSetNotebookPane(next);
                    }}
                    options={MOBILE_READER_NOTEBOOK_PANE_PREFERENCES.map((option) => ({
                      value: option,
                      label: notebookPaneLabel(option, strings),
                    }))}
                    value={notebookPane}
                  />
                </View>
              }
            />
          ) : null}

          {showNotebookPane && onToggleThumbnailSpoilerSafe ? (
            <ReaderSettingRow
              icon="eye-off-outline"
              title={strings.duo.filmstripSpoilerSafe}
              description={strings.duo.filmstripSpoilerSafeDescription}
              control={<NemuNativeSwitch
                accessibilityLabel={strings.duo.filmstripSpoilerSafe}
                disabled={busy}
                value={thumbnailSpoilerSafe}
                onValueChange={onToggleThumbnailSpoilerSafe}
              />}
            />
          ) : null}

          {showReaderPluginSettings && onOpenReaderPluginSettings ? (
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={strings.settings.plugins}
              accessibilityHint={strings.settings.pluginsDescription}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              hapticFeedback="press"
              onPress={onOpenReaderPluginSettings}
              pressedScale={0.985}
              style={{ opacity: busy ? 0.56 : 1 }}
              testID="ReaderDisplaySettingsPluginsRow"
            >
              <ReaderSettingRow
                icon="extension-puzzle-outline"
                title={strings.settings.plugins}
                description={strings.settings.pluginsDescription}
                control={
                  <Ionicons
                    name="chevron-forward"
                    size={iconSize.sm}
                    color={tokens.mutedForeground}
                  />
                }
              />
            </NemuPressable>
          ) : null}

          {!completed ? (
            <NemuButton
              accessibilityLabel={
                saving
                  ? strings.reader.savingProgress
                  : strings.reader.markComplete
              }
              icon="checkmark-circle-outline"
              label={
                saving
                  ? strings.reader.savingProgress
                  : strings.reader.markComplete
              }
              loading={saving}
              // Same geometry as the onboarding / empty-state CTA.
              containerStyle={styles.completeButtonContainer}
              onPress={onMarkComplete}
              size={NEMU_PROMINENT_CTA_SIZE}
              variant="default"
            />
          ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  readerSettingsPopoverFrame: {
    position: "absolute",
    right: READER_CHROME_PANEL_HORIZONTAL_INSET,
    left: READER_CHROME_PANEL_HORIZONTAL_INSET,
    alignItems: "center",
  },
  readerSettingsPopoverShell: {
    width: "100%",
    maxWidth: READER_CHROME_PANEL_MAX_WIDTH,
    borderRadius: READER_CHROME_PANEL_CORNER_RADIUS,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  readerSettingsPopoverScroll: {
    flexGrow: 0,
  },
  readerSettingsPopover: {
    padding: 14,
  },
  readerSettingsPopoverHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  readerSettingsPopoverTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  readerSettingsPopoverTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  readerSettingsPopoverDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  settingBlock: {
    // Tight label→control coupling; the block's own bottom padding (plus the
    // next block's top padding) sets the inter-block rhythm so a stacked
    // control like the reading-mode picker doesn't crowd the row under it.
    gap: 6,
    paddingTop: 6,
    paddingBottom: 8,
  },
  settingRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  settingLabel: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  settingCopy: {
    flexShrink: 1,
    minWidth: 0,
  },
  settingTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  settingDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  settingValue: {
    minWidth: 40,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  settingControlBlock: {
    width: "100%",
  },
  inlineSliderControl: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inlineSliderTrack: {
    flex: 1,
    minWidth: 120,
  },
  completeButtonContainer: {
    width: "100%",
    marginTop: 14,
  },
});
