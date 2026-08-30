import { describe, expect, test } from "bun:test";
import {
  clampReaderScrollWidthPct,
  DEFAULT_READER_PAGE_PAIRING_MODE,
  DEFAULT_READER_PROCESS_PAGE_IMAGES,
  DEFAULT_READER_SCROLL_WIDTH_PCT,
  DEFAULT_READER_TWO_PAGE_MODE,
  canRetryMobileReaderPluginSettingsLoadError,
  canSelectMobileReaderSettingsOption,
  canStartMobileReaderSettingsAction,
  isMobileReaderSettingsActionBusy,
  normalizeReaderPagePairingMode,
  normalizeReaderProcessPageImages,
  normalizeReaderTwoPageMode,
  READER_SCROLL_WIDTH_MAX,
  READER_SCROLL_WIDTH_MIN,
  readerScrollWidthScale,
  shouldShowReaderPagePairingControls,
} from "./mobileReaderSettings";

describe("mobile reader settings helpers", () => {
  test("falls back to the default scroll width for invalid values", () => {
    expect(clampReaderScrollWidthPct(undefined)).toBe(DEFAULT_READER_SCROLL_WIDTH_PCT);
    expect(clampReaderScrollWidthPct(null)).toBe(DEFAULT_READER_SCROLL_WIDTH_PCT);
    expect(clampReaderScrollWidthPct(Number.NaN)).toBe(DEFAULT_READER_SCROLL_WIDTH_PCT);
  });

  test("clamps and rounds scroll width percentages", () => {
    expect(clampReaderScrollWidthPct(12)).toBe(READER_SCROLL_WIDTH_MIN);
    expect(clampReaderScrollWidthPct(74.6)).toBe(75);
    expect(clampReaderScrollWidthPct(150)).toBe(READER_SCROLL_WIDTH_MAX);
  });

  test("converts scroll width percentages into render scales", () => {
    expect(readerScrollWidthScale(50)).toBe(0.5);
    expect(readerScrollWidthScale(100)).toBe(1);
  });

  test("normalizes two-page reader settings", () => {
    expect(DEFAULT_READER_TWO_PAGE_MODE).toBe(false);
    expect(normalizeReaderTwoPageMode(undefined)).toBe(DEFAULT_READER_TWO_PAGE_MODE);
    expect(normalizeReaderTwoPageMode(null)).toBe(DEFAULT_READER_TWO_PAGE_MODE);
    expect(normalizeReaderTwoPageMode(false)).toBe(false);
    expect(normalizeReaderTwoPageMode(true)).toBe(true);
    expect(normalizeReaderPagePairingMode(undefined)).toBe(DEFAULT_READER_PAGE_PAIRING_MODE);
    expect(normalizeReaderPagePairingMode("manga")).toBe("manga");
    expect(normalizeReaderPagePairingMode("book")).toBe("book");
  });

  test("matches web by showing pairing controls only while two-page view is enabled", () => {
    expect(
      shouldShowReaderPagePairingControls({
        twoPageSupported: true,
        twoPageEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldShowReaderPagePairingControls({
        twoPageSupported: true,
        twoPageEnabled: false,
      }),
    ).toBe(false);
    expect(
      shouldShowReaderPagePairingControls({
        twoPageSupported: false,
        twoPageEnabled: true,
      }),
    ).toBe(false);
  });

  test("gates reader setting writes while any setting action is active", () => {
    const idle = {
      changingReadingMode: false,
      changingScrollWidth: false,
      changingTwoPageMode: false,
      changingPagePairingMode: false,
      changingPageImageProcessing: false,
    };

    expect(isMobileReaderSettingsActionBusy(idle)).toBe(false);
    expect(canStartMobileReaderSettingsAction(idle)).toBe(true);
    expect(canStartMobileReaderSettingsAction({ ...idle, changingReadingMode: true })).toBe(false);
    expect(canStartMobileReaderSettingsAction({ ...idle, changingScrollWidth: true })).toBe(false);
    expect(canStartMobileReaderSettingsAction({ ...idle, changingTwoPageMode: true })).toBe(false);
    expect(canStartMobileReaderSettingsAction({ ...idle, changingPagePairingMode: true })).toBe(false);
    expect(canStartMobileReaderSettingsAction({ ...idle, changingPageImageProcessing: true })).toBe(false);
  });

  test("normalizes page image processing settings", () => {
    expect(normalizeReaderProcessPageImages(undefined)).toBe(
      DEFAULT_READER_PROCESS_PAGE_IMAGES,
    );
    expect(normalizeReaderProcessPageImages(null)).toBe(
      DEFAULT_READER_PROCESS_PAGE_IMAGES,
    );
    expect(normalizeReaderProcessPageImages(false)).toBe(false);
    expect(normalizeReaderProcessPageImages(true)).toBe(true);
  });

  test("gates reader plugin settings load retries while loading or busy", () => {
    expect(
      canRetryMobileReaderPluginSettingsLoadError({
        hasError: true,
        loading: false,
        busy: false,
      }),
    ).toBe(true);
    expect(
      canRetryMobileReaderPluginSettingsLoadError({
        hasError: false,
        loading: false,
        busy: false,
      }),
    ).toBe(false);
    expect(
      canRetryMobileReaderPluginSettingsLoadError({
        hasError: true,
        loading: true,
        busy: false,
      }),
    ).toBe(false);
    expect(
      canRetryMobileReaderPluginSettingsLoadError({
        hasError: true,
        loading: false,
        busy: true,
      }),
    ).toBe(false);
  });

  test("gates selected reader setting tabs as no-op selections", () => {
    expect(
      canSelectMobileReaderSettingsOption({
        selected: false,
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileReaderSettingsOption({
        selected: true,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canSelectMobileReaderSettingsOption({
        selected: false,
        disabled: true,
      }),
    ).toBe(false);
  });
});
