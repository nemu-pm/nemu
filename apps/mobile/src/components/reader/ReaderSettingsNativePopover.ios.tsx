import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BottomSheet as SwiftBottomSheet,
  Button as SwiftButton,
  Form as SwiftForm,
  Group as SwiftGroup,
  Host as SwiftHost,
  Picker as SwiftPicker,
  Popover as SwiftPopover,
  Rectangle as SwiftRectangle,
  Section as SwiftSection,
  Slider as SwiftSlider,
  Text as SwiftText,
  Toggle as SwiftToggle,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  disabled as swiftDisabled,
  environment,
  frame,
  labelsHidden,
  listSectionSpacing,
  opacity,
  pickerStyle,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, View } from "react-native";
import { useNemuTheme } from "@/design-system";
import { hapticSelection } from "@/lib/haptics";
import {
  clampReaderScrollWidthPct,
  READER_SCROLL_WIDTH_MAX,
  READER_SCROLL_WIDTH_MIN,
} from "@/lib/mobileReaderSettings";
import { readerSettingsNativePresentation } from "@/lib/readerSettingsNativePopoverLayout";
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
 * (Picker / Toggle / Slider rows): a real popover (SwiftUI `.popover`,
 * `presentationCompactAdaptation(.popover)`) anchored to the settings button
 * when the whole Form fits beside it, otherwise the same Form in a sheet with
 * medium / large detents — never a clipped popover whose rows cannot be
 * reached (an iPhone Duo notebook pane is ~455pt). Always dark: the reader
 * forces its screen's appearance dark (`VerticalBarBehavior appearance`), so
 * the popover / sheet material, grabber and Liquid Glass resolve dark too.
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
}: ReaderSettingsNativePopoverProps) {
  const { tokens } = useNemuTheme();
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
  const presentation = readerSettingsNativePresentation(
    {
      twoPageSupported,
      showPagePairingControls: twoPageSupported && showPagePairingControls,
      scrolling: mode === "scrolling",
      showPlugins,
      showMarkComplete: !completed,
      showNotebookPane: showNotebookRow,
    },
    availableHeight,
  );
  const busyModifiers = busy ? [swiftDisabled(true)] : [];

  const formModifiers = [
    ...(presentation.kind === "popover" ? [frame({ width: presentation.width, height: presentation.height })] : []),
    listSectionSpacing("compact"),
    environment("colorScheme", "dark"),
    // The presentation container resolves its appearance from the presenting
    // host, not from this content, so it would stay light; a material
    // background resolved in this dark environment keeps the popover / sheet
    // dark (and translucent over the page) in either app theme.
    presentationBackground({ type: "material", material: "regular" }),
  ];
  const settingsForm = (
      <SwiftForm modifiers={formModifiers}>
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
              <SwiftText modifiers={[tag("book")]}>1-2</SwiftText>
              <SwiftText modifiers={[tag("manga")]}>1,2</SwiftText>
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
            {!completed ? (
              <SwiftButton
                label={saving ? strings.reader.savingProgress : strings.reader.markComplete}
                systemImage="checkmark.circle"
                onPress={onMarkComplete}
                modifiers={saving ? [swiftDisabled(true)] : []}
              />
            ) : null}
        </SwiftSection>
      </SwiftForm>
  );

  if (!anchor) return null;
  if (presentation.kind === "sheet") {
    return (
      <View pointerEvents="none" style={styles.sheetHost}>
        <SwiftHost colorScheme="dark" seedColor={tokens.primary} style={StyleSheet.absoluteFill}>
          <SwiftBottomSheet
            isPresented={visible}
            onIsPresentedChange={(presented) => {
              if (!presented && visible) onClose();
            }}
          >
            <SwiftGroup modifiers={[presentationDetents(["medium", "large"]), presentationDragIndicator("visible")]}>
              {settingsForm}
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
      <SwiftHost colorScheme="dark" seedColor={tokens.primary} style={StyleSheet.absoluteFill}>
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
