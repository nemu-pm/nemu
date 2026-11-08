import {
  memo,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  BottomSheet as SwiftBottomSheet,
  Button as SwiftButton,
  Form as SwiftForm,
  Group as SwiftGroup,
  Host as SwiftHost,
  Label as SwiftLabel,
  NavigationDestination as SwiftNavigationDestination,
  NavigationLink as SwiftNavigationLink,
  NavigationStack as SwiftNavigationStack,
  Picker as SwiftPicker,
  Popover as SwiftPopover,
  Rectangle as SwiftRectangle,
  RNHostView,
  ScrollView as SwiftScrollView,
  Section as SwiftSection,
  Slider as SwiftSlider,
  Text as SwiftText,
  Toggle as SwiftToggle,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
} from "@expo/ui/swift-ui";
import {
  animation,
  Animation,
  accessibilityLabel as swiftAccessibilityLabel,
  accessibilityValue as swiftAccessibilityValue,
  defaultScrollAnchor,
  disabled as swiftDisabled,
  font,
  foregroundStyle,
  frame,
  interactiveDismissDisabled,
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
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fitPopoverToContent,
  fitSheetDetentToContent,
  inlineToolbarTitle,
  measureSheetPage,
  navigationBarHidden,
  reportSheetContentHeight,
  barlessFormMargins,
  zeroTopScrollContentMargin,
  presentationColorScheme,
  presentationPlacement,
  formRowIcon,
  formRowMenuTitle,
  isAccessibilityFontScale,
  reportFormGroupInset,
  reportPageWidth,
  type FormGroupInset,
  sheetCenteredTitle,
} from "../../../modules/nemu-window-layout/src/presentationColorScheme";
import { NemuGlassSheetThemeScope, useMobileSheetPlacement, useNemuTheme } from "@/design-system";
import { supportsNemuLiquidGlass } from "@/lib/nemuLiquidGlass";
import { hapticSelection } from "@/lib/haptics";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import {
  clampReaderScrollWidthPct,
  READER_SCROLL_WIDTH_MAX,
  READER_SCROLL_WIDTH_MIN,
} from "@/lib/mobileReaderSettings";
import {
  fittedSheetExpandedDetent,
  fittedSheetMeasureFrame,
  fittedSheetTallestDetent,
  READER_SETTINGS_PLUGINS_PAGE,
  READER_SETTINGS_POPOVER_PAGE,
  READER_SETTINGS_SHEET_GROUP,
  READER_SETTINGS_SHEET_PAGE,
  readerPluginSheetPage,
} from "@/lib/mobileFittedSheet";
import {
  pushedPageWidthKey,
  readerSettingsFormKey,
  readerSettingsHeldNativePresentation,
  readerSettingsNativePresentation,
  READER_SETTINGS_FORM_INSET,
  READER_SETTINGS_POPOVER_FORM_MARGINS,
  readerSettingsNativeSheetEstimatedHeight,
  readerSettingsSheetDetentCap,
} from "@/lib/readerSettingsNativePopoverLayout";
import {
  READER_FIT_MODE_ORDER,
  READER_SPREAD_MODE_ORDER,
  readerFitModeLabel,
  readerSpreadModeFootnote,
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
import { ReaderPluginDetailPage, ReaderPluginListPage } from "./ReaderPluginSettingsSheet.ios";
import { useReaderSettingsBusyShown } from "./useReaderSettingsBusyShown";

export const readerSettingsNativePopoverAvailable = true;

/**
 * The pushed plugin pages on the sheet's material: on iOS 26 the cards are
 * the translucent glass fills (like the Form's own groups over it), before
 * it the theme's cards.
 */
const PUSHED_PAGE_LOOK = supportsNemuLiquidGlass(Platform.OS, Platform.Version) ? "clear" : "opaque";

/**
 * The pushed pages' React Native host: its width is the page's (SwiftUI's,
 * reported to Yoga), its height the content's. Matching both axes laid the
 * page out at a width JS learned from a scaled global frame, which shrank by
 * the floating sheet's scale on every report down to a ~100pt column.
 */
const PUSHED_PAGE_MATCH_CONTENTS = { vertical: true } as const;

/**
 * The Reader Form's group margins as the presented Form drew them (UIKit
 * picks them per width / size class: 20pt on a Pro Max sheet, 16pt on the
 * Duo's), per presentation and window size, so a pushed page opened later
 * (or in a later presentation) starts on them. Until the Form has reported,
 * the iPhone default.
 */
const formGroupInsets = new Map<string, FormGroupInset>();

type SwiftPickerSymbol = NonNullable<ComponentProps<typeof SwiftPicker>["systemImage"]>;

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
  avoidCamera = false,
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
  pageTurnHaptics,
  onTogglePageTurnHaptics,
  showOrientationLock = true,
  lockPortrait,
  onToggleLockPortrait,
  onMarkComplete,
  showReaderPluginSettings = false,
  readerPlugins,
  regularWidth,
  maxSheetHeight = null,
  pageInteractive = false,
}: ReaderSettingsNativePopoverProps) {
  const { scheme, tokens } = useNemuTheme();
  const sheetPlacement = useMobileSheetPlacement();
  const windowSize = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The pages pushed on the settings' NavigationStack (controlled, so the
  // plugin rows can push too): `plugins`, then `plugin:<id>`. Each
  // presentation opens on the Reader page.
  const [path, setPath] = useState<string[]>([]);
  // The pushed pages' layout width, as this presentation reported it (below).
  const [pushedPageWidth, setPushedPageWidth] = useState<number | null>(null);
  const [shownVisible, setShownVisible] = useState(visible);
  if (shownVisible !== visible) {
    setShownVisible(visible);
    if (visible && path.length > 0) setPath([]);
    // Each presentation lays its pages out at a width it reported itself.
    if (visible && pushedPageWidth !== null) setPushedPageWidth(null);
  }
  // The slider previews continuously and commits on release.
  const [scrollWidth, setScrollWidth] = useState(activeScrollWidthPct);
  const scrollWidthRef = useRef(activeScrollWidthPct);
  useEffect(() => {
    scrollWidthRef.current = activeScrollWidthPct;
    setScrollWidth(activeScrollWidthPct);
  }, [activeScrollWidthPct]);

  const modeLabel = (option: string) =>
    option === "rtl" ? strings.reader.rtl : option === "ltr" ? strings.reader.ltr : strings.reader.scroll;
  const showPlugins = showReaderPluginSettings && Boolean(readerPlugins);
  const showPageTurnRow = showPageTurn && mode !== "scrolling" && Boolean(onSetPageTurn);
  const showCameraRow = showCameraMode && Boolean(onSetAvoidCamera);
  // The page group's one footnote: Page Layout's, then Page Fit's.
  const pageFootnote = twoPageSupported
    ? `${readerSpreadModeFootnote(spreadMode, strings, isTwoPageMode)} ${strings.reader.pageFitFootnote}`
    : null;
  const settingsRows = {
    showPageTurn: showPageTurnRow,
    showCameraMode: showCameraRow,
    twoPageSupported,
    showPagePairingControls: twoPageSupported && showPagePairingControls,
    scrolling: mode === "scrolling",
    showPlugins,
    // Design-explore: Mark complete is the reader menu's (one place for an
    // action that writes progress); this sheet holds settings.
    showMarkComplete: !completed && !mobileDesignExploreFlag,
    showOrientationLock,
  };
  const nextPresentation = readerSettingsNativePresentation(
    settingsRows,
    // No measured button to point at (system toolbar items): the sheet.
    { availableHeight, regularWidth: regularWidth && anchor !== null },
  );
  // Open, the kind chosen at opening holds until the room changes (rotation,
  // fold): Scroll ⇄ paged changes the rows, never sheet ⇄ popover.
  const presentationHoldKey = visible
    ? `${regularWidth && anchor !== null}:${Math.round(availableHeight)}`
    : null;
  const [heldPresentation, setHeldPresentation] = useState({ key: presentationHoldKey, kind: nextPresentation.kind });
  if (heldPresentation.key !== presentationHoldKey) {
    setHeldPresentation({ key: presentationHoldKey, kind: nextPresentation.kind });
  }
  const presentation = readerSettingsHeldNativePresentation(
    heldPresentation.key === presentationHoldKey ? heldPresentation.kind : null,
    nextPresentation,
    settingsRows,
  );
  const busyModifiers = useReaderSettingsBusyShown(busy) ? [swiftDisabled(true)] : [];

  const sheet = presentation.kind === "sheet" || !anchor;

  // Where the presented Form draws its groups: the pushed plugin pages set
  // theirs on the same edges.
  const formInsetKey = `${sheet ? "sheet" : "popover"}:${Math.round(windowSize.width)}x${Math.round(windowSize.height)}`;
  const [, setFormInsetRevision] = useState(0);
  const formGroupInset = formGroupInsets.get(formInsetKey) ?? null;
  // The width the pushed pages lay out at: the latest the presented stack
  // itself reported — the Reader Form as it lays out, or a pushed page's own
  // probe (it resizes on a rotation while the Form below is off screen).
  // Never a cached or JS-guessed size (after a rotation, the window size JS
  // sees and the native layout disagree for a moment): until this
  // presentation has reported one, the pages mount no content, and every
  // new width remounts their content (`key`), laid out from scratch at a
  // definite width, so no row keeps a text measurement from another width.
  const learnPushedPageWidth = (width: number) => {
    if (!Number.isFinite(width) || width <= 0) return;
    // Both probes measure the same page; sub-point disagreements between
    // them must not remount the pages back and forth.
    setPushedPageWidth((current) => (current !== null && Math.abs(current - width) < 0.75 ? current : width));
  };
  const pushedPageInset = {
    left: formGroupInset?.left ?? READER_SETTINGS_FORM_INSET,
    right: formGroupInset?.right ?? READER_SETTINGS_FORM_INSET,
  };
  const learnFormGroupInset = (inset: FormGroupInset) => {
    if (![inset.left, inset.right, inset.width].every(Number.isFinite) || inset.width <= 0) return;
    learnPushedPageWidth(inset.width);
    const known = formGroupInsets.get(formInsetKey);
    if (known && Math.abs(known.left - inset.left) < 0.25 && Math.abs(known.right - inset.right) < 0.25) return;
    formGroupInsets.set(formInsetKey, inset);
    setFormInsetRevision((revision) => revision + 1);
  };

  // ── The plugin pages pushed from the Plugins row ──
  // React Native pages (the reader's Plugins sheet's own) in the stack. Like
  // a system sheet, a push or pop never resizes the presentation: the sheet
  // keeps the Reader page's fitted detent (the user can drag it taller), the
  // popover its Reader page size, and a pushed page scrolls inside it.
  // A plugin's page mounts (and lays out) before it is pushed, and stays
  // mounted while it pops, so the slide never shows an empty page.
  const [detailPluginId, setDetailPluginId] = useState<string | null>(null);
  const [pendingDetailPush, setPendingDetailPush] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingDetailPush) return;
    setPendingDetailPush(null);
    setPath([READER_SETTINGS_PLUGINS_PAGE, readerPluginSheetPage(pendingDetailPush)]);
  }, [pendingDetailPush]);
  const topPage = path.length > 0 ? path[path.length - 1] : null;
  const openPluginPage = (pluginId: string) => {
    if (topPage !== READER_SETTINGS_PLUGINS_PAGE) return;
    setDetailPluginId(pluginId);
    setPendingDetailPush(pluginId);
  };
  const detailPlugin = detailPluginId
    ? (readerPlugins?.plugins.find((plugin) => plugin.id === detailPluginId) ?? null)
    : null;
  const pluginBusy = Boolean(readerPlugins?.busy);
  const closeModifiers = [
    swiftAccessibilityLabel(strings.reader.closeSettings),
    ...(pluginBusy && topPage !== null ? [swiftDisabled(true)] : []),
  ];
  // The Form's own layout, shared by the presented Form and the sheet's
  // off-screen measuring copy, so both have the same height. A Form taller
  // than its presentation opens at its first row (reading direction). A sheet's
  // first group sits under its bar; the bar-less popover's keeps the same inset
  // from every edge.
  const formLayoutModifiers = [
    listSectionSpacing("compact"),
    presentation.kind === "popover" && !sheet
      ? barlessFormMargins(READER_SETTINGS_POPOVER_FORM_MARGINS)
      : zeroTopScrollContentMargin(),
    defaultScrollAnchor("top"),
  ];
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
  // The popover's presented root is its NavigationStack. A Form has no ideal
  // height of its own, so the popover gets the height its off-screen copy
  // measured at the popover's width (any text size): the system shows it
  // whole when there is room and caps it otherwise, the Form scrolling from
  // its top. (A fixed height taller than the popover was centred in it, top
  // rows cut off.) The pushed plugin pages keep that size and scroll in it.
  const popoverStackModifiers =
    presentation.kind === "popover" && !sheet
      ? [
          fitPopoverToContent({
            group: READER_SETTINGS_SHEET_GROUP,
            page: READER_SETTINGS_POPOVER_PAGE,
            width: presentation.width,
            initialHeight: presentation.height,
          }),
          ...presentationModifiers,
        ]
      : [];
  const formModifiers = [
    // Design-explore: the accent is for the rows' own controls; the sheet's
    // bar keeps the system's item colours (the close X), as the form sheets do.
    ...(mobileDesignExploreFlag ? [tint(tokens.primary)] : []),
    ...(presentation.kind === "popover" && !sheet
      ? // The popover's root keeps its bar-less look; pushed pages show the bar.
        [navigationBarHidden()]
      : // The sheet is as tall as this Form (see `fitSheetDetentToContent`).
        [inlineToolbarTitle(), reportSheetContentHeight({ page: READER_SETTINGS_SHEET_PAGE })]),
    ...formLayoutModifiers,
  ];
  const shiftPairingSystemImage = pairingShifted ? "arrow.uturn.backward" : "arrow.left.and.right";
  // Rows with an icon carry `formRowIcon` (the same symbol): at accessibility
  // text sizes the icon keeps its own column and every line of the row's text
  // (wrapped title, a menu's value) starts on the first title line's edge.
  // There the controls come without their own icon (`axRows`).
  const axRows = isAccessibilityFontScale(windowSize.fontScale);
  const menuRowLabel = (title: string, systemImage: SwiftPickerSymbol) =>
    axRows
      ? { label: <SwiftText modifiers={[formRowMenuTitle()]}>{title}</SwiftText> }
      : { label: title, systemImage };
  // The presented Form's first row reports where the Form draws its groups
  // (not the off-screen copy: its width and traits are not the page's).
  const renderSettingsSections = (firstRowModifiers: ComponentProps<typeof SwiftPicker>["modifiers"]) => (
      <>
        <SwiftSection>
          <SwiftPicker
            modifiers={[
              pickerStyle("segmented"),
              labelsHidden(),
              swiftAccessibilityLabel(strings.reader.readingDirection),
              ...busyModifiers,
              ...(firstRowModifiers ?? []),
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
        {/* The page: how it turns, how many show, how they fit, what is
            around them. Every presentation (paged and scroll) paints the
            page background. */}
        <SwiftSection footer={pageFootnote ? <SwiftText>{pageFootnote}</SwiftText> : undefined}>
          {showPageTurnRow && onSetPageTurn ? (
            <SwiftPicker
              {...menuRowLabel(strings.reader.pageTurning, "book.pages")}
              modifiers={[formRowIcon("book.pages", { menu: true }), pickerStyle("menu"), ...busyModifiers]}
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
          ) : null}
          {twoPageSupported ? (
            <SwiftPicker
              {...menuRowLabel(strings.reader.pageLayout, "rectangle.split.2x1")}
              modifiers={[formRowIcon("rectangle.split.2x1", { menu: true }), pickerStyle("menu"), ...busyModifiers]}
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
          ) : null}
          {twoPageSupported ? (
            <SwiftPicker
              {...menuRowLabel(strings.reader.pageFit, "arrow.up.left.and.down.right.magnifyingglass")}
              modifiers={[
                formRowIcon("arrow.up.left.and.down.right.magnifyingglass", { menu: true }),
                pickerStyle("menu"),
                ...busyModifiers,
              ]}
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
          ) : null}
          <SwiftPicker
            {...menuRowLabel(strings.reader.pageBackground, "square.fill.on.square")}
            modifiers={[formRowIcon("square.fill.on.square", { menu: true }), pickerStyle("menu"), ...busyModifiers]}
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
        {twoPageSupported && showPagePairingControls ? (
          <SwiftSection footer={<SwiftText>{strings.reader.spreadPairingFootnote}</SwiftText>}>
            <SwiftPicker
              {...menuRowLabel(strings.reader.spreadPairing, "book.closed")}
              modifiers={[formRowIcon("book.closed", { menu: true }), pickerStyle("menu"), ...busyModifiers]}
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
              systemImage={axRows ? undefined : shiftPairingSystemImage}
              onPress={() => {
                if (busy) return;
                void hapticSelection();
                onShiftPairing();
              }}
              // An action row: its title in the label colour, like Settings'
              // own, its icon in the accent like every other row's.
              modifiers={[
                formRowIcon(shiftPairingSystemImage, { actionRow: true }),
                foregroundStyle({ type: "hierarchical", style: "primary" }),
                // VoiceOver hears whether the shift is on (the icon alone shows it).
                swiftAccessibilityValue(pairingShifted ? strings.reader.pluginValueOn : strings.reader.pluginValueOff),
                ...busyModifiers,
              ]}
            />
          </SwiftSection>
        ) : null}
        <SwiftSection
          title={strings.reader.moreSettings}
          footer={showCameraRow ? <SwiftText>{strings.reader.avoidCameraFootnote}</SwiftText> : undefined}
        >
          <SwiftToggle
            label={strings.reader.processPageImages}
            systemImage={axRows ? undefined : "wand.and.stars"}
            isOn={processPageImages}
            onIsOnChange={() => onToggleProcessPageImages()}
            modifiers={[formRowIcon("wand.and.stars", { toggle: true }), ...busyModifiers]}
          />
          {mode === "scrolling" ? (
            <SwiftSlider
              value={scrollWidth}
              min={READER_SCROLL_WIDTH_MIN}
              max={READER_SCROLL_WIDTH_MAX}
              step={5}
              // VoiceOver reads the width, not the thumb's place on the track (0.6 for 80%).
              accessibilityValueText={`${scrollWidth}%`}
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
              modifiers={[swiftAccessibilityLabel(strings.reader.pageWidth), ...busyModifiers]}
            />
          ) : null}
          <SwiftToggle
            label={strings.feedback.displayKeepAwake}
            systemImage={axRows ? undefined : "moon"}
            isOn={keepAwake}
            onIsOnChange={() => onToggleKeepAwake()}
            modifiers={[formRowIcon("moon", { toggle: true }), ...busyModifiers]}
          />
          <SwiftToggle
            label={strings.feedback.displayPageTurnHaptics}
            systemImage={axRows ? undefined : "iphone.radiowaves.left.and.right"}
            isOn={pageTurnHaptics}
            onIsOnChange={() => onTogglePageTurnHaptics()}
            modifiers={[formRowIcon("iphone.radiowaves.left.and.right", { toggle: true }), ...busyModifiers]}
          />
          {showCameraRow && onSetAvoidCamera ? (
          <SwiftToggle
            label={strings.reader.avoidCamera}
            systemImage={axRows ? undefined : "camera.metering.center.weighted"}
            isOn={avoidCamera}
            onIsOnChange={(isOn) => onSetAvoidCamera(isOn)}
            modifiers={[formRowIcon("camera.metering.center.weighted", { toggle: true }), ...busyModifiers]}
          />
          ) : null}
          {showOrientationLock ? (
            <SwiftToggle
              label={strings.feedback.displayLockPortrait}
              systemImage={axRows ? undefined : "lock.rotation"}
              isOn={lockPortrait}
              onIsOnChange={() => onToggleLockPortrait()}
              modifiers={[formRowIcon("lock.rotation", { toggle: true }), ...busyModifiers]}
            />
          ) : null}
            {showPlugins ? (
              // Pushes the plugin list in this stack: the system disclosure
              // chevron on the form's trailing inset, the row in the label colour.
              <SwiftNavigationLink value={READER_SETTINGS_PLUGINS_PAGE} modifiers={busyModifiers}>
                <SwiftLabel
                  title={strings.settings.plugins}
                  systemImage="puzzlepiece.extension"
                  modifiers={[formRowIcon("puzzlepiece.extension")]}
                />
              </SwiftNavigationLink>
            ) : null}
            {settingsRows.showMarkComplete ? (
              <SwiftButton
                label={saving ? strings.reader.savingProgress : strings.reader.markComplete}
                systemImage={axRows ? undefined : "checkmark.circle"}
                onPress={onMarkComplete}
                modifiers={[formRowIcon("checkmark.circle"), ...(saving ? [swiftDisabled(true)] : [])]}
              />
            ) : null}
        </SwiftSection>
      </>
  );
  const settingsSections = renderSettingsSections([]);
  const settingsForm = (
    // Scroll reading has other rows than paged reading: they come and go as a
    // list change, not all in one frame.
    // A new window size (a rotation, Split View) lays the rows out afresh: the
    // List keeps a row's self-sized height from the width it was measured at,
    // and a row inserted while the open sheet resized for a rotation (Spread
    // Pairing, which shows only once a spread can) kept a height measured at
    // the old width, with empty space above and below its one line.
    <SwiftForm
      key={readerSettingsFormKey(windowSize)}
      modifiers={[...formModifiers, animation(Animation.easeInOut({ duration: 0.25 }), mode === "scrolling")]}
    >
      {renderSettingsSections([reportFormGroupInset(learnFormGroupInset)])}
    </SwiftForm>
  );

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
      heightKey={JSON.stringify([
        measurePage,
        measureFrame,
        settingsRows,
        saving,
        strings.reader.markComplete,
        axRows,
      ])}
      modifiers={[
        ...formLayoutModifiers,
        measureSheetPage({ group: READER_SETTINGS_SHEET_GROUP, page: measurePage, ...measureFrame }),
      ]}
    >
      {settingsSections}
    </ReaderSettingsMeasuringCopy>
  );

  // ── The pushed pages ──
  // Each a native page in the stack: the system back chevron, the title, and
  // (in the sheet) the same ✕ as the Reader page, closing the whole sheet.
  // The page never sizes the presentation (no `reportSheetContentHeight`): it
  // fills what the Reader page set, and its native ScrollView scrolls it.
  // The React Native content takes its width from the page (`matchContents`
  // vertically only: the host fills the ScrollView's width and reports it to
  // Yoga) and its height from its own layout, so its groups sit on the same
  // 20pt inset of the same width as the Form's.
  const pushedPage = (title: string, content: ReactElement) => (
    <SwiftToolbar>
      <SwiftScrollView
        modifiers={[inlineToolbarTitle(), defaultScrollAnchor("top"), reportPageWidth(learnPushedPageWidth)]}
      >
        {pushedPageWidth !== null ? (
          // A new width remounts the page's rows, never the host or its
          // hosted view: a re-keyed host takes that view back from Fabric's
          // recycle pool into a new SwiftUI container, and a page re-keyed
          // twice in one posture change (book → laptop → book) was left
          // blank, its hosted view in no container on screen.
          <RNHostView matchContents={PUSHED_PAGE_MATCH_CONTENTS}>
            <View collapsable={false} style={[styles.pushedPage, { width: pushedPageWidth }]}>
              <NemuGlassSheetThemeScope key={pushedPageWidthKey(pushedPageWidth)} look={PUSHED_PAGE_LOOK}>
                {content}
              </NemuGlassSheetThemeScope>
            </View>
          </RNHostView>
        ) : null}
      </SwiftScrollView>
      <SwiftToolbar.Content>
        {sheet ? (
          <SwiftToolbarItem placement="topBarTrailing">
            <SwiftButton role="close" onPress={onClose} modifiers={closeModifiers} />
          </SwiftToolbarItem>
        ) : null}
        <SwiftToolbarItem placement="principal">
          <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1), sheetCenteredTitle()]}>{title}</SwiftText>
        </SwiftToolbarItem>
      </SwiftToolbar.Content>
    </SwiftToolbar>
  );
  const pluginDestinations =
    showPlugins && readerPlugins ? (
      <>
        <SwiftNavigationDestination value={READER_SETTINGS_PLUGINS_PAGE}>
          {pushedPage(
            strings.settings.plugins,
            <ReaderPluginListPage
              chrome="stack"
              stackInset={pushedPageInset}
              plugins={readerPlugins.plugins}
              loading={readerPlugins.loading}
              error={readerPlugins.error}
              loadError={readerPlugins.loadError}
              busy={readerPlugins.busy}
              retryingLoad={readerPlugins.retryingLoad}
              canRetryLoadError={readerPlugins.canRetryLoadError}
              strings={strings}
              measuring={false}
              onClose={onClose}
              onDismissError={readerPlugins.onDismissError}
              onDismissLoadError={readerPlugins.onDismissLoadError}
              onRetryLoad={readerPlugins.onRetryLoad}
              onSelectPlugin={openPluginPage}
              onTogglePlugin={readerPlugins.onTogglePlugin}
            />,
          )}
        </SwiftNavigationDestination>
        {detailPlugin ? (
          <SwiftNavigationDestination value={readerPluginSheetPage(detailPlugin.id)}>
            {pushedPage(
              detailPlugin.name,
              <ReaderPluginDetailPage
                chrome="stack"
                stackInset={pushedPageInset}
                plugin={detailPlugin}
                busy={readerPlugins.busy}
                loading={readerPlugins.loading}
                error={readerPlugins.error}
                strings={strings}
                onBack={() => setPath([READER_SETTINGS_PLUGINS_PAGE])}
                onResetPlugin={readerPlugins.onResetPlugin}
                onChangePluginValue={readerPlugins.onChangePluginValue}
              />,
            )}
          </SwiftNavigationDestination>
        ) : null}
      </>
    ) : null;
  const onPathChange = (next: string[]) => {
    // A back swipe or the back chevron pops; only the Plugins row pushes
    // natively (a plugin's page is pushed from its row, above).
    setPath(next);
  };

  if (sheet) {
    // Half folded like a laptop: never past the hinge (a pushed plugin page
    // scrolls in the same height).
    const sheetEstimate = readerSettingsNativeSheetEstimatedHeight(settingsRows);
    const sheetBounds = { windowHeight: windowSize.height, safeAreaTop: insets.top, safeAreaBottom: insets.bottom };
    const sheetCap = readerSettingsSheetDetentCap({ estimatedHeight: sheetEstimate, maxHeight: maxSheetHeight });
    return (
      <>
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
                // Only as tall as the Reader Form needs (a handful of rows
                // used to open a full-height sheet), and that height for the
                // whole presentation: pushing Plugins or a plugin, and popping
                // back, never moves the sheet (a system sheet's push). The
                // user can still drag it to the large detent; below a fold it
                // stays capped at the hinge. Capped at the screen, where the
                // page scrolls (landscape, large Dynamic Type).
                fitSheetDetentToContent({
                  group: READER_SETTINGS_SHEET_GROUP,
                  page: READER_SETTINGS_SHEET_PAGE,
                  initialHeight: sheetEstimate,
                  height: sheetCap,
                  expandable: sheetCap === 0 && maxSheetHeight == null,
                  maxHeight: fittedSheetTallestDetent(sheetBounds),
                  expandedHeight: fittedSheetExpandedDetent(sheetBounds),
                }),
                presentationDragIndicator("visible"),
                presentationPlacement(sheetPlacement),
                ...(pageInteractive ? [presentationBackgroundInteraction("enabled")] : []),
                // A plugin toggle or reset in flight keeps the sheet up, so
                // its outcome (and any error) lands here, not behind the reader.
                interactiveDismissDisabled(pluginBusy && topPage !== null),
                ...presentationModifiers,
                scrollEdgeEffectStyle("soft", "vertical"),
              ]}
            >
              {/* A sheet's title bar (Apple's own settings sheets): the title
                  centred, the close button at the trailing edge. Plugins
                  pushes inside it, under the same bar. */}
              <SwiftNavigationStack path={path} onPathChange={onPathChange}>
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
                      <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1), sheetCenteredTitle()]}>
                        {strings.reader.title}
                      </SwiftText>
                    </SwiftToolbarItem>
                  </SwiftToolbar.Content>
                </SwiftToolbar>
                {pluginDestinations}
              </SwiftNavigationStack>
            </SwiftGroup>
          </SwiftBottomSheet>
        </SwiftHost>
      </View>
      </>
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
            {/* Its own stack, so Plugins pushes inside the popover too (a
                popover is its own presentation: the sheet's stack never
                reaches it). The root page has no bar, as before. */}
            <SwiftNavigationStack path={path} onPathChange={onPathChange} modifiers={popoverStackModifiers}>
              {settingsForm}
              {pluginDestinations}
            </SwiftNavigationStack>
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
  // Fills the host's width (the page's; explicit once the Form measured it),
  // its height its own.
  pushedPage: {
    alignSelf: "stretch",
  },
  sheetHost: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
});
