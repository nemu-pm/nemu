import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

const iosSheetPath = "components/reader/ReaderPluginSettingsSheet.ios.tsx";
const sheetPath = "components/reader/ReaderPluginSettingsSheet.tsx";

describe("reader plugin settings sheet policy", () => {
  test("lives in its own platform files and the reader only renders it", () => {
    const screen = mobileSource("screens/ReaderScreen.tsx");

    expect(screen).toContain(
      'import { ReaderPluginSettingsSheet } from "@/components/reader/ReaderPluginSettingsSheet";',
    );
    expect(screen).not.toContain("function ReaderPluginSettingsSheet(");
    for (const source of [mobileSource(iosSheetPath), mobileSource(sheetPath)]) {
      expect(source).toContain("}: ReaderPluginSettingsSheetProps) {");
      // One row per plugin: no separate gear button, no uppercase meta line.
      expect(source).not.toContain("settings-outline");
      expect(source).not.toContain('textTransform: "uppercase"');
      expect(source).toContain("mobileReaderPluginRowSubtitle(plugin, strings)");
    }
  });

  test("one guarded dismissal policy: no dismissing while a save is in flight", () => {
    const ios = mobileSource(iosSheetPath);
    expect(ios).toContain("interactiveDismissDisabled(busy)");
    // The Done button is disabled with the rest of the controls.
    expect(ios).toMatch(
      /onPress=\{onClose\}\s*modifiers=\{\[swiftAccessibilityLabel\(strings\.common\.done\), \.\.\.busyModifiers\]\}/,
    );
    expect(ios).toContain("const busyModifiers = busy ? [swiftDisabled(true)] : [];");

    const android = mobileSource(sheetPath);
    expect(android).toContain("dismissDisabled={busy}");
    expect(android).toContain("enablePanDownToClose={!busy}");
  });

  test("iOS is a system sheet with a navigation stack and one appearance source", () => {
    const source = mobileSource(iosSheetPath);

    expect(source).toContain("<SwiftBottomSheet");
    // Sized to the page on screen (list or pushed plugin), not a fixed
    // detent, from heights measured before it presents.
    expect(source).toMatch(
      /fitSheetDetentToContent\(\{\s*group: READER_PLUGIN_SHEET_GROUP,\s*page: readerPluginSheetActivePage\(selectedPlugin\?\.id \?\? null\),\s*\}\)/,
    );
    expect(source).not.toContain("presentationDetents(");
    expect(source).toContain('presentationDragIndicator("visible")');
    expect(source).toContain('placement="cancellationAction"');
    expect(source).toContain('role="close"');
    // Inline titles (no empty large-title row above the first section).
    // Each page says which measured page it is, so the sheet resizes with
    // the push / pop that shows it.
    expect(source).toMatch(
      /navigationTitle\(strings\.settings\.plugins\),\s*inlineToolbarTitle\(\),\s*reportSheetContentHeight\(\{ page: READER_PLUGIN_SHEET_LIST_PAGE \}\)/,
    );
    expect(source).toMatch(
      /navigationTitle\(plugin\.name\),\s*inlineToolbarTitle\(\),\s*reportSheetContentHeight\(\{ page: readerPluginSheetPage\(plugin\.id\) \}\)/,
    );
    // Plugin rows push the plugin's settings on the sheet's own stack.
    expect(source).toContain("<SwiftNavigationStack");
    expect(source).toContain("path={path}");
    expect(source).toContain("<SwiftNavigationLink value={plugin.id}>");
    expect(source).toContain("<SwiftNavigationDestination key={plugin.id} value={plugin.id}>");
    expect(source).toContain("onClearSelectedPlugin()");
    expect(source).toContain("labelsHidden()");
    // The presentation and the Host share the theme scope's scheme; no
    // separate colorScheme environment that could disagree with it.
    expect(source).toContain("presentationColorScheme(scheme)");
    expect(source).toContain("<SwiftHost colorScheme={scheme}");
    expect(source).not.toContain('environment("colorScheme"');
    // Both error surfaces, loading, and a destructive reset stay native.
    expect(source).toContain("{loadError");
    expect(source).toContain("onPress={onRetryLoad}");
    expect(source).toContain("{error");
    expect(source).toContain("strings.settings.loadingReaderPlugins");
    expect(source).toContain('role="destructive"');
    expect(source).toContain("onResetPlugin(plugin)");
    expect(source).toContain("onChangePluginValue(plugin, key, value)");
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
    expect(source).toContain("navigationResetKey={plugin.id}");
    expect(source).toContain("{error ? (");
    expect(source).toContain("{loadError ? (");
    // The switch sits centred on the row, beside (not inside) its press target.
    expect(source).toMatch(/row: \{\s*flexDirection: "row",\s*alignItems: "center",/);
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
    expect(source).toContain(
      "onUserScrollBegin={clearReaderProgrammaticScroll}",
    );
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
    // The popover's "Plugins" row is the in-reader way into the plugin
    // settings sheet; that sheet presents only after the popover's native
    // dismissal completes (see the dedicated wiring test below).
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
    // Two openers: the popover handoff, and the QA-only panel switch.
    expect(
      screen.match(/setReaderPluginSettingsOpen\(true\)/g) ?? [],
    ).toHaveLength(2);
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
    const host = source.indexOf("<SwiftHost colorScheme={scheme}");
    const sheet = source.indexOf("<SwiftBottomSheet", host);
    expect(source.slice(host, sheet)).toContain("<ReaderPluginSheetMeasuringCopies");

    const start = source.indexOf("const ReaderPluginSheetMeasuringCopies = memo(");
    const end = source.indexOf("function ReaderPluginErrorSections(", start);
    const copies = source.slice(start, end);
    // The list and each plugin's page, outside the presentation.
    expect(copies).toContain(
      "measureSheetPage({ group: READER_PLUGIN_SHEET_GROUP, page: READER_PLUGIN_SHEET_LIST_PAGE, width, height })",
    );
    expect(copies).toContain("page: readerPluginSheetPage(plugin.id)");
    expect(copies).toContain("<ReaderPluginListSections");
    expect(copies).toContain("<ReaderPluginDetail");
    // Memoised on what changes a page's height: opening the sheet (or a busy
    // flag, or new handlers) does not re-render them mid-presentation.
    expect(copies).not.toContain("visible");
    expect(copies).not.toContain("busy={busy}");
    expect(copies).not.toContain("onTogglePlugin={onTogglePlugin}");
    // The copies carry no presentation modifiers (they would restyle the window).
    expect(copies).not.toContain("presentationColorScheme(");
    expect(copies).not.toContain("presentationBackground(");
    // A copy of the dictionary row never starts a second download.
    expect(source).toContain("inert={Boolean(measure)}");
    expect(source).toContain("autoInstall: !inert,");
  });

  test("presentation modifiers sit on the sheet's root, never inside its navigation stack", () => {
    const source = mobileSource(iosSheetPath);
    const group = source.indexOf("<SwiftGroup", source.indexOf("<SwiftBottomSheet"));
    const stack = source.indexOf("<SwiftNavigationStack", group);
    const root = source.slice(group, stack);

    expect(root).toContain("presentationBackground(");
    expect(root).toContain("presentationColorScheme(scheme)");
    expect(source.slice(stack)).not.toContain("presentationBackground(");
  });
});
