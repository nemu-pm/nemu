import { describe, expect, test } from "bun:test";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import {
  getMobilePageBleedStyles,
  getMobilePageGutters,
  getMobileRailRowContentInsets,
  MOBILE_RAIL_ROW_CLEARANCE,
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

describe("bleed never enters the vertical bar column", () => {
  test("the bar side stops at the safe edge; the other side still bleeds", () => {
    expect(getMobilePageBleedStyles({ left: 16, right: 84 }, 2, "right")).toEqual({
      frame: { marginLeft: -18, marginRight: -0 },
      content: { paddingLeft: 18, paddingRight: 8 },
    });
  });
});

describe("getMobileRailRowContentInsets (Duo F2: Search's source chips beside the rail)", () => {
  const measured = (orientation: string) =>
    fixture.measurements.find((m) => m.screen === "iphone-duo-outer" && m.pose === "closed" && m.orientation === orientation)!;
  const titleMargins = { left: 20, right: 20 };

  /** Where the row's last (rail right) or first (rail left) chip rests, scrolled to that end. */
  function restingEdge(width: number, insets: { left: number; right: number }, side: "left" | "right", margins = titleMargins) {
    const gutters = getMobilePageGutters(insets, undefined, margins);
    const bleed = getMobilePageBleedStyles(gutters, 2, side);
    const rail = getMobileRailRowContentInsets({ gutters, safeAreaInsets: insets, verticalBarSide: side })!;
    const content = { ...bleed.content, ...rail };
    return side === "right"
      ? { chip: width - gutters.right + bleed.frame.marginRight - content.paddingRight, rail: width - insets.right }
      : { chip: gutters.left - bleed.frame.marginLeft + content.paddingLeft, rail: insets.left };
  }

  test("closed, rail right: the last chip rests 16pt before the rail's content edge (was 8pt)", () => {
    const m = measured("portrait");
    expect(m.insets.right).toBe(84);
    const { chip, rail } = restingEdge(m.bounds.width, m.insets, "right");
    expect(rail).toBe(382);
    expect(rail - chip).toBe(MOBILE_RAIL_ROW_CLEARANCE);
    expect(MOBILE_RAIL_ROW_CLEARANCE).toBe(16);
  });

  test("closed landscape, rail left: the first chip starts 16pt after the rail's content edge (leading inset)", () => {
    const m = measured("landscape-right");
    expect(m.insets.left).toBe(84);
    const { chip, rail } = restingEdge(m.bounds.width, m.insets, "left");
    expect(chip - rail).toBe(16);
    const gutters = getMobilePageGutters(m.insets, undefined, titleMargins);
    expect(getMobileRailRowContentInsets({ gutters, safeAreaInsets: m.insets, verticalBarSide: "left" })).toEqual({ paddingLeft: 16 });
  });

  test("follows the reported inset, not a constant: a gutter wider than the rail's inset needs less", () => {
    // An 80pt rail inset with 84pt system margins: the frame already ends 4pt short of the rail.
    const insets = { left: 0, right: 80 };
    const margins = { left: 20, right: 84 };
    const { chip, rail } = restingEdge(466, insets, "right", margins);
    expect(rail).toBe(386);
    expect(rail - chip).toBe(16);
    const gutters = getMobilePageGutters(insets, undefined, margins);
    expect(getMobileRailRowContentInsets({ gutters, safeAreaInsets: insets, verticalBarSide: "right" })).toEqual({ paddingRight: 12 });
    // A wider rail inset is the gutter itself: the full clearance.
    const wide = { left: 0, right: 120 };
    expect(getMobileRailRowContentInsets({ gutters: getMobilePageGutters(wide), safeAreaInsets: wide, verticalBarSide: "right" })).toEqual({ paddingRight: 16 });
  });

  test("no rail: nothing changes; no reported inset: the gutter is the rail's edge", () => {
    const gutters = getMobilePageGutters({ left: 0, right: 0 });
    expect(getMobileRailRowContentInsets({ gutters, safeAreaInsets: { left: 0, right: 0 }, verticalBarSide: null })).toBeNull();
    expect(getMobileRailRowContentInsets({ gutters: { left: 16, right: 84 }, safeAreaInsets: null, verticalBarSide: "right" })).toEqual({ paddingRight: 16 });
  });
});
