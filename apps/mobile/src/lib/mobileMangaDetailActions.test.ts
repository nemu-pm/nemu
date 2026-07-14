import { describe, expect, test } from "bun:test";
import {
  canOpenMobileMangaDetailReader,
  canStartMobileMangaDetailAction,
  getMobileMangaDetailMutationResultAction,
  isMobileMangaDetailActionBusy,
  shouldRenderMobileMangaDetailSkeleton,
  shouldShowMobileMangaDetailLoadError,
} from "./mobileMangaDetailActions";

describe("mobile manga detail actions", () => {
  const idle = {
    openingReader: false,
    savingMetadata: false,
    removing: false,
  };

  test("gates detail actions while navigation or mutations are active", () => {
    expect(isMobileMangaDetailActionBusy(idle)).toBe(false);
    expect(canStartMobileMangaDetailAction(idle)).toBe(true);
    expect(canStartMobileMangaDetailAction({ ...idle, openingReader: true })).toBe(false);
    expect(canStartMobileMangaDetailAction({ ...idle, savingMetadata: true })).toBe(false);
    expect(canStartMobileMangaDetailAction({ ...idle, removing: true })).toBe(false);
  });

  test("opens reader only when idle with a source and chapter", () => {
    expect(
      canOpenMobileMangaDetailReader({
        hasSource: true,
        hasChapter: true,
        state: idle,
      }),
    ).toBe(true);
    expect(
      canOpenMobileMangaDetailReader({
        hasSource: false,
        hasChapter: true,
        state: idle,
      }),
    ).toBe(false);
    expect(
      canOpenMobileMangaDetailReader({
        hasSource: true,
        hasChapter: false,
        state: idle,
      }),
    ).toBe(false);
    expect(
      canOpenMobileMangaDetailReader({
        hasSource: true,
        hasChapter: true,
        state: { ...idle, openingReader: true },
      }),
    ).toBe(false);
  });

  test("matches web by showing a full skeleton while the library entry is loading", () => {
    expect(
      shouldRenderMobileMangaDetailSkeleton({
        loading: true,
        hasEntry: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileMangaDetailSkeleton({
        loading: true,
        hasEntry: true,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileMangaDetailSkeleton({
        loading: false,
        hasEntry: false,
      }),
    ).toBe(false);
  });

  test("keeps local detail load errors retryable after loading settles", () => {
    expect(
      shouldShowMobileMangaDetailLoadError({
        loading: false,
        hasError: true,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileMangaDetailLoadError({
        loading: true,
        hasError: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileMangaDetailLoadError({
        loading: false,
        hasError: false,
      }),
    ).toBe(false);
  });

  test("keeps failed library removals retryable from the confirmation sheet", () => {
    expect(
      getMobileMangaDetailMutationResultAction({ succeeded: true }),
    ).toBe("close-confirmation");
    expect(
      getMobileMangaDetailMutationResultAction({ succeeded: false }),
    ).toBe("keep-confirmation-open");
  });
});
