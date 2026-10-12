import { describe, expect, test } from "bun:test";
import {
  resolveMobilePullToRefreshEnabled,
  resolveMobilePullToRefreshIndicatorVisible,
} from "./mobilePullToRefresh";

describe("mobile pull to refresh", () => {
  test("requires a refresh action", () => {
    expect(
      resolveMobilePullToRefreshEnabled({
        hasRefreshAction: false,
        refreshing: false,
      })
    ).toBe(false);
  });

  test("enables the pull gesture when the action is ready", () => {
    expect(
      resolveMobilePullToRefreshEnabled({
        hasRefreshAction: true,
        refreshing: false,
      })
    ).toBe(true);
  });

  test("disables the pull gesture for blocked refresh actions", () => {
    expect(
      resolveMobilePullToRefreshEnabled({
        disabled: true,
        hasRefreshAction: true,
        refreshing: false,
      })
    ).toBe(false);
  });

  test("keeps the control enabled while showing an active refresh", () => {
    expect(
      resolveMobilePullToRefreshEnabled({
        disabled: true,
        hasRefreshAction: true,
        refreshing: true,
      })
    ).toBe(true);
  });
});

describe("pull-to-refresh indicator visibility", () => {
  test("iOS shows the spinner only for a refresh the person pulled", () => {
    expect(resolveMobilePullToRefreshIndicatorVisible({ platform: "ios", refreshing: true, pulledByUser: true })).toBe(true);
    // A background refresh must not push the page down under the soft-edge header.
    expect(resolveMobilePullToRefreshIndicatorVisible({ platform: "ios", refreshing: true, pulledByUser: false })).toBe(false);
    expect(resolveMobilePullToRefreshIndicatorVisible({ platform: "ios", refreshing: false, pulledByUser: true })).toBe(false);
  });

  test("Android keeps showing every refresh", () => {
    expect(resolveMobilePullToRefreshIndicatorVisible({ platform: "android", refreshing: true, pulledByUser: false })).toBe(true);
    expect(resolveMobilePullToRefreshIndicatorVisible({ platform: "android", refreshing: false, pulledByUser: false })).toBe(false);
  });
});
