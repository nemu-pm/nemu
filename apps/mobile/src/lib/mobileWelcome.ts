import type { AppLanguage, InstalledSource } from "@/data/schema";
import { makeSourceKey, type MobileRegistrySource } from "@/sources/aidokuRegistry";
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

export function shouldScrollMobileWelcomeContent({
  platform,
  step,
}: {
  platform: "android" | "ios" | "web";
  step: MobileWelcomeStep;
}): boolean {
  return platform !== "web" || step === "sources";
}

export function shouldUseContentSizedMobileWelcomeSheet({
  platform,
  step,
  fontScale,
  availableHeight,
}: {
  platform: "android" | "ios" | "web";
  step: MobileWelcomeStep;
  fontScale: number;
  availableHeight: number;
}): boolean {
  if (platform !== "ios" || step === "sources") return false;

  // Native fitted sheets are the cleanest presentation for the short steps,
  // but they stop being safe once large Dynamic Type or a compact-height
  // viewport can make the content taller than the available presentation.
  // Those cases keep the explicit, scrollable detent instead.
  return fontScale <= 1.5 && availableHeight >= 520;
}

export type MobileWelcomeNativeSheetPresentation = {
  enablePanDownToClose: false;
  scroll: boolean;
  snapPoints: (string | number)[] | undefined;
};

/**
 * Android's Material sheet exposes one partial and one expanded state. Keep the
 * same snap-point array across every onboarding render so changing steps never
 * replaces the native host. Dismiss gestures remain disabled because setup is
 * modal, while the sheet's scroll view keeps every control reachable.
 */
export function resolveMobileWelcomeNativeSheetPresentation({
  platform,
  step,
  fontScale,
  availableHeight,
  nativeSheetHeight,
}: {
  platform: "android" | "ios";
  step: MobileWelcomeStep;
  fontScale: number;
  availableHeight: number;
  nativeSheetHeight: number;
}): MobileWelcomeNativeSheetPresentation {
  if (platform === "android") {
    return {
      enablePanDownToClose: false,
      scroll: true,
      snapPoints: MOBILE_WELCOME_ANDROID_SNAP_POINTS,
    };
  }

  const contentSized = shouldUseContentSizedMobileWelcomeSheet({
    platform,
    step,
    fontScale,
    availableHeight,
  });
  return {
    enablePanDownToClose: false,
    scroll:
      !contentSized && shouldScrollMobileWelcomeContent({ platform, step }),
    snapPoints: contentSized ? undefined : [nativeSheetHeight],
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

export type MobileWelcomeCompletionWriteCoordinator = {
  run: (write: () => Promise<void>) => Promise<void>;
};

/**
 * Coalesces every successful completion request for one wizard mount. A failed
 * write is released so the visible final actions can retry it.
 */
export function createMobileWelcomeCompletionWriteCoordinator(
): MobileWelcomeCompletionWriteCoordinator {
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
  language: AppLanguage
): MobileWelcomeSourceRef[] {
  if (language === "zh") return CHINESE_SOURCES;
  if (language === "ja") return JAPANESE_SOURCES;
  return ENGLISH_SOURCES;
}

export function getMobileWelcomeAvailableSources(
  language: AppLanguage,
  sources: MobileRegistrySource[]
): MobileRegistrySource[] {
  const byKey = new Map(
    sources.map((source) => [makeSourceKey(source.registryId, source.id), source])
  );

  return getMobileWelcomeRecommendedSources(language)
    .map((source) => byKey.get(mobileWelcomeSourceKey(source)))
    .filter((source): source is MobileRegistrySource => Boolean(source));
}

export function getMobileWelcomeDefaultSelection(
  language: AppLanguage,
  sources: MobileRegistrySource[]
): string[] {
  const available = getMobileWelcomeAvailableSources(language, sources);
  if (available.length > 0) {
    return available.map((source) => makeSourceKey(source.registryId, source.id));
  }

  return getMobileWelcomeRecommendedSources(language).map(mobileWelcomeSourceKey);
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
