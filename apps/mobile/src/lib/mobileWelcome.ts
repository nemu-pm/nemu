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
import { resolveMobileNativeSheetBodyTopPadding } from "./mobileNativeSheet";

export type MobileWelcomeSourceRef = {
  registryId: string;
  sourceId: string;
};

export type MobileWelcomeStep = "welcome" | "language" | "sources" | "done";

export const MOBILE_WELCOME_ICON_SIZE = 80;
export const MOBILE_WELCOME_STACK_BREAKPOINT = 768;
/**
 * iOS onboarding body inset under the grabber (approved; unchanged). Android
 * uses the shared native-sheet value instead, see
 * [resolveMobileWelcomeSheetContentTopPadding].
 */
export const MOBILE_WELCOME_IOS_SHEET_TOP_PADDING = 18;

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
 * the capped sheet.
 *
 * Android uses the same content-sized model (Material's `ModalBottomSheet`
 * wraps its content when given no detents, like the Nemu Agent sheet). It used
 * to pin `["50%", "100%"]`, which Material turns into a half-height *partial*
 * state; with pan-to-close (and so every sheet gesture) disabled that state
 * could never be expanded, and the content below the 50% line was simply cut
 * off by the screen edge — the intro step's primary button sat on the gesture
 * bar with its bottom inset off-screen, and the sources step's primary button
 * was half hidden. Uniform across steps, so no mode flip here either.
 * (Landscape still gets bounded, scrollable detents from the scaffold.)
 */
export function resolveMobileWelcomeNativeSheetPresentation({
  platform,
}: {
  platform: "android" | "ios";
}): MobileWelcomeNativeSheetPresentation {
  void platform;
  return {
    boundSourceList: false,
    enablePanDownToClose: false,
    scroll: true,
    snapPoints: undefined,
  };
}

/**
 * Body inset between the sheet's grabber and the first onboarding content.
 * iOS keeps its approved 18pt. Android shares the native-sheet value under the
 * Material drag handle (whose own 22dp padding already separates them), so
 * the onboarding sheet and the Nemu Agent sheet sit the same distance below
 * their grabbers.
 */
export function resolveMobileWelcomeSheetContentTopPadding(
  platform: "android" | "ios",
): number {
  if (platform === "android") {
    return resolveMobileNativeSheetBodyTopPadding({ platform, hasChrome: false });
  }
  return MOBILE_WELCOME_IOS_SHEET_TOP_PADDING;
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

export type MobileWelcomeDeviceCompletion = {
  read: () => Promise<boolean>;
  mark: () => Promise<void>;
};

export type MobileWelcomeStartupStore = {
  getSettings: () => Promise<{ mobileWelcomeCompleted?: boolean }>;
  getInstalledSources: () => Promise<Array<Pick<InstalledSource, "removed">>>;
  countLibraryEntries: () => Promise<number>;
};

/**
 * Whether the welcome wizard should open for the active data profile.
 *
 * Completion is device-wide: the per-profile `mobileWelcomeCompleted` flag
 * alone re-opened the wizard after every sign-in/sign-out, because each switch
 * lands in a different profile database that never saw onboarding. So:
 *
 * - a device marker (or a profile flag from before the marker existed, which
 *   is backfilled into the marker) closes the wizard for every profile;
 * - a profile that already holds installed sources or library items — an
 *   account whose data synced in, or an install that predates the flag — is
 *   never onboarded again, and marks the device as done;
 * - only a genuinely empty, never-onboarded install shows the wizard.
 *
 * A settings read failure propagates so the caller can fail closed into the
 * wizard's recoverable startup error. Marker I/O is best effort: a failed
 * marker read falls back to the profile evidence, a failed write retries on
 * the next launch.
 */
export async function shouldShowMobileWelcomeWizard(
  store: MobileWelcomeStartupStore,
  device: MobileWelcomeDeviceCompletion,
): Promise<boolean> {
  const settings = await store.getSettings();
  let deviceCompleted = false;
  try {
    deviceCompleted = await device.read();
  } catch {
    deviceCompleted = false;
  }
  const markDevice = async () => {
    if (deviceCompleted) return;
    try {
      await device.mark();
    } catch {
      // Retried on the next profile check or launch.
    }
  };

  if (deviceCompleted || settings.mobileWelcomeCompleted === true) {
    await markDevice();
    return false;
  }

  const [installedSources, libraryCount] = await Promise.all([
    store.getInstalledSources(),
    store.countLibraryEntries(),
  ]);
  const hasExistingData =
    installedSources.some((source) => source.removed !== true) ||
    libraryCount > 0;
  if (hasExistingData) {
    await markDevice();
    return false;
  }
  return true;
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
