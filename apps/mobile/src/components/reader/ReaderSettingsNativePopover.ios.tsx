import { memo, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  BottomSheet as SwiftBottomSheet,
  Button as SwiftButton,
  Form as SwiftForm,
  Group as SwiftGroup,
  Host as SwiftHost,
  NavigationStack as SwiftNavigationStack,
  Picker as SwiftPicker,
  Popover as SwiftPopover,
  Rectangle as SwiftRectangle,
  Section as SwiftSection,
  Slider as SwiftSlider,
  Text as SwiftText,
  Toggle as SwiftToggle,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  defaultScrollAnchor,
  disabled as swiftDisabled,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
  lineLimit,
  listSectionSpacing,
  opacity,
  pickerStyle,
  presentationBackground,
  presentationBackgroundInteraction,
  presentationDragIndicator,
  scrollEdgeEffectStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  fitPopoverToContent,
  fitSheetDetentToContent,
  inlineToolbarTitle,
  measureSheetPage,
  reportSheetContentHeight,
  zeroTopScrollContentMargin,
  presentationColorScheme,
} from "../../../modules/nemu-window-layout/src/presentationColorScheme";
import { useNemuTheme } from "@/design-system";
import { hapticSelection } from "@/lib/haptics";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import {
  clampReaderScrollWidthPct,
  READER_SCROLL_WIDTH_MAX,
  READER_SCROLL_WIDTH_MIN,
} from "@/lib/mobileReaderSettings";
import {
  fittedSheetMeasureFrame,
  READER_SETTINGS_POPOVER_PAGE,
  READER_SETTINGS_SHEET_GROUP,
  READER_SETTINGS_SHEET_PAGE,
} from "@/lib/mobileFittedSheet";
import {
  readerSettingsNativePresentation,
  readerSettingsNativeSheetEstimatedHeight,
  readerSettingsSheetDetentCap,
} from "@/lib/readerSettingsNativePopoverLayout";
import {
  isMobileReaderNotebookPanePreference,
  MOBILE_READER_NOTEBOOK_PANE_PREFERENCES,
} from "@/lib/mobileReaderNotebookPane";
import { notebookPaneLabel } from "./readerNotebookPaneOptions";
import {
  READER_FIT_MODE_ORDER,
  READER_SPREAD_MODE_ORDER,
  readerFitModeLabel,
  readerSpreadModeLabel,
  readerPageBackgroundLabel,
  readerPageTurnLabel,
  readerSpreadPairingLabel,
} from "./readerPageOptions";
import { MOBILE_READER_PAGE_TURNS, normalizeMobileReaderPageTurn, type MobileReaderPageTurn } from "@/lib/mobileReaderPageCurl";
import { isReaderFitMode } from "@/lib/mobileReaderFit";
import { isReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import { MOBILE_READER_SPREAD_PAIRINGS, type MobileReaderSpreadPairing } from "@/lib/mobileReaderPairing";
import { MOBILE_READER_PAGE_BACKGROUNDS, type MobileReaderPageBackground } from "@/lib/mobileReaderPageBackground";
import { READER_READING_MODE_ORDER, isReaderReadingMode } from "./readerReadingModeOptions";
import type { ReaderSettingsNativePopoverProps } from "./ReaderSettingsNativePopover.types";

export const readerSettingsNativePopoverAvailable = true;

/** Delay after a SwiftUI popover dismissal before the next presentation may start. */
const POPOVER_DISMISS_SETTLE_MS = 380;

/**
 * Reader settings as a native grouped Form: a popover beside the button on
 * regular widths, a titled sheet on compact ones.
 */
export function ReaderSettingsNativePopover({
  visible,
  anchor,
  availableHeight,
  mode,
  activeScrollWidthPct,
  isTwoPageMode,
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
  pageBackground,
  onSetPageBackground,
  showPageTurn = false,
  pageTurn = "curl",
  onSetPageTurn,
  onShiftPairing,
  onToggleProcessPageImages,
  onPreviewScrollWidth,
  onCommitScrollWidth,
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
  regularWidth,
  maxSheetHeight = null,
  pageInteractive = false,
}: ReaderSettingsNativePopoverProps) {
  const { scheme, tokens } = useNemuTheme();
  const windowSize = useWindowDimensions();
  const onDismissCompleteRef = useRef(onDismissComplete);
  useLayoutEffect(() => {
    onDismissCompleteRef.current = onDismissComplete;
  }, [onDismissComplete]);
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!wasVisible || visible) return;
    // SwiftUI reports no end-of-dismissal event; wait out the system animation
    // so a hand-off (plugin settings sheet) never presents over the popover.
    const timer = setTimeout(() => onDismissCompleteRef.current?.(), POPOVER_DISMISS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [visible]);
  // The slider previews continuously and commits on release.
  const [scrollWidth, setScrollWidth] = useState(activeScrollWidthPct);
  const scrollWidthRef = useRef(activeScrollWidthPct);
  useEffect(() => {
    scrollWidthRef.current = activeScrollWidthPct;
    setScrollWidth(activeScrollWidthPct);
  }, [activeScrollWidthPct]);

  const modeLabel = (option: string) =>
    option === "rtl" ? strings.reader.rtl : option === "ltr" ? strings.reader.ltr : strings.reader.scroll;
  const showPlugins = showReaderPluginSettings && Boolean(onOpenReaderPluginSettings);
  const showNotebookRow = showNotebookPane && Boolean(onSetNotebookPane);
  const showPageTurnRow = showPageTurn && mode !== "scrolling" && Boolean(onSetPageTurn);
  const settingsRows = {
    showPageTurn: showPageTurnRow,
    showCameraMode,
    twoPageSupported,
    showPagePairingControls: twoPageSupported && showPagePairingControls,
    scrolling: mode === "scrolling",
    showPlugins,
    // Design-explore: Mark complete is the reader menu's (one place for an
    // action that writes progress); this sheet holds settings.
    showMarkComplete: !completed && !mobileDesignExploreFlag,
    showNotebookPane: showNotebookRow,
    showThumbnailSpoilers: showNotebookRow && Boolean(onToggleThumbnailSpoilerSafe),
    showOrientationLock,
  };
  const presentation = readerSettingsNativePresentation(
    settingsRows,
    // No measured button to point at (system toolbar items): the sheet.
    { availableHeight, regularWidth: regularWidth && anchor !== null },
  );
  const busyModifiers = busy ? [swiftDisabled(true)] : [];

  const sheet = presentation.kind === "sheet" || !anchor;
  // The Form's own layout, shared by the presented Form and the sheet's
  // off-screen measuring copy, so both have the same height. A Form taller
  // than its presentation opens at its first row (reading direction).
  const formLayoutModifiers = [listSectionSpacing("compact"), zeroTopScrollContentMargin(), defaultScrollAnchor("top")];
  // The presentation's own appearance (not just this content's): the
  // container resolves its traits from the controller UIKit presents it
  // from, never from the reader screen. Translucent over the page, resolved
  // in that same appearance. On the presented root only — the popover's Form,
  // the sheet's Group: set on a view inside the sheet's NavigationStack, the
  // background reaches UIKit after the presentation started and the sheet
  // appears in place instead of sliding up.
  const presentationModifiers = [
    presentationColorScheme(scheme),
    presentationBackground({ type: "material", material: "regular" }),
  ];
  const formModifiers = [
    // Design-explore: the accent is for the rows' own controls; the sheet's
    // bar keeps the system's item colours (the close X), as the form sheets do.
    ...(mobileDesignExploreFlag ? [tint(tokens.primary)] : []),
    ...(presentation.kind === "popover" && !sheet
      ? // A Form has no ideal height of its own, so the popover gets the
        // height its off-screen copy measured at the popover's width (any
        // text size): the system shows it whole when there is room and caps
        // it otherwise, the Form scrolling from its top. (A fixed height
        // taller than the popover was centred in it, top rows cut off.)
        [
          fitPopoverToContent({
            group: READER_SETTINGS_SHEET_GROUP,
            page: READER_SETTINGS_POPOVER_PAGE,
            width: presentation.width,
            initialHeight: presentation.height,
          }),
          ...presentationModifiers,
        ]
      : // The sheet is as tall as this Form (see `fitSheetDetentToContent`).
        [inlineToolbarTitle(), reportSheetContentHeight({ page: READER_SETTINGS_SHEET_PAGE })]),
    ...formLayoutModifiers,
  ];
  const settingsSections = (
      <>
        <SwiftSection>
          <SwiftPicker
            modifiers={[
              pickerStyle("segmented"),
              labelsHidden(),
              swiftAccessibilityLabel(strings.reader.readingDirection),
              ...busyModifiers,
            ]}
            selection={mode}
            onSelectionChange={(selection) => {
              if (busy || !isReaderReadingMode(selection) || selection === mode) return;
              void hapticSelection();
              onSetMode(selection);
            }}
          >
            {READER_READING_MODE_ORDER.map((option) => (
              <SwiftText key={option} modifiers={[tag(option)]}>
                {modeLabel(option)}
              </SwiftText>
            ))}
          </SwiftPicker>
        </SwiftSection>
        {showPageTurnRow && onSetPageTurn ? (
          <SwiftSection>
            <SwiftPicker
              label={strings.reader.pageTurning}
              systemImage="book.pages"
              modifiers={[pickerStyle("menu"), ...busyModifiers]}
              selection={pageTurn}
              onSelectionChange={(selection) => {
                if (busy || selection === pageTurn) return;
                if (!(MOBILE_READER_PAGE_TURNS as readonly string[]).includes(String(selection))) return;
                void hapticSelection();
                onSetPageTurn(normalizeMobileReaderPageTurn(selection) as MobileReaderPageTurn);
              }}
            >
              {MOBILE_READER_PAGE_TURNS.map((option) => (
                <SwiftText key={option} modifiers={[tag(option)]}>
                  {readerPageTurnLabel(option, strings)}
                </SwiftText>
              ))}
            </SwiftPicker>
          </SwiftSection>
        ) : null}
        {twoPageSupported ? (
          <SwiftSection footer={<SwiftText>{strings.reader.pageLayoutFootnote}</SwiftText>}>
            <SwiftPicker
              label={strings.reader.pageLayout}
              systemImage="rectangle.split.2x1"
              modifiers={[pickerStyle("menu"), ...busyModifiers]}
              selection={spreadMode}
              onSelectionChange={(selection) => {
                if (busy || !isReaderSpreadMode(selection) || selection === spreadMode) return;
                void hapticSelection();
                onSetSpreadMode(selection);
              }}
            >
              {READER_SPREAD_MODE_ORDER.map((option) => (
                <SwiftText key={option} modifiers={[tag(option)]}>
                  {readerSpreadModeLabel(option, strings)}
                </SwiftText>
              ))}
            </SwiftPicker>
          </SwiftSection>
        ) : null}
        {twoPageSupported && showPagePairingControls ? (
          <SwiftSection footer={<SwiftText>{strings.reader.spreadPairingFootnote}</SwiftText>}>
            <SwiftPicker
              label={strings.reader.spreadPairing}
              systemImage="book.closed"
              modifiers={[pickerStyle("menu"), ...busyModifiers]}
              selection={spreadPairing}
              onSelectionChange={(selection) => {
                if (busy || selection === spreadPairing) return;
                if (!(MOBILE_READER_SPREAD_PAIRINGS as readonly string[]).includes(String(selection))) return;
                void hapticSelection();
                onSetSpreadPairing(selection as MobileReaderSpreadPairing);
              }}
            >
              {MOBILE_READER_SPREAD_PAIRINGS.map((option) => (
                <SwiftText key={option} modifiers={[tag(option)]}>
                  {readerSpreadPairingLabel(option, strings)}
                </SwiftText>
              ))}
            </SwiftPicker>
            <SwiftButton
              label={strings.reader.shiftByOnePage}
              systemImage={pairingShifted ? "arrow.uturn.backward" : "arrow.left.and.right"}
              onPress={() => {
                if (busy) return;
                void hapticSelection();
                onShiftPairing();
              }}
              // An action row in the label colour, like Settings' own.
              modifiers={[foregroundStyle({ type: "hierarchical", style: "primary" }), ...busyModifiers]}
            />
          </SwiftSection>
        ) : null}
        {twoPageSupported ? (
          <SwiftSection footer={<SwiftText>{strings.reader.pageFitFootnote}</SwiftText>}>
            <SwiftPicker
              label={strings.reader.pageFit}
              systemImage="arrow.up.left.and.down.right.magnifyingglass"
              modifiers={[pickerStyle("menu"), ...busyModifiers]}
              selection={fitMode}
              onSelectionChange={(selection) => {
                if (busy || !isReaderFitMode(selection) || selection === fitMode) return;
                void hapticSelection();
                onSetFitMode(selection);
              }}
            >
              {READER_FIT_MODE_ORDER.map((option) => (
                <SwiftText key={option} modifiers={[tag(option)]}>
                  {readerFitModeLabel(option, strings)}
                </SwiftText>
              ))}
            </SwiftPicker>
          </SwiftSection>
        ) : null}
        {twoPageSupported ? (
          <SwiftSection>
            <SwiftPicker
              label={strings.reader.pageBackground}
              systemImage="square.fill.on.square"
              modifiers={[pickerStyle("menu"), ...busyModifiers]}
              selection={pageBackground}
              onSelectionChange={(selection) => {
                if (busy || selection === pageBackground) return;
                if (!(MOBILE_READER_PAGE_BACKGROUNDS as readonly string[]).includes(String(selection))) return;
                void hapticSelection();
                onSetPageBackground(selection as MobileReaderPageBackground);
              }}
            >
              {MOBILE_READER_PAGE_BACKGROUNDS.map((option) => (
                <SwiftText key={option} modifiers={[tag(option)]}>
                  {readerPageBackgroundLabel(option, strings)}
                </SwiftText>
              ))}
            </SwiftPicker>
          </SwiftSection>
        ) : null}
        {showCameraMode && onSetAvoidCamera ? (
          <SwiftSection
            title={strings.reader.outerDisplayMode}
            footer={<SwiftText>{strings.reader.avoidCameraFootnote}</SwiftText>}
          >
            <SwiftToggle
              label={strings.reader.avoidCamera}
              systemImage="camera.metering.center.weighted"
              isOn={avoidCamera}
              onIsOnChange={(isOn) => onSetAvoidCamera(isOn)}
              modifiers={busyModifiers}
            />
          </SwiftSection>
        ) : null}
        {showNotebookRow && onSetNotebookPane ? (
          // Laptop Mode: what the lower half shows. A menu row like the other
          // choices; only the reading direction is a segmented control.
          <SwiftSection footer={<SwiftText>{strings.duo.notebookPaneFootnote}</SwiftText>}>
            <SwiftPicker
              label={strings.duo.notebookPane}
              systemImage="rectangle.split.1x2"
              modifiers={[pickerStyle("menu"), ...busyModifiers]}
              selection={notebookPane}
              onSelectionChange={(selection) => {
                if (busy || !isMobileReaderNotebookPanePreference(selection) || selection === notebookPane) return;
                void hapticSelection();
                onSetNotebookPane(selection);
              }}
            >
              {MOBILE_READER_NOTEBOOK_PANE_PREFERENCES.map((option) => (
                <SwiftText key={option} modifiers={[tag(option)]}>
                  {notebookPaneLabel(option, strings)}
                </SwiftText>
              ))}
            </SwiftPicker>
            {onToggleThumbnailSpoilerSafe ? (
              <SwiftToggle
                label={strings.duo.filmstripSpoilerSafe}
                systemImage="eye.slash"
                isOn={thumbnailSpoilerSafe}
                onIsOnChange={onToggleThumbnailSpoilerSafe}
                modifiers={busyModifiers}
              />
            ) : null}
          </SwiftSection>
        ) : null}
        <SwiftSection title={strings.reader.moreSettings}>
          <SwiftToggle
            label={strings.reader.processPageImages}
            systemImage="wand.and.stars"
            isOn={processPageImages}
            onIsOnChange={() => onToggleProcessPageImages()}
            modifiers={busyModifiers}
          />
          {mode === "scrolling" ? (
            <SwiftSlider
              value={scrollWidth}
              min={READER_SCROLL_WIDTH_MIN}
              max={READER_SCROLL_WIDTH_MAX}
              step={5}
              label={<SwiftText>{strings.reader.pageWidth}</SwiftText>}
              minimumValueLabel={<SwiftText>{`${READER_SCROLL_WIDTH_MIN}%`}</SwiftText>}
              maximumValueLabel={<SwiftText>{`${READER_SCROLL_WIDTH_MAX}%`}</SwiftText>}
              onValueChange={(value) => {
                const next = clampReaderScrollWidthPct(value);
                scrollWidthRef.current = next;
                setScrollWidth(next);
                onPreviewScrollWidth(next);
              }}
              onEditingChanged={(editing) => {
                if (!editing) onCommitScrollWidth(scrollWidthRef.current);
              }}
              modifiers={busyModifiers}
            />
          ) : null}
          <SwiftToggle
            label={strings.feedback.displayKeepAwake}
            systemImage="moon"
            isOn={keepAwake}
            onIsOnChange={() => onToggleKeepAwake()}
            modifiers={busyModifiers}
          />
          {showOrientationLock ? (
            <SwiftToggle
              label={strings.feedback.displayLockPortrait}
              systemImage="lock.rotation"
              isOn={lockPortrait}
              onIsOnChange={() => onToggleLockPortrait()}
              modifiers={busyModifiers}
            />
          ) : null}
            {showPlugins ? (
              <SwiftButton
                label={strings.settings.plugins}
                systemImage="puzzlepiece.extension"
                onPress={() => onOpenReaderPluginSettings?.()}
                // A row that opens a page, like Settings' own: label colour, not an accent link.
                modifiers={[foregroundStyle({ type: "hierarchical", style: "primary" }), ...busyModifiers]}
              />
            ) : null}
            {settingsRows.showMarkComplete ? (
              <SwiftButton
                label={saving ? strings.reader.savingProgress : strings.reader.markComplete}
                systemImage="checkmark.circle"
                onPress={onMarkComplete}
                modifiers={saving ? [swiftDisabled(true)] : []}
              />
            ) : null}
        </SwiftSection>
      </>
  );
  const settingsForm = <SwiftForm modifiers={formModifiers}>{settingsSections}</SwiftForm>;

  // The same rows, laid out off screen at the sheet's width while the sheet
  // is closed: the sheet knows its height before it presents, so it opens in
  // one native motion at that height instead of resizing once its own Form
  // has measured itself.
  // The popover's copy is measured at the popover's width, under its own page.
  const measureFrame =
    presentation.kind === "popover" && !sheet
      ? { width: presentation.width, height: Math.round(windowSize.height) }
      : fittedSheetMeasureFrame(windowSize);
  const measurePage = presentation.kind === "popover" && !sheet ? READER_SETTINGS_POPOVER_PAGE : READER_SETTINGS_SHEET_PAGE;
  const measuringCopy = (
    <ReaderSettingsMeasuringCopy
      heightKey={JSON.stringify([measurePage, measureFrame, settingsRows, saving, strings.reader.markComplete])}
      modifiers={[
        ...formLayoutModifiers,
        measureSheetPage({ group: READER_SETTINGS_SHEET_GROUP, page: measurePage, ...measureFrame }),
      ]}
    >
      {settingsSections}
    </ReaderSettingsMeasuringCopy>
  );

  if (sheet) {
    return (
      <View pointerEvents="none" style={styles.sheetHost}>
        {/* Design-explore: no seed (it tints the bar's close X too); the Form carries the accent. */}
        <SwiftHost colorScheme={scheme} seedColor={mobileDesignExploreFlag ? undefined : tokens.primary} style={StyleSheet.absoluteFill}>
          {measuringCopy}
          <SwiftBottomSheet
            isPresented={visible}
            onIsPresentedChange={(presented) => {
              if (!presented && visible) onClose();
            }}
          >
            <SwiftGroup
              modifiers={[
                // Only as tall as the rows need (a handful of rows used to
                // open a full-height sheet); capped at the screen, where the
                // Form scrolls (landscape, large Dynamic Type).
                // Half folded like a laptop: never past the hinge.
                fitSheetDetentToContent({
                  group: READER_SETTINGS_SHEET_GROUP,
                  page: READER_SETTINGS_SHEET_PAGE,
                  initialHeight: readerSettingsNativeSheetEstimatedHeight(settingsRows),
                  height: readerSettingsSheetDetentCap({
                    estimatedHeight: readerSettingsNativeSheetEstimatedHeight(settingsRows),
                    maxHeight: maxSheetHeight,
                  }),
                }),
                presentationDragIndicator("visible"),
                ...(pageInteractive ? [presentationBackgroundInteraction("enabled")] : []),
                ...presentationModifiers,
                scrollEdgeEffectStyle("soft", "vertical"),
              ]}
            >
              {/* A sheet's title bar (Apple's own settings sheets): the title
                  centred, the close button at the trailing edge. */}
              <SwiftNavigationStack>
                <SwiftToolbar>
                  {settingsForm}
                  <SwiftToolbar.Content>
                    <SwiftToolbarItem placement="topBarTrailing">
                      <SwiftButton
                        role="close"
                        onPress={onClose}
                        modifiers={[swiftAccessibilityLabel(strings.reader.closeSettings)]}
                      />
                    </SwiftToolbarItem>
                    <SwiftToolbarItem placement="principal">
                      <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>
                        {strings.reader.title}
                      </SwiftText>
                    </SwiftToolbarItem>
                  </SwiftToolbar.Content>
                </SwiftToolbar>
              </SwiftNavigationStack>
            </SwiftGroup>
          </SwiftBottomSheet>
        </SwiftHost>
      </View>
    );
  }
  return (
    <>
      {/* Its own host: inside the popover's, the window-tall copy moved the
          trigger (and so the popover's arrow) off the button. */}
      <View pointerEvents="none" style={styles.sheetHost}>
        <SwiftHost colorScheme={scheme} style={StyleSheet.absoluteFill}>
          {measuringCopy}
        </SwiftHost>
      </View>
    <View
      pointerEvents="none"
      style={[styles.anchor, { left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height }]}
    >
      <SwiftHost colorScheme={scheme} seedColor={tokens.primary} style={StyleSheet.absoluteFill}>
        <SwiftPopover
          isPresented={visible}
          onIsPresentedChange={(presented) => {
            if (!presented && visible) onClose();
          }}
        >
          <SwiftPopover.Trigger>
            <SwiftRectangle modifiers={[frame({ width: anchor.width, height: anchor.height }), opacity(0)]} />
          </SwiftPopover.Trigger>
          <SwiftPopover.Content>
            {settingsForm}
          </SwiftPopover.Content>
        </SwiftPopover>
      </SwiftHost>
    </View>
    </>
  );
}

/**
 * The settings sheet's off-screen measuring copy. Re-rendered only when
 * `heightKey` (what changes the rows' height) changes: opening the sheet or
 * flipping a switch must not re-render the copy while the sheet animates.
 * Its switch states and handlers may be stale; nothing can reach it.
 */
const ReaderSettingsMeasuringCopy = memo(
  function ReaderSettingsMeasuringCopy({
    modifiers,
    children,
  }: {
    heightKey: string;
    modifiers: ComponentProps<typeof SwiftForm>["modifiers"];
    children: ReactNode;
  }) {
    return <SwiftForm modifiers={modifiers}>{children}</SwiftForm>;
  },
  (previous, next) => previous.heightKey === next.heightKey,
);

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
  },
  sheetHost: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
});
