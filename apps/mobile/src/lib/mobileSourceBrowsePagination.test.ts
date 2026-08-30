import { describe, expect, test } from "bun:test";
import {
  canLoadMoreMobileSourceBrowseResults,
  isMobileSourceBrowseLoadMoreBusy,
} from "./mobileSourceBrowsePagination";

describe("mobile source browse pagination", () => {
  test("allows loading another page only when more results are idle", () => {
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: true,
        loading: false,
        inFlight: false,
      }),
    ).toBe(true);
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: false,
        loading: false,
        inFlight: false,
      }),
    ).toBe(false);
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: true,
        loading: true,
        inFlight: false,
      }),
    ).toBe(false);
    expect(
      canLoadMoreMobileSourceBrowseResults({
        hasMore: true,
        loading: false,
        inFlight: true,
      }),
    ).toBe(false);
  });

  test("reports load more as busy while state or ref guards are active", () => {
    expect(
      isMobileSourceBrowseLoadMoreBusy({
        loading: false,
        inFlight: false,
      }),
    ).toBe(false);
    expect(
      isMobileSourceBrowseLoadMoreBusy({
        loading: true,
        inFlight: false,
      }),
    ).toBe(true);
    expect(
      isMobileSourceBrowseLoadMoreBusy({
        loading: false,
        inFlight: true,
      }),
    ).toBe(true);
  });
});
