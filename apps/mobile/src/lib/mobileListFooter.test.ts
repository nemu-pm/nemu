import { describe, expect, test } from "bun:test";
import { resolveMobileListFooterState } from "./mobileListFooter";

describe("mobile list footer state", () => {
  test("renders nothing before the first page exists", () => {
    expect(
      resolveMobileListFooterState({
        itemCount: 0,
        loadingNextPage: true,
        nextPageFailed: false,
        hasMore: undefined,
      })
    ).toBeNull();
  });

  test("shows loading while the next page is in flight", () => {
    expect(
      resolveMobileListFooterState({
        itemCount: 24,
        loadingNextPage: true,
        nextPageFailed: false,
        hasMore: undefined,
      })
    ).toBe("loading");
  });

  test("keeps the loading row visible even while hasMore is unsettled", () => {
    // During an in-flight load the footer must never fall back to the idle
    // (hidden) or exhausted state: loadingNextPage outranks both.
    expect(
      resolveMobileListFooterState({
        itemCount: 24,
        loadingNextPage: true,
        nextPageFailed: false,
        hasMore: false,
      })
    ).toBe("loading");
  });

  test("shows the error state over an in-flight retry", () => {
    expect(
      resolveMobileListFooterState({
        itemCount: 24,
        loadingNextPage: true,
        nextPageFailed: true,
        hasMore: undefined,
      })
    ).toBe("error");
  });

  test("shows the exhausted state when the list is ready and complete", () => {
    expect(
      resolveMobileListFooterState({
        itemCount: 48,
        loadingNextPage: false,
        nextPageFailed: false,
        hasMore: false,
      })
    ).toBe("end");
  });

  test("renders nothing while idle with more pages to load", () => {
    expect(
      resolveMobileListFooterState({
        itemCount: 24,
        loadingNextPage: false,
        nextPageFailed: false,
        hasMore: true,
      })
    ).toBeNull();
  });

  test("renders nothing when readiness is unknown", () => {
    expect(
      resolveMobileListFooterState({
        itemCount: 24,
        loadingNextPage: false,
        nextPageFailed: false,
        hasMore: undefined,
      })
    ).toBeNull();
  });
});
