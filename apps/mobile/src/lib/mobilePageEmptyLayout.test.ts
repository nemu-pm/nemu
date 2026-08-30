import { describe, expect, test } from "bun:test";
import {
  MOBILE_PAGE_EMPTY_COMPACT_HEIGHT,
  shouldUseCompactMobilePageEmptyLayout,
} from "./mobilePageEmptyLayout";

describe("mobile page empty layout", () => {
  test("uses compact spacing on short landscape viewports", () => {
    expect(
      shouldUseCompactMobilePageEmptyLayout(
        MOBILE_PAGE_EMPTY_COMPACT_HEIGHT - 1,
      ),
    ).toBe(true);
  });

  test("keeps the roomy layout at and above the breakpoint", () => {
    expect(
      shouldUseCompactMobilePageEmptyLayout(MOBILE_PAGE_EMPTY_COMPACT_HEIGHT),
    ).toBe(false);
    expect(shouldUseCompactMobilePageEmptyLayout(900)).toBe(false);
  });
});
