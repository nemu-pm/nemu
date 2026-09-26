import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import {
  getMobileReaderLockedChapterState,
  isMobileReaderLockedChapterFailure,
} from "./mobileReaderLockedChapter";

describe("locked chapter detection", () => {
  test("a chapter the runtime flags as locked is locked whatever the source says", () => {
    // MangaDex answers an external (paywalled) chapter with this message.
    expect(
      isMobileReaderLockedChapterFailure({
        chapter: { locked: true },
        error: new Error("Missing chapter data"),
      }),
    ).toBe(true);
    expect(
      isMobileReaderLockedChapterFailure({ chapter: { locked: true } }),
    ).toBe(true);
  });

  test("recognises the source's own paywall wording on an unflagged chapter", () => {
    for (const message of [
      "This chapter is locked",
      "Chapter locked: purchase required",
      "Paywalled content",
      "Premium chapter",
      "Please purchase this chapter to read it",
      "This episode requires coins",
      "Login required to read this chapter",
      "Not available for free",
    ]) {
      expect(
        isMobileReaderLockedChapterFailure({
          chapter: { locked: false },
          error: new Error(message),
        }),
      ).toBe(true);
    }
  });

  test("keeps ordinary failures on their normal recovery path", () => {
    for (const error of [
      new Error("Missing chapter data"),
      new Error("Cloudflare blocked: https://example.com/chapter/1"),
      new Error("Request failed with status 500"),
      new Error("The chapter was unlocked yesterday"),
      "plain string failure",
    ]) {
      expect(
        isMobileReaderLockedChapterFailure({ chapter: undefined, error }),
      ).toBe(false);
    }
    expect(isMobileReaderLockedChapterFailure({})).toBe(false);
  });

  test("a network outage or Cloudflare challenge wins over the locked flag", () => {
    expect(
      isMobileReaderLockedChapterFailure({
        chapter: { locked: true },
        error: new Error(
          "Cloudflare challenge detected for https://example.com/read (status 403)",
        ),
      }),
    ).toBe(false);
    expect(
      isMobileReaderLockedChapterFailure({
        chapter: { locked: true },
        error: new TypeError("Network request failed"),
      }),
    ).toBe(false);
  });

  test("presents localized locked copy in every app language", () => {
    const en = getMobileReaderLockedChapterState(getMobileStrings("en"));
    expect(en).toMatchObject({
      status: "error",
      locked: true,
      title: "This chapter is locked",
    });
    for (const language of ["zh", "ja"] as const) {
      const state = getMobileReaderLockedChapterState(
        getMobileStrings(language),
      );
      expect(state.title).not.toBe(en.title);
      expect(state.detail).not.toBe(en.detail);
      expect(state.title.length).toBeGreaterThan(0);
    }
  });
});
