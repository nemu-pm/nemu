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
  disabled as swiftDisabled,
  font,
  frame,
  labelsHidden,
  lineLimit,
  listSectionSpacing,
  opacity,
  pickerStyle,
  presentationBackground,
  presentationDragIndicator,
  scrollEdgeEffectStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
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
  READER_SETTINGS_SHEET_GROUP,
  READER_SETTINGS_SHEET_PAGE,
} from "@/lib/mobileFittedSheet";
import {
  readerSettingsNativePresentation,
  readerSettingsNativeSheetEstimatedHeight,
} from "@/lib/readerSettingsNativePopoverLayout";
import {
  isMobileReaderNotebookPanePreference,
  MOBILE_READER_NOTEBOOK_PANE_PREFERENCES,
} from "@/lib/mobileReaderNotebookPane";
import { notebookPaneLabel } from "./readerNotebookPaneOptions";
import { READER_READING_MODE_ORDER, isReaderReadingMode } from "./readerReadingModeOptions";
import type { ReaderSettingsNativePopoverProps } from "./ReaderSettingsNativePopover.types";

export const readerSettingsNativePopoverAvailable = true;

/** Delay after a SwiftUI popover dismissal before the next presentation may start. */
const POPOVER_DISMISS_SETTLE_MS = 380;

/**
 * Reader settings as system presentations with a native grouped Form
 * (Picker / Toggle / Slider rows). Regular width (iPhone Duo inner display,
 * tablets): a real popover (SwiftUI `.popover`,
 * `presentationCompactAdaptation(.popover)`) anchored to the settings button
 * when the whole Form fits beside it. Compact width (phones, the Duo outer
 * display) — or a regular window too short for it (a ~455pt Duo notebook
 * pane) — the same Form in a sheet with a title bar, a large detent
 * and the grabber, so every row is reachable.
 *
 * Appearance has one source, the theme scheme (dark inside the reader's
 * `ReaderDarkThemeScope`): it drives the Host and `presentationColorScheme`
 * (SwiftUI `preferredColorScheme` on the enclosing presentation), so the
 * system container — popover / sheet material, Liquid Glass, grabber — and
 * the rows' text always resolve together.
 */
export function ReaderSettingsNativePopover({
  visible,
  anchor,
  availableHeight,
  mode,
  activeScrollWidthPct,
  isTwoPageMode,
  twoPageSupported,
  showPagePairingControls,
  pagePairingMode,
  processPageImages,
  busy,
  saving,
  completed,
  strings,
  onClose,
  onDismissComplete,
  onSetMode,
  onToggleTwoPageMode,
  onTogglePagePairingMode,
  onToggleProcessPageImages,
  onPreviewScrollWidth,
  onCommitScrollWidth,
  keepAwake,
  onToggleKeepAwake,
  lockPortrait,
  onToggleLockPortrait,
  showNotebookPane = false,
  notebookPane = "automatic",
  onSetNotebookPane,
  onMarkComplete,
  showReaderPluginSettings = false,
  onOpenReaderPluginSettings,
  regularWidth,
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
  const settingsRows = {
    twoPageSupported,
    showPagePairingControls: twoPageSupported && showPagePairingControls,
    scrolling: mode === "scrolling",
    showPlugins,
    // Design-explore: Mark complete is the reader menu's (one place for an
    // action that writes progress); this sheet holds settings.
    showMarkComplete: !completed && !mobileDesignExploreFlag,
    showNotebookPane: showNotebookRow,
  };
  const presentation = readerSettingsNativePresentation(
    settingsRows,
    // No measured button to point at (system toolbar items): the sheet.
    { availableHeight, regularWidth: regularWidth && anchor !== null },
  );
  const busyModifiers = busy ? [swiftDisabled(true)] : [];

  const sheet = presentation.kind === "sheet" || !anchor;
  // The Form's own layout, shared by the presented Form and the sheet's
  // off-screen measuring copy, so both have the same height.
  const formLayoutModifiers = [listSectionSpacing("compact"), zeroTopScrollContentMargin()];
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
      ? [frame({ width: presentation.width, height: presentation.height }), ...presentationModifiers]
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
        {twoPageSupported ? (
        <SwiftSection>
            <SwiftToggle
              label={strings.reader.twoPageView}
              systemImage="book"
              isOn={isTwoPageMode}
              onIsOnChange={() => onToggleTwoPageMode()}
              modifiers={busyModifiers}
            />
          {showPagePairingControls ? (
            <SwiftPicker
              modifiers={[pickerStyle("segmented"), labelsHidden(), ...busyModifiers]}
              selection={pagePairingMode}
              onSelectionChange={(selection) => {
                if (busy || selection === pagePairingMode) return;
                void hapticSelection();
                onTogglePagePairingMode();
              }}
            >
              <SwiftText modifiers={[tag("book")]}>{strings.reader.pairingCoverPaired}</SwiftText>
              <SwiftText modifiers={[tag("manga")]}>{strings.reader.pairingCoverAlone}</SwiftText>
            </SwiftPicker>
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
          <SwiftToggle
            label={strings.feedback.displayLockPortrait}
            systemImage="lock.rotation"
            isOn={lockPortrait}
            onIsOnChange={() => onToggleLockPortrait()}
            modifiers={busyModifiers}
          />
          {showNotebookRow && onSetNotebookPane ? (
            // A menu picker row (label left, value right), like
            // Settings' own choice rows.
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
          ) : null}
            {showPlugins ? (
              <SwiftButton
                label={strings.settings.plugins}
                systemImage="puzzlepiece.extension"
                onPress={() => onOpenReaderPluginSettings?.()}
                modifiers={busyModifiers}
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
  const measureFrame = fittedSheetMeasureFrame(windowSize);
  const measuringCopy = (
    <ReaderSettingsMeasuringCopy
      heightKey={JSON.stringify([measureFrame, settingsRows, saving, strings.reader.markComplete])}
      modifiers={[
        ...formLayoutModifiers,
        measureSheetPage({ group: READER_SETTINGS_SHEET_GROUP, page: READER_SETTINGS_SHEET_PAGE, ...measureFrame }),
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
                fitSheetDetentToContent({
                  group: READER_SETTINGS_SHEET_GROUP,
                  page: READER_SETTINGS_SHEET_PAGE,
                  initialHeight: readerSettingsNativeSheetEstimatedHeight(settingsRows),
                }),
                presentationDragIndicator("visible"),
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
