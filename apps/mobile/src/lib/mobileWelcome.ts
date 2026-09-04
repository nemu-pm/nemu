import type { AppLanguage, InstalledSource } from "@/data/schema";
import {
  makeSourceKey,
  type MobileRegistrySource,
} from "@/sources/aidokuRegistry";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  describeMobileErrorDetail,
  getMobileSourceErrorPresentation,
} from "./mobileSourceErrors";
import { getMobileInstalledSourceRegistryKeys } from "./mobileInstalledSourceKeys";

export type MobileWelcomeSourceRef = {
  registryId: string;
  sourceId: string;
};

export type MobileWelcomeStep = "welcome" | "language" | "sources" | "done";

export const MOBILE_WELCOME_ICON_SIZE = 80;
export const MOBILE_WELCOME_STACK_BREAKPOINT = 768;
export const MOBILE_WELCOME_ANDROID_SNAP_POINTS: (string | number)[] = [
  "50%",
  "100%",
];

/**
 * A source card is 12pt padding + 34pt of content + its selection border, so a
 * selected (1.5pt) row measures 61pt. Budgeting the selected height keeps the
 * list from scrolling by a hairline when every recommendation is pre-checked.
 */
export const MOBILE_WELCOME_SOURCE_ROW_HEIGHT = 61;
export const MOBILE_WELCOME_SOURCE_ROW_GAP = 8;

export function shouldScrollMobileWelcomeContent({
  platform,
  step,
}: {
  platform: "android" | "ios" | "web";
  step: MobileWelcomeStep;
}): boolean {
  return platform !== "web" || step === "sources";
}

export function shouldStackMobileWelcomeActions(width: number): boolean {
  return width < MOBILE_WELCOME_STACK_BREAKPOINT;
}

export function shouldBlockMobileWelcomeUnderlyingContent({
  checking,
  visible,
}: {
  checking: boolean;
  visible: boolean;
}): boolean {
  // Do not toggle accessibilityElementsHidden on the already-mounted native
  // navigation tree while a local settings read is merely pending. iOS can
  // retain that hidden subtree across a provider remount. The actual wizard
  // is modal and becomes the sole accessibility owner once it is visible.
  return !checking && visible;
}

export function getMobileWelcomeUnderlyingContentState(blocked: boolean): {
  accessibilityElementsHidden: boolean;
  ariaHidden: boolean;
  importantForAccessibility: "auto" | "no-hide-descendants";
  pointerEvents: "auto" | "none";
} {
  return {
    accessibilityElementsHidden: blocked,
    ariaHidden: blocked,
    importantForAccessibility: blocked ? "no-hide-descendants" : "auto",
    pointerEvents: blocked ? "none" : "auto",
  };
}

export type MobileWelcomeNativeSheetPresentation = {
  /** The source list owns scrolling; the rest of the sheet stays pinned. */
  boundSourceList: boolean;
  enablePanDownToClose: false;
  scroll: boolean;
  snapPoints: (string | number)[] | undefined;
};

/**
 * One structurally stable native presentation for EVERY iOS onboarding step:
 * content-sized (`snapPoints: undefined` → the sheet hugs its content), with
 * in-sheet scrolling as the overflow escape hatch. The earlier mixed model —
 * content-sized short steps plus a fixed-detent sources step — made the expo
 * iOS BottomSheet flip its `fitToContents`/`matchContents` hosting mode when
 * the wizard stepped between snapPoints-absent and snapPoints-present states.
 * That flip tears down and rebuilds the SwiftUI `RNHostView`, and its
 * `RCTSurfaceTouchHandler` re-attach races the old branch's detach
 * (`ExpoUITouchHandlerHelper` returns nil while any handler still exists, so
 * the rebuilt host can silently end up with none). Observed result: a step
 * rendered, still dragged, and ignored every tap. Uniform mode across steps
 * never flips, so touches survive; a long source list simply scrolls inside
 * the capped sheet. Android already pins one snap-point array across steps
 * for the same reason (Material has no content-sized detent).
 */
export function resolveMobileWelcomeNativeSheetPresentation({
  platform,
}: {
  platform: "android" | "ios";
}): MobileWelcomeNativeSheetPresentation {
  if (platform === "android") {
    return {
      boundSourceList: false,
      enablePanDownToClose: false,
      scroll: true,
      snapPoints: MOBILE_WELCOME_ANDROID_SNAP_POINTS,
    };
  }

  return {
    boundSourceList: false,
    enablePanDownToClose: false,
    scroll: true,
    snapPoints: undefined,
  };
}

export type MobileWelcomeActionState = {
  step: MobileWelcomeStep;
  installing: boolean;
  completing: boolean;
  changingLanguage: boolean;
  sourcesLoading: boolean;
  startupBlocked?: boolean;
};

/**
 * Banner copy for a failed onboarding install. A transient network failure
 * (cold proxy, cellular stall, our own install timeout) classifies through the
 * shared source-error presentation, so it reads as a retryable network error
 * instead of the install-specific "this device cannot install sources" copy.
 * Only unclassified source-package failures keep that device framing.
 */
export function getMobileWelcomeInstallErrorCopy(
  error: unknown,
  strings: MobileStrings,
): { title: string; detail: string } {
  const presentation = getMobileSourceErrorPresentation(error, strings);
  if (presentation.kind !== "source") {
    return { title: presentation.title, detail: presentation.detail };
  }
  return {
    title: strings.welcome.sourceInstallFailed,
    detail: describeMobileErrorDetail(
      error,
      strings.welcome.sourceInstallFailedDetail,
    ),
  };
}

export type MobileWelcomeCompletionWriteCoordinator = {
  run: (write: () => Promise<void>) => Promise<void>;
};

/**
 * Coalesces every successful completion request for one wizard mount. A failed
 * write is released so the visible final actions can retry it.
 */
export function createMobileWelcomeCompletionWriteCoordinator(): MobileWelcomeCompletionWriteCoordinator {
  let completion: Promise<void> | null = null;

  return {
    run(write) {
      if (completion) return completion;

      const next = write();
      completion = next;
      void next.catch(() => {
        if (completion === next) completion = null;
      });
      return next;
    },
  };
}

const ENGLISH_SOURCES: MobileWelcomeSourceRef[] = [
  { registryId: "aidoku-community", sourceId: "multi.mangaplus" },
  { registryId: "aidoku-community", sourceId: "multi.mangadex" },
  { registryId: "aidoku-community", sourceId: "ja.shonenjumpplus" },
];

const CHINESE_SOURCES: MobileWelcomeSourceRef[] = [
  { registryId: "aidoku-zh", sourceId: "zh.manhuaren" },
  { registryId: "aidoku-community", sourceId: "zh.copymanga" },
  { registryId: "aidoku-community", sourceId: "ja.shonenjumpplus" },
];

const JAPANESE_SOURCES: MobileWelcomeSourceRef[] = [
  { registryId: "aidoku-community", sourceId: "ja.shonenjumpplus" },
  { registryId: "aidoku-community", sourceId: "multi.mangaplus" },
  { registryId: "aidoku-community", sourceId: "multi.mangadex" },
];

export function mobileWelcomeSourceKey(source: MobileWelcomeSourceRef): string {
  return makeSourceKey(source.registryId, source.sourceId);
}

export function getMobileWelcomeRecommendedSources(
  language: AppLanguage,
): MobileWelcomeSourceRef[] {
  if (language === "zh") return CHINESE_SOURCES;
  if (language === "ja") return JAPANESE_SOURCES;
  return ENGLISH_SOURCES;
}

export function getMobileWelcomeAvailableSources(
  language: AppLanguage,
  sources: MobileRegistrySource[],
): MobileRegistrySource[] {
  const byKey = new Map(
    sources.map((source) => [
      makeSourceKey(source.registryId, source.id),
      source,
    ]),
  );

  return getMobileWelcomeRecommendedSources(language)
    .map((source) => byKey.get(mobileWelcomeSourceKey(source)))
    .filter((source): source is MobileRegistrySource => Boolean(source));
}

export function getMobileWelcomeDefaultSelection(
  language: AppLanguage,
  sources: MobileRegistrySource[],
): string[] {
  const available = getMobileWelcomeAvailableSources(language, sources);
  if (available.length > 0) {
    return available.map((source) =>
      makeSourceKey(source.registryId, source.id),
    );
  }

  return getMobileWelcomeRecommendedSources(language).map(
    mobileWelcomeSourceKey,
  );
}

export function getMobileWelcomePendingSourceInstallCount(
  sources: MobileRegistrySource[],
  selectedSourceKeys: ReadonlySet<string>,
  installedSourceKeys: ReadonlySet<string>,
): number {
  return sources.reduce((count, source) => {
    const key = makeSourceKey(source.registryId, source.id);
    return selectedSourceKeys.has(key) && !installedSourceKeys.has(key)
      ? count + 1
      : count;
  }, 0);
}

export function buildMobileWelcomeInstalledSourceKeySet(
  sources: InstalledSource[],
): Set<string> {
  const keys = new Set<string>();

  for (const source of sources) {
    for (const key of getMobileInstalledSourceRegistryKeys(source)) {
      keys.add(key);
    }
  }

  return keys;
}

export function canRunMobileWelcomePrimaryAction(
  state: MobileWelcomeActionState,
): boolean {
  if (state.startupBlocked) return false;
  if (state.completing) return false;
  if (state.installing) return false;
  if (state.changingLanguage) return false;
  if (state.step === "sources") {
    return !state.sourcesLoading;
  }
  return true;
}

export function canRunMobileWelcomeSkipAction(
  state: Pick<
    MobileWelcomeActionState,
    "installing" | "completing" | "changingLanguage" | "startupBlocked"
  >,
): boolean {
  return (
    !state.startupBlocked &&
    !state.installing &&
    !state.completing &&
    !state.changingLanguage
  );
}

export function canSelectMobileWelcomeLanguageOption({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}
