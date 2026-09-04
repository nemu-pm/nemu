import { describe, expect, test } from "bun:test";
import {
  captureMobileGridScrollRatio,
  resolveMobileGridScrollRestoreOffset,
  shouldRestoreMobileGridScroll,
} from "./mobileGridScrollRestore";

describe("mobile grid scroll restore", () => {
  test("captures the proportion of the scrollable range", () => {
    expect(
      captureMobileGridScrollRatio({
        offset: 900,
        contentHeight: 2_600,
        viewportHeight: 800,
      }),
    ).toBeCloseTo(0.5, 5);
  });

  test("clamps overscroll and content shorter than the viewport", () => {
    expect(
      captureMobileGridScrollRatio({
        offset: -40,
        contentHeight: 2_000,
        viewportHeight: 800,
      }),
    ).toBe(0);
    expect(
      captureMobileGridScrollRatio({
        offset: 4_000,
        contentHeight: 2_000,
        viewportHeight: 800,
      }),
    ).toBe(1);
    expect(
      captureMobileGridScrollRatio({
        offset: 10,
        contentHeight: 400,
        viewportHeight: 800,
      }),
    ).toBe(0);
  });

  test("restores the same proportion against the new content height", () => {
    const ratio = captureMobileGridScrollRatio({
      offset: 900,
      contentHeight: 2_600,
      viewportHeight: 800,
    });

    // Rotating to three columns shortens the same listing page.
    expect(
      resolveMobileGridScrollRestoreOffset({
        ratio,
        contentHeight: 1_800,
        viewportHeight: 800,
      }),
    ).toBeCloseTo(500, 5);
  });

  test("never restores past the top when there is nothing to scroll", () => {
    expect(
      resolveMobileGridScrollRestoreOffset({
        ratio: 0.8,
        contentHeight: 400,
        viewportHeight: 800,
      }),
    ).toBe(0);
    expect(
      resolveMobileGridScrollRestoreOffset({
        ratio: 0,
        contentHeight: 4_000,
        viewportHeight: 800,
      }),
    ).toBe(0);
  });

  test("only restores when a stored ratio can land somewhere", () => {
    expect(
      shouldRestoreMobileGridScroll({
        ratio: null,
        contentHeight: 4_000,
        viewportHeight: 800,
      }),
    ).toBe(false);
    expect(
      shouldRestoreMobileGridScroll({
        ratio: 0,
        contentHeight: 4_000,
        viewportHeight: 800,
      }),
    ).toBe(false);
    expect(
      shouldRestoreMobileGridScroll({
        ratio: 0.4,
        contentHeight: 400,
        viewportHeight: 800,
      }),
    ).toBe(false);
    expect(
      shouldRestoreMobileGridScroll({
        ratio: 0.4,
        contentHeight: 4_000,
        viewportHeight: 800,
      }),
    ).toBe(true);
  });
});
