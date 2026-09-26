import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readerPluginSettingsSheetSource(): string {
  const source = readFileSync(
    path.join(import.meta.dir, "..", "screens", "ReaderScreen.tsx"),
    "utf8",
  );
  const start = source.indexOf("function ReaderPluginSettingsSheet(");
  const end = source.indexOf("\nexport function ReaderScreen()", start);
  return source.slice(start, end);
}

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

describe("reader plugin settings sheet policy", () => {
  test("uses shared native chrome and one guarded dismissal policy", () => {
    const source = readerPluginSettingsSheetSource();

    expect(source).toContain("<MobileNativeSheetScaffold");
    expect(source).toContain("title={strings.settings.plugins}");
    expect(source).toContain("subtitle={strings.settings.pluginsDescription}");
    expect(source).toContain("dismissLabel={strings.common.done}");
    expect(source).toContain("dismissDisabled={busy}");
    expect(source).toContain("enablePanDownToClose={!busy}");
    expect(source).not.toContain("<Modal");
    expect(source).not.toContain("<MobileSheetBackdrop");
    expect(source).not.toContain("<GlassSurface");
  });

  test("keeps bounded scrolling, nested navigation, and both error surfaces", () => {
    const source = readerPluginSettingsSheetSource();

    // One detent for both platforms; the scaffold maps it onto Android.
    expect(source).toContain('snapPoints={["86%"]}');
    expect(source).toContain("fillContent");
    expect(source).toContain("<ScrollView");
    expect(source).toContain("onPress={onClearSelectedPlugin}");
    expect(source).toContain("navigationResetKey={selectedPlugin.id}");
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
    expect(source).toContain(
      'scrolling:${Math.round(readerImageWidth)}:${Math.round(window.height)}',
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
    expect(
      screen.match(/setReaderPluginSettingsOpen\(true\)/g) ?? [],
    ).toHaveLength(1);

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
    expect(screen).toContain("showFloatingControls={dualReaderControlsAvailable}");
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
});
