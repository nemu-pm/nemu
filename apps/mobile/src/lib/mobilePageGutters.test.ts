import { describe, expect, test } from "bun:test";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import {
  getMobilePageBleedStyles,
  getMobilePageGutters,
} from "./mobilePageGutters";

describe("getMobilePageGutters", () => {
  test("matches native title margins while respecting vertical bars on either side", () => {
    for (const minimum of [16, 20]) {
      const margins = { left: minimum, right: minimum };
      expect(getMobilePageGutters({}, undefined, margins).left).toBe(minimum);
      expect(getMobilePageGutters({ right: 84 }, undefined, margins)).toEqual({ left: minimum, right: 84, horizontal: minimum + 84 });
      expect(getMobilePageGutters({ left: 84 }, undefined, margins)).toEqual({ left: 84, right: minimum, horizontal: minimum + 84 });
    }
  });
  test("portrait phones keep the plain page gutter", () => {
    expect(getMobilePageGutters({ left: 0, right: 0 })).toEqual({
      left: spacing.pageX,
      right: spacing.pageX,
      horizontal: spacing.pageX * 2,
    });
  });

  test("landscape Dynamic Island insets push content past the cutout", () => {
    // iPhone 17 Pro landscape reports 62pt on both sides.
    expect(getMobilePageGutters({ left: 62, right: 62 })).toEqual({
      left: 62,
      right: 62,
      horizontal: 124,
    });
  });

  test("takes the larger of gutter and inset per side, never their sum", () => {
    expect(getMobilePageGutters({ left: 10, right: 47 })).toEqual({
      left: spacing.pageX,
      right: 47,
      horizontal: spacing.pageX + 47,
    });
  });

  test("honours a custom gutter", () => {
    expect(getMobilePageGutters({ left: 0, right: 30 }, 24)).toEqual({
      left: 24,
      right: 30,
      horizontal: 54,
    });
  });

  test("treats missing or invalid insets as zero", () => {
    expect(getMobilePageGutters({})).toEqual({
      left: spacing.pageX,
      right: spacing.pageX,
      horizontal: spacing.pageX * 2,
    });
    expect(
      getMobilePageGutters({ left: Number.NaN, right: -20 }),
    ).toEqual({
      left: spacing.pageX,
      right: spacing.pageX,
      horizontal: spacing.pageX * 2,
    });
  });
});

describe("getMobilePageBleedStyles", () => {
  test("bleeds exactly the gutters and pays them back as content padding", () => {
    expect(getMobilePageBleedStyles(getMobilePageGutters({ left: 0, right: 0 }))).toEqual({
      frame: { marginLeft: -spacing.pageX, marginRight: -spacing.pageX },
      content: { paddingLeft: spacing.pageX, paddingRight: spacing.pageX },
    });
    expect(getMobilePageBleedStyles(getMobilePageGutters({ left: 62, right: 62 }))).toEqual({
      frame: { marginLeft: -62, marginRight: -62 },
      content: { paddingLeft: 62, paddingRight: 62 },
    });
  });

  test("overscan widens the bleed without moving resting content", () => {
    // Portrait rows tuned as `marginHorizontal: -18, paddingHorizontal: 18`.
    const styles = getMobilePageBleedStyles({ left: 16, right: 16 }, 2);
    expect(styles).toEqual({
      frame: { marginLeft: -18, marginRight: -18 },
      content: { paddingLeft: 18, paddingRight: 18 },
    });
    expect(styles.frame.marginLeft + styles.content.paddingLeft).toBe(0);
  });
});

describe("bleed runs under the vertical bar column (Duo outer display and rail)", () => {
  test("the row reaches the window edge on the bar's side and its last item rests on the page's margin", () => {
    expect(getMobilePageBleedStyles({ left: 16, right: 84 }, 2)).toEqual({
      frame: { marginLeft: -18, marginRight: -86 },
      content: { paddingLeft: 18, paddingRight: 86 },
    });
  });

  test.each([
    ["iphone-duo-outer", "portrait"],
    ["iphone-duo-inner", "landscape-left"],
    ["iphone-duo-inner", "landscape-right"],
  ])("real insets, %s %s: frame spans the window, content the page", (screen, orientation) => {
    const m = fixture.measurements.find((entry) => entry.screen === screen && entry.orientation === orientation)!;
    const gutters = getMobilePageGutters(m.insets);
    const { frame, content } = getMobilePageBleedStyles(gutters);
    // The page's own content box plus what the row pulls out on each side is the whole window.
    const pageWidth = m.bounds.width - gutters.horizontal;
    expect(pageWidth - frame.marginLeft - frame.marginRight).toBe(m.bounds.width);
    // Paid back as padding: at rest, the row's content is exactly the page's.
    expect(m.bounds.width - content.paddingLeft - content.paddingRight).toBe(pageWidth);
  });
});
