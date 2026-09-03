import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { InstalledSource } from "@/data/schema";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  buildMobileWelcomeInstalledSourceKeySet,
  canRunMobileWelcomePrimaryAction,
  canRunMobileWelcomeSkipAction,
  canSelectMobileWelcomeLanguageOption,
  createMobileWelcomeCompletionWriteCoordinator,
  getMobileWelcomeAvailableSources,
  getMobileWelcomeDefaultSelection,
  getMobileWelcomePendingSourceInstallCount,
  getMobileWelcomeSourceStepLayout,
  getMobileWelcomeUnderlyingContentState,
  getMobileWelcomeRecommendedSources,
  mobileWelcomeSourceKey,
  shouldScrollMobileWelcomeContent,
  shouldBlockMobileWelcomeUnderlyingContent,
  shouldUseContentSizedMobileWelcomeSheet,
  shouldStackMobileWelcomeActions,
  resolveMobileWelcomeNativeSheetPresentation,
  MOBILE_WELCOME_ANDROID_SNAP_POINTS,
  MOBILE_WELCOME_ICON_SIZE,
  MOBILE_WELCOME_SOURCE_LIST_MIN_HEIGHT,
  MOBILE_WELCOME_SOURCE_PLACEHOLDER_HEIGHT,
  MOBILE_WELCOME_SOURCE_SHEET_CHROME_HEIGHT,
  MOBILE_WELCOME_SOURCE_SHEET_MAX_HEIGHT,
} from "./mobileWelcome";

function source(registryId: string, id: string, name = id): MobileRegistrySource {
  return {
    id,
    registryId,
    registryName: registryId,
    name,
    version: 1,
  };
}

function installedSource(
  id: string,
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
  return {
    id,
    registryId: "aidoku-community",
    version: 1,
    ...overrides,
  };
}

describe("mobile welcome helpers", () => {
  test("matches the production web icon size and narrow action breakpoint", () => {
    expect(MOBILE_WELCOME_ICON_SIZE).toBe(80);
    expect(shouldStackMobileWelcomeActions(390)).toBe(true);
    expect(shouldStackMobileWelcomeActions(767)).toBe(true);
    expect(shouldStackMobileWelcomeActions(768)).toBe(false);
  });

  test("coalesces successful completion writes and only retries failures", async () => {
    const coordinator = createMobileWelcomeCompletionWriteCoordinator();
    let writeCount = 0;
    let resolveFirstWrite: (() => void) | undefined;
    const firstWriteResult = new Promise<void>((resolve) => {
      resolveFirstWrite = resolve;
    });

    const first = coordinator.run(() => {
      writeCount += 1;
      return firstWriteResult;
    });
    const concurrent = coordinator.run(async () => {
      writeCount += 1;
    });

    expect(concurrent).toBe(first);
    expect(writeCount).toBe(1);
    resolveFirstWrite?.();
    await first;

    const afterSuccess = coordinator.run(async () => {
      writeCount += 1;
    });
    expect(afterSuccess).toBe(first);
    await afterSuccess;
    expect(writeCount).toBe(1);

    const retryCoordinator = createMobileWelcomeCompletionWriteCoordinator();
    await expect(
      retryCoordinator.run(async () => {
        writeCount += 1;
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");
    await retryCoordinator.run(async () => {
      writeCount += 1;
    });
    expect(writeCount).toBe(3);
  });

  test("keeps every native onboarding step reachable at large text sizes", () => {
    for (const step of ["welcome", "language", "sources", "done"] as const) {
      expect(shouldScrollMobileWelcomeContent({ platform: "android", step })).toBe(true);
      expect(shouldScrollMobileWelcomeContent({ platform: "ios", step })).toBe(true);
    }
    expect(
      shouldScrollMobileWelcomeContent({ platform: "web", step: "welcome" }),
    ).toBe(false);
    expect(
      shouldScrollMobileWelcomeContent({ platform: "web", step: "sources" }),
    ).toBe(true);
  });

  test("content-sizes short iOS steps only when the viewport can safely fit them", () => {
    for (const step of ["welcome", "language", "done"] as const) {
      expect(
        shouldUseContentSizedMobileWelcomeSheet({
          platform: "ios",
          step,
          fontScale: 1,
          availableHeight: 800,
        }),
      ).toBe(true);
    }

    expect(
      shouldUseContentSizedMobileWelcomeSheet({
        platform: "ios",
        step: "sources",
        fontScale: 1,
        availableHeight: 800,
      }),
    ).toBe(false);
    expect(
      shouldUseContentSizedMobileWelcomeSheet({
        platform: "ios",
        step: "welcome",
        fontScale: 1.6,
        availableHeight: 800,
      }),
    ).toBe(false);
    expect(
      shouldUseContentSizedMobileWelcomeSheet({
        platform: "ios",
        step: "welcome",
        fontScale: 1,
        availableHeight: 519,
      }),
    ).toBe(false);
    expect(
      shouldUseContentSizedMobileWelcomeSheet({
        platform: "android",
        step: "welcome",
        fontScale: 1,
        availableHeight: 800,
      }),
    ).toBe(false);
  });

  test("keeps one stable guarded Material sheet presentation across Android steps", () => {
    const welcome = resolveMobileWelcomeNativeSheetPresentation({
      platform: "android",
      step: "welcome",
      fontScale: 1,
      availableHeight: 800,
      nativeSheetHeight: 520,
    });
    const sources = resolveMobileWelcomeNativeSheetPresentation({
      platform: "android",
      step: "sources",
      fontScale: 1.8,
      availableHeight: 430,
      nativeSheetHeight: 410,
    });

    expect(welcome.snapPoints).toBe(MOBILE_WELCOME_ANDROID_SNAP_POINTS);
    expect(sources.snapPoints).toBe(MOBILE_WELCOME_ANDROID_SNAP_POINTS);
    expect(welcome.snapPoints).toEqual(["50%", "100%"]);
    expect(welcome.scroll).toBe(true);
    expect(sources.scroll).toBe(true);
    // Material only exposes partial/expanded detents, so the source list can
    // never be pinned against an exact sheet height there.
    expect(welcome.boundSourceList).toBe(false);
    expect(sources.boundSourceList).toBe(false);
    expect(welcome.enablePanDownToClose).toBe(false);
  });

  test("preserves fitted and scrollable detent behavior on iOS", () => {
    expect(
      resolveMobileWelcomeNativeSheetPresentation({
        platform: "ios",
        step: "welcome",
        fontScale: 1,
        availableHeight: 800,
        nativeSheetHeight: 520,
      }),
    ).toEqual({
      boundSourceList: false,
      enablePanDownToClose: false,
      scroll: false,
      snapPoints: undefined,
    });
    expect(
      resolveMobileWelcomeNativeSheetPresentation({
        platform: "ios",
        step: "sources",
        fontScale: 1,
        availableHeight: 800,
        nativeSheetHeight: 620,
      }),
    ).toEqual({
      boundSourceList: true,
      enablePanDownToClose: false,
      scroll: false,
      snapPoints: [620],
    });
  });

  test("keeps the iOS source step pinned and scrolls only for banners", () => {
    const pinned = resolveMobileWelcomeNativeSheetPresentation({
      platform: "ios",
      step: "sources",
      fontScale: 1,
      availableHeight: 800,
      nativeSheetHeight: 480,
    });
    const recovering = resolveMobileWelcomeNativeSheetPresentation({
      platform: "ios",
      step: "sources",
      fontScale: 1,
      availableHeight: 800,
      nativeSheetHeight: 480,
      bannerVisible: true,
    });

    expect(pinned.boundSourceList).toBe(true);
    expect(pinned.scroll).toBe(false);
    // An unbudgeted recovery banner must stay reachable, so the whole sheet
    // falls back to scrolling.
    expect(recovering.boundSourceList).toBe(false);
    expect(recovering.scroll).toBe(true);
    expect(recovering.snapPoints).toEqual([480]);
  });

  test("sizes the source step so only its list scrolls", () => {
    const threeRows = getMobileWelcomeSourceStepLayout({
      rowCount: 3,
      bottomInset: 34,
      availableHeight: 800,
    });

    expect(threeRows.contentBottomInset).toBe(34);
    // 3 * 61 + 2 * 8
    expect(threeRows.listHeight).toBe(199);
    expect(threeRows.sheetHeight).toBe(
      MOBILE_WELCOME_SOURCE_SHEET_CHROME_HEIGHT + 199 + 34,
    );

    const placeholder = getMobileWelcomeSourceStepLayout({
      rowCount: 0,
      bottomInset: 0,
      availableHeight: 800,
    });
    expect(placeholder.contentBottomInset).toBe(18);
    expect(placeholder.listHeight).toBe(
      MOBILE_WELCOME_SOURCE_PLACEHOLDER_HEIGHT,
    );
  });

  test("shrinks the source list instead of the pinned actions", () => {
    const clamped = getMobileWelcomeSourceStepLayout({
      rowCount: 8,
      bottomInset: 34,
      availableHeight: 420,
    });

    expect(clamped.sheetHeight).toBe(420);
    expect(clamped.listHeight).toBe(
      420 - MOBILE_WELCOME_SOURCE_SHEET_CHROME_HEIGHT - 34,
    );

    const tiny = getMobileWelcomeSourceStepLayout({
      rowCount: 8,
      bottomInset: 34,
      availableHeight: 240,
    });
    expect(tiny.listHeight).toBe(MOBILE_WELCOME_SOURCE_LIST_MIN_HEIGHT);

    const huge = getMobileWelcomeSourceStepLayout({
      rowCount: 20,
      bottomInset: 34,
      availableHeight: 2000,
    });
    expect(huge.sheetHeight).toBe(MOBILE_WELCOME_SOURCE_SHEET_MAX_HEIGHT);
    expect(huge.listHeight).toBe(
      MOBILE_WELCOME_SOURCE_SHEET_MAX_HEIGHT -
        MOBILE_WELCOME_SOURCE_SHEET_CHROME_HEIGHT -
        34,
    );
  });

  test("forbids hand-built Android sheet chrome in onboarding", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "../components/MobileWelcomeWizard.tsx"),
      "utf8",
    );

    expect(source).toContain("<MobileNativeSheetScaffold");
    expect(source).not.toContain("<Modal");
    expect(source).not.toMatch(/android(?:Overlay|Backdrop|Sheet|Handle)/);
    expect(source).toContain("afterSheetDismissRef.current = afterComplete ?? null;");
    expect(source).toContain("onClose={handleWelcomeSheetClosed}");
    expect(source).toMatch(
      /const handleWelcomeSheetClosed[\s\S]*?onCompleted\(\);[\s\S]*?afterDismiss\?\.\(\);/,
    );
    expect(source).not.toContain("setSheetVisible(false);\n      afterComplete?.();");
    expect(source).toContain(
      "accessibilityLabel={strings.about.appIconLabel}",
    );
    expect(source).not.toContain('accessibilityLabel="nemu"');
  });

  test("keeps the primary onboarding action on the empty-state CTA treatment", () => {
    const welcomeSource = readFileSync(
      path.join(import.meta.dir, "../components/MobileWelcomeWizard.tsx"),
      "utf8",
    );
    const emptyLibrarySource = readFileSync(
      path.join(import.meta.dir, "../components/EmptyLibrary.tsx"),
      "utf8",
    );

    const pageEmptySource = readFileSync(
      path.join(import.meta.dir, "../components/MobilePageEmpty.tsx"),
      "utf8",
    );

    expect(welcomeSource).toContain("size={NEMU_PROMINENT_CTA_SIZE}");
    expect(emptyLibrarySource).toContain("size={NEMU_PROMINENT_CTA_SIZE}");
    // The library and page empty states must never diverge into two CTA sizes.
    expect(pageEmptySource).toContain("size={NEMU_PROMINENT_CTA_SIZE}");
  });

  test("keeps every onboarding action on a depth button surface", () => {
    const welcomeSource = readFileSync(
      path.join(import.meta.dir, "../components/MobileWelcomeWizard.tsx"),
      "utf8",
    );

    // The language picker is a row of depth buttons, not hand-painted chips.
    expect(welcomeSource).toContain('variant={selected ? "default" : "secondary"}');
    expect(welcomeSource).not.toContain("segmentText");
    // Selection on a source card must read as a deliberate ring.
    expect(welcomeSource).toMatch(/selectedSourceOption: \{\s*borderWidth: 1\.5,/);
    // Only the recommended source list scrolls.
    expect(welcomeSource).toContain("boundSourceList ? (");
    expect(welcomeSource).toContain("{ height: sourceStepLayout.listHeight }");
  });

  test("hides the underlying navigation tree only while onboarding is visible", () => {
    expect(
      shouldBlockMobileWelcomeUnderlyingContent({ checking: true, visible: false }),
    ).toBe(false);
    expect(
      shouldBlockMobileWelcomeUnderlyingContent({ checking: false, visible: true }),
    ).toBe(true);
    expect(
      shouldBlockMobileWelcomeUnderlyingContent({ checking: false, visible: false }),
    ).toBe(false);
  });

  test("makes the underlying navigation tree inert while onboarding owns focus", () => {
    expect(getMobileWelcomeUnderlyingContentState(true)).toEqual({
      accessibilityElementsHidden: true,
      ariaHidden: true,
      importantForAccessibility: "no-hide-descendants",
      pointerEvents: "none",
    });
    expect(getMobileWelcomeUnderlyingContentState(false)).toEqual({
      accessibilityElementsHidden: false,
      ariaHidden: false,
      importantForAccessibility: "auto",
      pointerEvents: "auto",
    });
  });

  test("matches web recommended source order by app language", () => {
    expect(getMobileWelcomeRecommendedSources("en").map(mobileWelcomeSourceKey)).toEqual([
      "aidoku-community:multi.mangaplus",
      "aidoku-community:multi.mangadex",
      "aidoku-community:ja.shonenjumpplus",
    ]);
    expect(getMobileWelcomeRecommendedSources("zh").map(mobileWelcomeSourceKey)).toEqual([
      "aidoku-zh:zh.manhuaren",
      "aidoku-community:zh.copymanga",
      "aidoku-community:ja.shonenjumpplus",
    ]);
    expect(getMobileWelcomeRecommendedSources("ja").map(mobileWelcomeSourceKey)[0]).toBe(
      "aidoku-community:ja.shonenjumpplus"
    );
  });

  test("keeps only available recommended sources for the install list", () => {
    const available = [
      source("aidoku-community", "multi.mangadex", "MangaDex"),
      source("aidoku-community", "ja.shonenjumpplus", "Shonen Jump+"),
      source("other", "source"),
    ];

    expect(getMobileWelcomeAvailableSources("en", available).map((item) => item.name)).toEqual([
      "MangaDex",
      "Shonen Jump+",
    ]);
  });

  test("defaults to available recommendations when registries have loaded", () => {
    expect(
      getMobileWelcomeDefaultSelection("en", [
        source("aidoku-community", "multi.mangadex"),
      ])
    ).toEqual(["aidoku-community:multi.mangadex"]);

    expect(getMobileWelcomeDefaultSelection("en", [])).toEqual([
      "aidoku-community:multi.mangaplus",
      "aidoku-community:multi.mangadex",
      "aidoku-community:ja.shonenjumpplus",
    ]);
  });

  test("counts only selected sources that still need installation", () => {
    const available = [
      source("aidoku-community", "multi.mangadex"),
      source("aidoku-community", "multi.mangaplus"),
    ];
    expect(
      getMobileWelcomePendingSourceInstallCount(
        available,
        new Set([
          "aidoku-community:multi.mangadex",
          "aidoku-community:multi.mangaplus",
        ]),
        new Set(["aidoku-community:multi.mangadex"]),
      ),
    ).toBe(1);
    expect(
      getMobileWelcomePendingSourceInstallCount(
        available,
        new Set(),
        new Set(),
      ),
    ).toBe(0);
  });

  test("marks recommended sources installed across stored source aliases", () => {
    const keys = buildMobileWelcomeInstalledSourceKeySet([
      installedSource("en.legacy", { sourceId: "manifest.id" }),
      installedSource("aidoku-community:registry-id", {
        sourceId: "runtime.id",
      }),
    ]);

    expect(keys.has("aidoku-community:en.legacy")).toBe(true);
    expect(keys.has("aidoku-community:registry-id")).toBe(true);
    expect(keys.has("aidoku-community:runtime.id")).toBe(true);
  });

  test("gates welcome actions while native work is running", () => {
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "welcome",
        installing: false,
        completing: false,
        changingLanguage: false,
        sourcesLoading: false,
        startupBlocked: true,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: false,
        completing: false,
        changingLanguage: false,
        startupBlocked: true,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "welcome",
        installing: false,
        completing: false,
        changingLanguage: false,
        sourcesLoading: false,
      }),
    ).toBe(true);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "sources",
        installing: false,
        completing: false,
        changingLanguage: false,
        sourcesLoading: true,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "sources",
        installing: true,
        completing: false,
        changingLanguage: false,
        sourcesLoading: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "done",
        installing: true,
        completing: false,
        changingLanguage: false,
        sourcesLoading: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "done",
        installing: false,
        completing: true,
        changingLanguage: false,
        sourcesLoading: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "language",
        installing: false,
        completing: false,
        changingLanguage: true,
        sourcesLoading: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: false,
        completing: false,
        changingLanguage: false,
      }),
    ).toBe(true);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: true,
        completing: false,
        changingLanguage: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: false,
        completing: true,
        changingLanguage: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: false,
        completing: false,
        changingLanguage: true,
      }),
    ).toBe(false);
  });

  test("gates selected welcome language options as no-op selections", () => {
    expect(
      canSelectMobileWelcomeLanguageOption({
        selected: false,
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileWelcomeLanguageOption({
        selected: true,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canSelectMobileWelcomeLanguageOption({
        selected: false,
        disabled: true,
      }),
    ).toBe(false);
  });
});
