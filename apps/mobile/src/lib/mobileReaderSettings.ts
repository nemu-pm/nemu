import type { PagePairingMode } from "@/data/schema";

export const READER_SCROLL_WIDTH_MIN = 50;
export const READER_SCROLL_WIDTH_MAX = 100;
export const DEFAULT_READER_SCROLL_WIDTH_PCT = 100;
export const DEFAULT_READER_KEEP_AWAKE = true;
export const DEFAULT_READER_LOCK_PORTRAIT = false;
// Match the web/default reading layout in every orientation. Wide screens may
// still opt into two-page spreads explicitly; merely rotating a fresh install
// must not silently change the content hierarchy.
export const DEFAULT_READER_TWO_PAGE_MODE = false;
export const DEFAULT_READER_PAGE_PAIRING_MODE: PagePairingMode = "manga";
export const DEFAULT_READER_PROCESS_PAGE_IMAGES = true;

export type MobileReaderSettingsActionState = {
  changingReadingMode: boolean;
  changingScrollWidth: boolean;
  changingTwoPageMode: boolean;
  changingPagePairingMode: boolean;
  changingPageImageProcessing: boolean;
};

export function clampReaderScrollWidthPct(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_READER_SCROLL_WIDTH_PCT;
  }
  return Math.max(READER_SCROLL_WIDTH_MIN, Math.min(READER_SCROLL_WIDTH_MAX, Math.round(value)));
}

export function readerScrollWidthScale(value: number): number {
  return clampReaderScrollWidthPct(value) / 100;
}

export function normalizeReaderTwoPageMode(value: boolean | null | undefined): boolean {
  return value ?? DEFAULT_READER_TWO_PAGE_MODE;
}

export function normalizeReaderPagePairingMode(
  value: PagePairingMode | null | undefined
): PagePairingMode {
  return value === "book" ? "book" : DEFAULT_READER_PAGE_PAIRING_MODE;
}

export function normalizeReaderProcessPageImages(
  value: boolean | null | undefined
): boolean {
  return value ?? DEFAULT_READER_PROCESS_PAGE_IMAGES;
}

export function shouldShowReaderPagePairingControls({
  twoPageSupported,
  twoPageEnabled,
}: {
  twoPageSupported: boolean;
  twoPageEnabled: boolean;
}): boolean {
  return twoPageSupported && twoPageEnabled;
}

export function isMobileReaderSettingsActionBusy(
  state: MobileReaderSettingsActionState
): boolean {
  return (
    state.changingReadingMode ||
    state.changingScrollWidth ||
    state.changingTwoPageMode ||
    state.changingPagePairingMode ||
    state.changingPageImageProcessing
  );
}

export function canStartMobileReaderSettingsAction(
  state: MobileReaderSettingsActionState
): boolean {
  return !isMobileReaderSettingsActionBusy(state);
}

export function canRetryMobileReaderPluginSettingsLoadError({
  hasError,
  loading,
  busy,
}: {
  hasError: boolean;
  loading: boolean;
  busy: boolean;
}): boolean {
  return hasError && !loading && !busy;
}

export function canSelectMobileReaderSettingsOption({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}
