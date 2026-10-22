import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

const iosSheetPath = "components/reader/ReaderPluginSettingsSheet.ios.tsx";
const sheetPath = "components/reader/ReaderPluginSettingsSheet.tsx";
const rowsPath = "components/reader/ReaderPluginSettingsRows.tsx";
const contentPath = "components/MobileReaderPluginSettingsContent.tsx";
const nativeSettingsPath = "components/reader/ReaderSettingsNativePopover.ios.tsx";

describe("reader plugin settings sheet policy", () => {
  test("lives in its own platform files and the reader only renders it", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");

    expect(screen).toContain(
      'import { ReaderPluginSettingsSheet } from "@/components/reader/ReaderPluginSettingsSheet";',
    );
    expect(screen).not.toContain("function ReaderPluginSettingsSheet(");
    for (const source of [mobileSource(iosSheetPath), mobileSource(sheetPath)]) {
      expect(source).toContain("}: ReaderPluginSettingsSheetProps) {");
      // Both platforms draw the same list rows.
      expect(source).toContain("<ReaderPluginListItem");
    }
    // One row per plugin: no separate gear button, no uppercase meta line.
    const rows = mobileSource(rowsPath);
    expect(rows).not.toContain("settings-outline");
    expect(rows).not.toContain('textTransform: "uppercase"');
    expect(rows).toContain("mobileReaderPluginRowSubtitle(plugin, strings)");
    // The switch sits centred on the row, beside (not inside) its press target.
    expect(rows).toMatch(/row: \{\s*flexDirection: "row",\s*alignItems: "center",/);
  });

  test("one plugin page everywhere: the reader's sheets and Settings render the shared React Native content", () => {
    const content = mobileSource(contentPath);
    expect(content).toContain("<MobileSourceSettingsCard");
    expect(content).toContain("navigationResetKey={plugin.id}");
    expect(content).toContain("<MobileJapaneseLearningDictionaryRow");
    for (const source of [
      mobileSource(iosSheetPath),
      mobileSource(sheetPath),
      mobileSource("screens/SettingsScreen.tsx"),
    ]) {
      expect(source).toContain("<MobileReaderPluginSettingsCard");
      // Signed out, server features stay visible but locked.
      expect(source).toContain("useMobileReaderPluginSignedInState(storedPlugin, strings)");
      expect(source).not.toContain("<MobileSourceSettingsCard");
    }
    // No SwiftUI copy of the settings rows on iOS.
    const ios = mobileSource(iosSheetPath);
    for (const swiftOnly of ["SwiftForm", "SwiftNavigationStack", "SwiftSection", "buildMobileReaderPluginNativeSections"]) {
      expect(ios).not.toContain(swiftOnly);
    }
    // Pushed inside the iOS reader settings, the pages are these same React
    // Native components (exported from the sheet, hosted in the stack), not a
    // second implementation; the list uses Settings → Reader → Plugins' rows.
    const native = mobileSource(nativeSettingsPath);
    expect(native).toContain('} from "./ReaderPluginSettingsSheet.ios";');
    expect(native).toContain("<ReaderPluginListPage\n              chrome=\"stack\"");
    expect(native).toContain("<ReaderPluginDetailPage\n                chrome=\"stack\"");
    expect(native).toContain("<RNHostView matchContents={PUSHED_PAGE_MATCH_CONTENTS}>");
    for (const swiftOnly of ["buildMobileReaderPluginNativeSections", "<MobileReaderPluginSettingsCard"]) {
      expect(native).not.toContain(swiftOnly);
    }
    expect(ios).toContain("<ReaderPluginManagementRow");
    expect(mobileSource("screens/SettingsScreen.tsx")).toContain("<ReaderPluginManagementRow");
  });

  test("one guarded dismissal policy: no dismissing while a save is in flight", () => {
    const ios = mobileSource(iosSheetPath);
    expect(ios).toContain("interactiveDismissDisabled(busy)");
    // The close button is disabled with the rest of the controls.
    expect(ios).toMatch(
      /accessibilityLabel=\{strings\.common\.done\}[\s\S]{0,160}disabled=\{busy\}\s*onPress=\{measuring \? noop : onClose\}/,
    );

    const android = mobileSource(sheetPath);
    expect(android).toContain("dismissDisabled={busy}");
    expect(android).toContain("enablePanDownToClose={!busy}");
  });

  test("iOS is one system sheet on Liquid Glass, sized to the page on top, with one appearance source", () => {
    const source = mobileSource(iosSheetPath);

    expect(source).toContain("<SwiftBottomSheet");
    // Sized to the page on screen (list or pushed plugin) from heights
    // measured before it presents: one detent, never a fixed one. Half
    // folded like a laptop it never reaches past the hinge (the reader's cap).
    expect(source).toMatch(
      /fitSheetDetentToContent\(\{\s*group: READER_PLUGIN_SHEET_GROUP,\s*page: activePage,\s*height: fittedSheetDetentWithin\(sheet\.detent, maxSheetHeight\),\s*\}\)/,
    );
    expect(source).toContain("isPresented={sheet.presented}");
    expect(source).not.toContain("presentationDetents(");
    expect(source).toContain('presentationDragIndicator("visible")');
    // The pages are React Native, hosted in the sheet at its own scale.
    expect(source).toContain("<RNHostView compensatesPresentationScale");
    // iOS 26: the system's glass, under the veiled glass look (legible over
    // white and black pages); before it, a material.
    expect(source).toContain('const GLASS_LOOK: MobileSheetGlassLook = LIQUID_GLASS ? "tinted" : "opaque";');
    expect(source).toContain("<NemuGlassSheetThemeScope look={GLASS_LOOK}>");
    expect(source).toContain(
      '...(LIQUID_GLASS ? [] : [presentationBackground({ type: "material", material: "regular" })])',
    );
    // The presentation and the Host share the theme scope's scheme; no
    // separate colorScheme environment that could disagree with it.
    expect(source).toContain("presentationColorScheme(scheme)");
    expect(source).toContain("<SwiftHost colorScheme={scheme}");
    expect(source).not.toContain('environment("colorScheme"');
    // Push / pop slide on the sheet's own resize curve.
    expect(source).toContain("easing: mobileSheetSmoothEasing");
    expect(source).toContain("duration: reduceMotion ? 0 : MOBILE_SHEET_PAGE_TRANSITION_MS");
    // Both error surfaces, loading, reset and changes are wired.
    expect(source).toContain("{loadError ? (");
    expect(source).toContain("onActionPress={measuring ? noop : onRetryLoad}");
    expect(source).toContain("{error ? (");
    expect(source).toContain("strings.settings.loadingReaderPlugins");
    expect(source).toContain("onResetPlugin(plugin)");
    expect(source).toContain("onChangePluginValue(plugin, key, value)");
    expect(source).toContain("onBack={onClearSelectedPlugin}");
  });

  test("Android keeps the shared scaffold, bounded scrolling, and nested navigation", () => {
    const source = mobileSource(sheetPath);

    expect(source).toContain("<MobileNativeSheetScaffold");
    expect(source).toContain(
      "title={selectedPlugin ? selectedPlugin.name : strings.settings.plugins}",
    );
    expect(source).toContain("dismissLabel={strings.common.done}");
    expect(source).not.toContain("<Modal");
    expect(source).not.toContain("<MobileSheetBackdrop");
    expect(source).not.toContain("<GlassSurface");
    // One detent for both platforms; the scaffold maps it onto Android.
    expect(source).toContain('snapPoints={["86%"]}');
    expect(source).toContain("fillContent");
    expect(source).toContain("<ScrollView");
    expect(source).toContain("onPress={onClearSelectedPlugin}");
    expect(source).toContain("onHardwareBackPress={() => {");
    expect(source).toContain("{error ? (");
    expect(source).toContain("{loadError ? (");
  });

  test("keeps continuous and spread-aware scrub behavior wired at the screen", () => {
    const source = mobileSource("screens/ReaderScreen.tsx");

    expect(source).toContain(
      "onContinuousScrollMetricsChange={onReaderContinuousScrollMetricsChange}",
    );
    expect(source).toContain("pageIndex={visibleProgressPageIndex}");
    expect(source).toContain("scrubIndex={");
    expect(source).toMatch(/isTwoPageMode\s*\?\s*currentSpreadIndex/);
    expect(source).toContain("scrubCount={");
    expect(source).toMatch(
      /isTwoPageMode\s*\?\s*readerSpreads\.length\s*:\s*pageCount/,
    );
    expect(source).toContain("onScrubChange={goToReaderScrubIndex}");
    expect(source).toContain("onStep={stepReaderPage}");
    expect(source).toContain("spreadScrubbing={isTwoPageMode}");
    expect(source).toContain("<MobileReaderContinuousScrubber");
    expect(source).toContain("ref={readerContinuousScrubberRef}");
    expect(source).toContain(
      "initialMetrics={readerScrollMetricsRef.current}",
    );
    expect(source).toContain("interactionScopeKey={readerScrollMountKey}");
    expect(source).toContain("onScrollScrubStart={beginContinuousReaderScrub}");
    expect(source).toContain(
      "onScrollProgressChange={updateContinuousReaderScrub}",
    );
    expect(source).toContain("onScrollScrubEnd={finishContinuousReaderScrub}");
    expect(source).toContain(
      "onScrollScrubCancel={finishContinuousReaderScrub}",
    );
    expect(source).toContain("readerChromeAutoHideKeyRef.current = null;");
    expect(source).toMatch(
      /onContinuousAccessibilityStep=\{\s*stepContinuousReaderAccessibility\s*\}/,
    );
    expect(source).toContain(
      "readerContinuousScrubberRef.current?.updateMetrics(metrics);",
    );
    expect(source).not.toContain("readerScrollMetricsUpdateTimerRef");
    expect(source).not.toContain("readerScrollMetricsUpdatedAtRef");
    expect(source).toContain(
      "continuousContentIdentity={readerContinuousContentIdentity}",
    );
    // The user's column width re-keys the strip; stage geometry (fold, dock,
    // rail) never does — the mounted gallery keeps its reading progress.
    expect(source).toContain("`scrolling:${activeScrollWidthPct}`");
    expect(source).not.toContain(
      'scrolling:${Math.round(readerImageWidth)}:${Math.round(readerStageHeight)}',
    );
    expect(source).toContain("readerScrollMetricsResetKey({");
    expect(source).toContain("}, [readerScrollMetricsScopeKey]);");
    const gallery = mobileSource(
      "components/reader/MobileReaderGallery.tsx",
    );
    expect(gallery).toContain(
      "contentSizeProgress == null && progress == null",
    );
    expect(gallery).toContain("strings.reader.nextSpread");
    expect(gallery).toContain("strings.reader.previousSpread");
    expect(gallery).toContain("scrollEventThrottle={16}");
    const continuousScrubber = mobileSource(
      "components/MobileReaderContinuousScrubber.tsx",
    );
    expect(continuousScrubber).toContain("useImperativeHandle(");
    expect(continuousScrubber).toContain("continuousScroll");
    expect(continuousScrubber).toContain("scrollProgress={metrics.progress}");
    const scrubber = mobileSource("components/MobileReaderScrubber.tsx");
    expect(scrubber).toContain("readerScrubberInteractionScopeKey({");
    expect(scrubber).toContain("disabled,");
    expect(scrubber).toContain("const scrubInteractionToken = useMemo(");
    expect(scrubber).toContain(
      "dragProgressState?.token === scrubInteractionToken",
    );
    expect(scrubber).toContain("pendingScrollProgressRef.current = null;");
    expect(scrubber).toContain("oldContinuousDragWasActive");
    expect(scrubber).toContain("onScrollScrubCancelRef.current?.();");
    expect(gallery).toContain("pendingScrollToIndexRef.current = null;");
    expect(gallery).toContain("pendingLogicalScrollProgressRef.current = null;");
    expect(gallery).toContain(
      "pendingContentSizeScrollProgressRef.current = null;",
    );
    expect(gallery).toContain("onUserScrollBegin?.();");
    expect(gallery).toContain("gestureDelta: touch.pageY - start.y");
    // User touch still supersedes queued programmatic scrolls; scroll mode
    // additionally holds the visible page until the scroll settles.
    expect(source).toContain("onUserScrollBegin={beginReaderUserScroll}");
    expect(source).toMatch(
      /const beginReaderUserScroll = useCallback\(\(\) => \{\s*clearReaderProgrammaticScroll\(\);/,
    );
    expect(source).toContain("onUserScrollSettle={settleReaderUserScroll}");
    expect(source).toContain(
      "readerScrollMetrics.contentLength > 0",
    );
  });

  test("serializes reader surface handoffs at native dismissal boundaries", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const display = mobileSource(
      "components/reader/ReaderDisplaySettingsPopover.tsx",
    );
    const launcher = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningPluginLauncherSheet.tsx",
    );
    const transcript = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningTranscriptSheet.tsx",
    );

    expect(display).toContain(
      'onDismiss={Platform.OS === "ios" ? notifyDismissComplete : undefined}',
    );
    expect(display).toContain(
      'Platform.OS === "android" && !visible',
    );
    expect(display).toContain("dismissPendingRef.current = false;");
    // The React Native popover's (Android, fallback) "Plugins" row is its way
    // into the plugin settings sheet; that sheet presents only after the
    // popover's native dismissal completes (see the dedicated wiring test
    // below). The iOS native settings push it instead (test below).
    expect(screen).toContain(
      "onDismissComplete={handleReaderDisplaySettingsDismissed}",
    );
    expect(screen).not.toContain('"plugin-settings"');
    expect(screen).toContain(
      "japaneseLearningLauncherNextSurfaceRef.current = surface;",
    );
    expect(screen).toContain(
      "if (japaneseLearningLauncherNextSurfaceRef.current) return;",
    );
    expect(screen).toContain(
      "onDismiss={handleJapaneseLearningLauncherClosed}",
    );
    expect(screen).toContain(
      'japaneseLearningTranscriptNextSurfaceRef.current = "ocr";',
    );
    expect(screen).toContain(
      "if (japaneseLearningTranscriptNextSurfaceRef.current) return;",
    );
    expect(screen).toContain(
      "onDismiss={handleJapaneseLearningTranscriptClosed}",
    );
    expect(screen).not.toMatch(
      /setReaderDisplaySettingsOpen\(false\);\s*setActiveReaderPluginId\(null\);\s*setReaderPluginSettingsOpen\(true\)/,
    );
    expect(screen).not.toMatch(
      /setJapaneseLearningLauncherVisible\(false\);\s*setJapaneseLearningTranscriptVisible\(true\)/,
    );
    expect(screen).not.toMatch(
      /setJapaneseLearningTranscriptVisible\(false\);\s*setJapaneseLearningOcrSheetVisible\(true\)/,
    );
    expect(launcher).toContain("onDismiss={onDismiss}");
    expect(transcript).toContain("onDismiss={onDismiss}");
  });

  test("the reader settings popover opens the reader plugin settings sheet", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const display = mobileSource(
      "components/reader/ReaderDisplaySettingsPopover.tsx",
    );

    // The sheet is rendered, and something in the reader actually opens it.
    expect(screen).toContain("<ReaderPluginSettingsSheet");
    // Three openers: the popover handoff, the QA-only panel switch, and the ⋯ menu's Plugins… item
    expect(
      screen.match(/setReaderPluginSettingsOpen\(true\)/g) ?? [],
    ).toHaveLength(3);
    const qaStart = screen.indexOf('else if (MOBILE_READER_QA_PANEL === "plugins") {');
    expect(qaStart).toBeGreaterThan(-1);
    expect(
      screen.slice(qaStart, screen.indexOf("} else if", qaStart)),
    ).toContain("setReaderPluginSettingsOpen(true);");

    // That one call runs from the popover's dismissal-complete callback, and
    // only for a dismissal the Plugins row asked for.
    const handoffStart = screen.indexOf(
      "const handleReaderDisplaySettingsDismissed = useCallback(",
    );
    expect(handoffStart).toBeGreaterThan(-1);
    const handoff = screen.slice(handoffStart, screen.indexOf("}, []);", handoffStart));
    expect(handoff).toContain(
      "if (!openReaderPluginSettingsAfterDisplaySettingsRef.current) return;",
    );
    expect(handoff).toContain("setSelectedReaderPluginSettingsId(null);");
    expect(handoff).toContain("setReaderPluginSettingsOpen(true);");

    const openStart = screen.indexOf(
      "const openReaderPluginSettingsFromDisplaySettings = useCallback(",
    );
    expect(openStart).toBeGreaterThan(-1);
    const open = screen.slice(openStart, screen.indexOf("}, [", openStart));
    expect(open).toContain(
      "openReaderPluginSettingsAfterDisplaySettingsRef.current = true;",
    );
    expect(open).toContain("setReaderDisplaySettingsOpen(false);");
    expect(open).not.toContain("setReaderPluginSettingsOpen(true)");

    // A plain close clears a pending handoff instead of opening the sheet.
    expect(screen).toMatch(
      /const closeReaderDisplaySettings = useCallback\(\(\) => \{\s*openReaderPluginSettingsAfterDisplaySettingsRef\.current = false;/,
    );

    // The popover is wired to both ends of the handoff on every platform.
    const popoverStart = screen.indexOf("<ReaderDisplaySettingsPopover");
    const popover = screen.slice(popoverStart, screen.indexOf("/>", popoverStart));
    expect(popover).toContain(
      "onDismissComplete={handleReaderDisplaySettingsDismissed}",
    );
    expect(popover).toContain(
      "showReaderPluginSettings={showReaderPluginSettingsEntry}",
    );
    expect(popover).toContain(
      "onOpenReaderPluginSettings={openReaderPluginSettingsFromDisplaySettings}",
    );
    expect(screen).toContain(
      "readerPlugins.data.length > 0 || Boolean(readerPlugins.error);",
    );

    // …and renders a pressable Plugins row that calls it.
    expect(display).toContain(
      "{showReaderPluginSettings && onOpenReaderPluginSettings ? (",
    );
    expect(display).toContain("onPress={onOpenReaderPluginSettings}");
    expect(display).toContain("title={strings.settings.plugins}");
    expect(display).not.toContain('Platform.OS === "ios" && showReaderPluginSettings');
  });

  test("iOS native reader settings push Plugins in their own stack: no hand-off, one close", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const native = mobileSource(nativeSettingsPath);

    // The screen hands the plugin state to the native settings, and no
    // dismiss-then-present callbacks.
    const start = screen.indexOf("<ReaderSettingsNativePopover");
    expect(start).toBeGreaterThan(-1);
    const props = screen.slice(start, screen.indexOf("anchor={readerSettingsAnchorRect}", start));
    expect(props).not.toContain("onDismissComplete");
    expect(props).not.toContain("onOpenReaderPluginSettings");
    expect(props).toContain("showReaderPluginSettings={showReaderPluginSettingsEntry}");
    expect(props).toContain("readerPlugins={{");
    expect(props).toContain("onTogglePlugin: toggleReaderPluginSetting,");
    expect(native).not.toContain("onOpenReaderPluginSettings");
    expect(native).not.toContain("onDismissComplete");

    // The Plugins row is a NavigationLink (the system chevron), pushing a
    // destination of the same controlled stack in the sheet and the popover.
    expect(native).toContain("<SwiftNavigationLink value={READER_SETTINGS_PLUGINS_PAGE}");
    expect(native).toContain("<SwiftNavigationDestination value={READER_SETTINGS_PLUGINS_PAGE}>");
    expect(native).toContain("<SwiftNavigationDestination value={readerPluginSheetPage(detailPlugin.id)}>");
    expect(native.match(/<SwiftNavigationStack path=\{path\} onPathChange=\{onPathChange\}/g) ?? []).toHaveLength(2);
    expect(native.match(/\{pluginDestinations\}/g) ?? []).toHaveLength(2);
    // The pushed pages' ✕ is the root's toolbar close button, closing the
    // whole sheet (the system back sits on the left).
    const pushed = native.slice(native.indexOf("const pushedPage = ("), native.indexOf("const pluginDestinations ="));
    expect(pushed).toContain('<SwiftButton role="close" onPress={onClose}');
    expect(native.match(/role="close"/g) ?? []).toHaveLength(2);
    // A push or pop never resizes the presentation (a system sheet's push):
    // the pushed pages report no height and are not measured; they scroll in
    // the Reader page's fitted detent, which the user can drag to large.
    expect(pushed).not.toContain("reportSheetContentHeight(");
    expect(native).not.toContain("ReaderPluginSheetMeasuringCopies");
    expect(native).toMatch(
      /fitSheetDetentToContent\(\{\s*group: READER_SETTINGS_SHEET_GROUP,\s*page: READER_SETTINGS_SHEET_PAGE,\s*initialHeight: sheetEstimate,\s*height: sheetCap,\s*expandable: sheetCap === 0 && maxSheetHeight == null,\s*\}\)/,
    );
    // The hosted page takes the page's width (never a width JS learned) and
    // its own height, so its groups' edges are the Form's.
    // A new width re-lays the rows out (keyed inside the host), never the
    // host itself: a re-keyed host lost its hosted view (blank page).
    expect(pushed).toContain("<RNHostView matchContents={PUSHED_PAGE_MATCH_CONTENTS}>");
    expect(pushed).toContain("<NemuGlassSheetThemeScope key={pushedPageWidthKey(pushedPageWidth)} look={PUSHED_PAGE_LOOK}>");
    expect(pushed).not.toMatch(/<RNHostView[^>]*\bkey=/);
    expect(native).toContain("const PUSHED_PAGE_MATCH_CONTENTS = { vertical: true } as const;");
    expect(native).not.toContain("onGeometryChange");
    // The groups sit on the Form's own margins as the presented Form drew
    // them (16pt on the Duo's sheet, 20pt on a Pro Max's), the iPhone default
    // until it has reported; never the off-screen copy's.
    const ios = mobileSource(iosSheetPath);
    expect(ios).toContain("paddingHorizontal: READER_SETTINGS_FORM_INSET,");
    expect(ios).toContain("stackInset ? { paddingLeft: stackInset.left, paddingRight: stackInset.right } : null,");
    expect(native).toContain("{renderSettingsSections([reportFormGroupInset(learnFormGroupInset)])}");
    expect(native).toContain("const settingsSections = renderSettingsSections([]);");
    expect(native.match(/stackInset=\{pushedPageInset\}/g) ?? []).toHaveLength(2);
    // …and lays the page out at a definite width this presentation's stack
    // reported (the Form, or the pushed page's own probe after a rotation),
    // never a cached or JS-guessed one: no content until then, and a new
    // width remounts the host (keyed), so no row keeps a stale text layout.
    expect(native).toContain("const [pushedPageWidth, setPushedPageWidth] = useState<number | null>(null);");
    expect(native).toContain("if (visible && pushedPageWidth !== null) setPushedPageWidth(null);");
    expect(native).toContain("learnPushedPageWidth(inset.width);");
    expect(pushed).toContain("reportPageWidth(learnPushedPageWidth)");
    expect(pushed).toContain("{pushedPageWidth !== null ? (");
    expect(pushed).toContain("style={[styles.pushedPage, { width: pushedPageWidth }]}");
    expect(native).not.toContain("formGroupInset.width");
    // No outline around the plugin group: the Form's groups have none.
    const stackGroup = ios.slice(ios.indexOf("  stackGroup: {"), ios.indexOf("},", ios.indexOf("  stackGroup: {")));
    expect(stackGroup).not.toContain("borderWidth");
    expect(ios).toContain("<View style={[styles.stackGroup, { backgroundColor: tokens.card }]}>");
    // The plugin's own page drops its cards' outline in the stack too (its
    // on / off row and the settings card); the sheet and Settings keep it.
    const detail = ios.slice(ios.indexOf("export function ReaderPluginDetailPage"), ios.indexOf("const ReaderPluginSheetMeasuringCopies"));
    expect(detail.split('outlined={chrome !== "stack"}').length - 1).toBe(2);
    expect(mobileSource(rowsPath)).toContain("outlined ? null : styles.bareRow,");
    expect(mobileSource("components/MobileSourceSettingsCard.tsx")).toContain("outlined ? null : styles.settingsShellBare,");
    expect(mobileSource(contentPath)).toContain("outlined={outlined}");
  });

  test("keeps vertical scrolling native and paging props paged-only", () => {
    const source = mobileSource(
      "components/reader/MobileReaderGallery.tsx",
    );

    expect(source).toContain("bounces={!pagedMode}");
    expect(source).toContain("alwaysBounceVertical={!pagedMode}");
    expect(source).toContain("const pagingBehaviorProps = pagedMode");
    expect(source).toContain("{...pagingBehaviorProps}");
    expect(source).toContain("contentLength: contentSize.height");
    expect(source).toContain("contentLength: height,");
    expect(source).not.toContain("contentSize.height - bottomPadding");
    expect(source).not.toContain("height - bottomPadding");
    expect(source).not.toContain("pagingEnabled={pagedMode}");
    expect(source).not.toContain("snapToInterval={pagedMode ?");
    expect(source).not.toContain("disableIntervalMomentum={pagedMode}");
  });

  test("keeps reader plugin hosts stable and actions honest", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const root = mobileSource("components/MobileDualReaderRoot.tsx");
    const ocr = mobileSource(
      "components/reader/japaneseLearning/JapaneseLearningOcrResultSheet.tsx",
    );

    expect(screen).toContain("japaneseLearningPresentationPluginRef");
    expect(screen).toContain("{japaneseLearningPresentationPlugin ? (");
    expect(screen).toContain("<MobileDualReaderRoot");
    // Bilingual side by side shows both pages, so the toggle/peek FAB hides.
    expect(screen).toContain(
      "showFloatingControls={dualReaderControlsAvailable && !bilingualSideBySide}",
    );
    expect(screen).toContain("disabled={!dualReaderControlsAvailable}");
    expect(root).toContain("<MobileDualReaderConfigSheet />");
    expect(root).toContain("{showFloatingControls ? (");
    expect(screen).toContain('japaneseLearningOcrState.status === "ready"');
    expect(screen).toContain("mobileJapaneseLearningSentenceText(");
    expect(ocr).toContain('accessibilityRole="alert"');
    expect(ocr).toContain('accessibilityLiveRegion="assertive"');
  });

  test("pauses and rearms initial chrome auto-hide around reader surfaces", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");
    const guardIndex = screen.indexOf("if (readerInteractionSurfaceOpen) return;");
    const timeoutIndex = screen.indexOf("const timeout = setTimeout", guardIndex);
    const claimIndex = screen.indexOf(
      "readerChromeAutoHideKeyRef.current = readerChromeAutoHideKey;",
      timeoutIndex,
    );

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(timeoutIndex).toBeGreaterThan(guardIndex);
    expect(claimIndex).toBeGreaterThan(timeoutIndex);
    expect(screen).toContain(
      "readerInteractionSurfaceOpen || cloudflareSheet.visible",
    );
  });

  test("every page is measured off screen before the sheet presents", () => {
    const source = mobileSource(iosSheetPath);
    const copiesUse = source.indexOf("<ReaderPluginSheetMeasuringCopies");
    const host = source.indexOf("<SwiftHost colorScheme={scheme}");
    // Outside the presentation, ahead of it.
    expect(copiesUse).toBeGreaterThan(-1);
    expect(copiesUse).toBeLessThan(host);
    // It presents only once the page on top is measured.
    expect(source).toContain("const next = fittedSheetPresentation({");

    const start = source.indexOf("const ReaderPluginSheetMeasuringCopies = memo(");
    const end = source.indexOf("const styles = StyleSheet.create(", start);
    const copies = source.slice(start, end);
    // The list and each plugin's page.
    expect(copies).toContain("onLayout={measure(READER_PLUGIN_SHEET_LIST_PAGE)}");
    expect(copies).toContain("onLayout={measure(readerPluginSheetPage(plugin.id))}");
    expect(copies).toContain("<ReaderPluginListPage");
    expect(copies).toContain("<ReaderPluginDetailPage");
    // Memoised on what changes a page's height: opening the sheet (or a busy
    // flag, or new handlers) does not re-render them mid-presentation.
    expect(copies).not.toContain("visible");
    expect(copies).not.toContain("busy={busy}");
    expect(copies).not.toContain("onTogglePlugin={onTogglePlugin}");
    // A copy of the dictionary row never starts a second download.
    expect(source).toContain("inert={measuring}");
    expect(mobileSource(contentPath)).toContain("autoInstall={!inert}");
    expect(mobileSource("components/useMobileJapaneseLearningDictionaryRowModel.ts")).toContain(
      "autoInstall &&",
    );
  });

  test("presentation modifiers sit on the sheet's root, never on the hosted pages", () => {
    const source = mobileSource(iosSheetPath);
    const group = source.indexOf("<SwiftGroup", source.indexOf("<SwiftBottomSheet"));
    const hosted = source.indexOf("<RNHostView", group);
    const root = source.slice(group, hosted);

    expect(root).toContain("presentationBackground(");
    expect(root).toContain("presentationColorScheme(scheme)");
    expect(source.slice(hosted)).not.toContain("presentationBackground(");
  });
});
