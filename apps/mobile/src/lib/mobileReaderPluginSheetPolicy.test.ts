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

    expect(source).toContain('snapPoints={Platform.OS === "android"');
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
      "onContinuousScrollMetricsChange={\n          onReaderContinuousScrollMetricsChange\n        }",
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
    expect(screen).toContain(
      "readerDisplaySettingsNextSheetRef.current = \"plugin-settings\";",
    );
    expect(screen).toContain(
      "onDismissComplete={handleReaderDisplaySettingsDismissed}",
    );
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
