import { describe, expect, test } from "bun:test";
import { resolveMobilePullToRefreshEnabled } from "./mobilePullToRefresh";

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
