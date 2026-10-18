import { describe, expect, test } from "bun:test";
import { getPageHeaderActionReserveRem, isPageHeaderActionIconOnly } from "./page-header-actions";

const icon = {};

describe("page header actions", () => {
  test("a labelled action with an icon is icon-only on a phone, labelled elsewhere", () => {
    expect(isPageHeaderActionIconOnly({ label: "Remove", icon }, true)).toBe(true);
    expect(isPageHeaderActionIconOnly({ label: "Remove", icon }, false)).toBe(false);
    expect(isPageHeaderActionIconOnly({ label: "Remove" }, true)).toBe(false);
  });

  test("three icon actions reserve three slots, not the width of three labels", () => {
    const actions = [{ label: "Edit Info", icon }, { label: "Manage Sources", icon }, { label: "Remove", icon }];
    // 3 x 2.5 + 2 gaps x 0.5 + 0.5 = 9rem: fits a 390px row beside a title.
    expect(getPageHeaderActionReserveRem(actions, true)).toBe(9);
    expect(getPageHeaderActionReserveRem(actions, false)).toBeGreaterThan(18);
  });

  test("no actions reserve nothing", () => {
    expect(getPageHeaderActionReserveRem([], true)).toBe(0);
  });
});
