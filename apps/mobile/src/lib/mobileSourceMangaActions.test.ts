import { describe, expect, test } from "bun:test";
import {
  canOpenMobileSourceMangaReader,
  canPressMobileSourceMangaLibraryAction,
  canRunMobileSourceMangaLibraryAction,
  getMobileSourceMangaMutationResultAction,
  isMobileSourceMangaLibraryActionBusy,
  isMobileSourceMangaReaderActionBusy,
  shouldRenderMobileSourceMangaReaderAction,
  shouldRenderMobileSourceMangaSkeleton,
  shouldShowMobileSourceMangaDetailLoadError,
} from "./mobileSourceMangaActions";

describe("mobile source manga actions", () => {
  test("allows library actions only when idle and actionable", () => {
    expect(
      canRunMobileSourceMangaLibraryAction({
        adding: false,
        removing: false,
        inLibrary: false,
        detailReady: true,
      }),
    ).toBe(true);
    expect(
      canRunMobileSourceMangaLibraryAction({
        adding: false,
        removing: false,
        inLibrary: true,
        detailReady: false,
      }),
    ).toBe(true);
    expect(
      canRunMobileSourceMangaLibraryAction({
        adding: false,
        removing: false,
        inLibrary: false,
        detailReady: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileSourceMangaLibraryAction({
        adding: true,
        removing: false,
        inLibrary: false,
        detailReady: true,
      }),
    ).toBe(false);
    expect(
      canRunMobileSourceMangaLibraryAction({
        adding: false,
        removing: true,
        inLibrary: true,
        detailReady: true,
      }),
    ).toBe(false);
  });

  test("blocks library button presses while reader navigation is opening", () => {
    expect(
      canPressMobileSourceMangaLibraryAction({
        openingReader: false,
        adding: false,
        removing: false,
        inLibrary: false,
        detailReady: true,
      }),
    ).toBe(true);
    expect(
      canPressMobileSourceMangaLibraryAction({
        openingReader: true,
        adding: false,
        removing: false,
        inLibrary: false,
        detailReady: true,
      }),
    ).toBe(false);
    expect(
      canPressMobileSourceMangaLibraryAction({
        openingReader: false,
        adding: false,
        removing: false,
        inLibrary: false,
        detailReady: false,
      }),
    ).toBe(false);
  });

  test("reports library actions as busy during add or remove work", () => {
    expect(isMobileSourceMangaLibraryActionBusy({ adding: false, removing: false })).toBe(
      false,
    );
    expect(isMobileSourceMangaLibraryActionBusy({ adding: true, removing: false })).toBe(
      true,
    );
    expect(isMobileSourceMangaLibraryActionBusy({ adding: false, removing: true })).toBe(
      true,
    );
  });

  test("gates reader navigation while source manga actions are active", () => {
    const idle = {
      openingReader: false,
      adding: false,
      removing: false,
    };

    expect(isMobileSourceMangaReaderActionBusy(idle)).toBe(false);
    expect(canOpenMobileSourceMangaReader({ hasChapter: true, state: idle })).toBe(
      true,
    );
    expect(canOpenMobileSourceMangaReader({ hasChapter: false, state: idle })).toBe(
      false,
    );
    expect(
      canOpenMobileSourceMangaReader({
        hasChapter: true,
        state: { ...idle, openingReader: true },
      }),
    ).toBe(false);
    expect(
      canOpenMobileSourceMangaReader({
        hasChapter: true,
        state: { ...idle, adding: true },
      }),
    ).toBe(false);
    expect(
      canOpenMobileSourceMangaReader({
        hasChapter: true,
        state: { ...idle, removing: true },
      }),
    ).toBe(false);
  });

  test("matches web by rendering the reader action only when a chapter exists", () => {
    expect(
      shouldRenderMobileSourceMangaReaderAction({ hasChapter: true }),
    ).toBe(true);
    expect(
      shouldRenderMobileSourceMangaReaderAction({ hasChapter: false }),
    ).toBe(false);
  });

  test("matches web by showing a full skeleton until source metadata is available", () => {
    expect(
      shouldRenderMobileSourceMangaSkeleton({
        loading: true,
        hasMetadata: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileSourceMangaSkeleton({
        loading: true,
        hasMetadata: true,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileSourceMangaSkeleton({
        loading: false,
        hasMetadata: false,
      }),
    ).toBe(false);
  });

  test("keeps source detail load failures retryable when no metadata can render", () => {
    expect(
      shouldShowMobileSourceMangaDetailLoadError({
        status: "blocked",
        hasMetadata: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileSourceMangaDetailLoadError({
        status: "error",
        hasMetadata: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileSourceMangaDetailLoadError({
        status: "blocked",
        hasMetadata: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSourceMangaDetailLoadError({
        status: "loading",
        hasMetadata: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSourceMangaDetailLoadError({
        status: "ready",
        hasMetadata: false,
      }),
    ).toBe(false);
  });

  test("keeps failed library removals retryable from the confirmation sheet", () => {
    expect(
      getMobileSourceMangaMutationResultAction({ succeeded: true }),
    ).toBe("close-confirmation");
    expect(
      getMobileSourceMangaMutationResultAction({ succeeded: false }),
    ).toBe("keep-confirmation-open");
  });
});
