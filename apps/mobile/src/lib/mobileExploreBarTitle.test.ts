import { describe, expect, test } from "bun:test";
import {
  getMobileExploreBarTitleCentredWidth,
  getMobileExploreBarTitleShown,
  getMobileExploreBarTitleMaxWidth,
  MOBILE_EXPLORE_BAR_TITLE_MAX_WIDTH,
  MOBILE_EXPLORE_BAR_TITLE_MIN_WIDTH,
} from "./mobileExploreBarTitle";

describe("bar title width", () => {
  test("a phone's title ends before a three-button group", () => {
    // 420 pt window: back button ends at 64, the group of three starts at 240.
    const width = getMobileExploreBarTitleMaxWidth(420, 3);
    expect(width).toBe(156);
    expect(20 + 44 + 12 + width).toBeLessThanOrEqual(240 - 8);
  });

  test("fewer buttons leave the title more room", () => {
    const three = getMobileExploreBarTitleMaxWidth(420, 3);
    const one = getMobileExploreBarTitleMaxWidth(420, 1);
    const none = getMobileExploreBarTitleMaxWidth(420, 0);
    expect(one).toBeGreaterThan(three);
    expect(none).toBeGreaterThan(one);
  });

  test("a narrow window still shows a few characters; a wide one stays a bar title", () => {
    expect(getMobileExploreBarTitleMaxWidth(320, 4)).toBe(MOBILE_EXPLORE_BAR_TITLE_MIN_WIDTH);
    expect(getMobileExploreBarTitleMaxWidth(1024, 3)).toBe(MOBILE_EXPLORE_BAR_TITLE_MAX_WIDTH);
  });

  test("centred: the title clears the back button and a single menu button symmetrically", () => {
    const width = getMobileExploreBarTitleCentredWidth(420, 1);
    // Centred on 210, the title's edges stay clear of the back button (ends at 76) and the menu (starts at 336).
    expect(210 - width / 2).toBeGreaterThanOrEqual(76);
    expect(210 + width / 2).toBeLessThanOrEqual(420 - 84);
    expect(width).toBeGreaterThan(200);
    // Three buttons leave too little room to centre anything readable.
    expect(getMobileExploreBarTitleCentredWidth(420, 3)).toBeLessThan(120);
  });

  test("shown while the hero title is past the bar, hidden again on the way back, no flicker at the line", () => {
    const t = 300;
    let shown = false;
    const seq: boolean[] = [];
    for (const y of [0, 299, 305, 309, 320, 305, 295, 293, 291, 0, 309]) {
      shown = getMobileExploreBarTitleShown(shown, y, t);
      seq.push(shown);
    }
    expect(seq).toEqual([false, false, false, true, true, true, true, true, false, false, true]);
    // Wobbling on the line does not toggle.
    let state = true;
    for (const y of [300, 298, 302, 296, 304]) {
      state = getMobileExploreBarTitleShown(state, y, t);
      expect(state).toBe(true);
    }
    expect(getMobileExploreBarTitleShown(true, 500, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
