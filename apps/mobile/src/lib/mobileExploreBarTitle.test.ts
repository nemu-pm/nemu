import { describe, expect, test } from "bun:test";
import {
  getMobileExploreBarTitleCentredWidth,
  getMobileExploreBarTitleMaxWidth,
  getMobileExploreBarTitleShown,
} from "./mobileExploreBarTitle";

describe("bar title", () => {
  test("the title ends before the button group, gets more room with fewer buttons, and stays within its limits", () => {
    // 420 pt window: the group of three starts at 240.
    const three = getMobileExploreBarTitleMaxWidth(420, 3);
    expect(three).toBe(156);
    expect(20 + 44 + 12 + three).toBeLessThanOrEqual(240 - 8);
    expect(getMobileExploreBarTitleMaxWidth(420, 1)).toBeGreaterThan(three);
    expect(getMobileExploreBarTitleMaxWidth(320, 4)).toBe(96);
    expect(getMobileExploreBarTitleMaxWidth(1024, 3)).toBe(260);
  });

  test("a centred title clears the back button and one menu button symmetrically; three buttons leave no room", () => {
    const width = getMobileExploreBarTitleCentredWidth(420, 1);
    expect(210 - width / 2).toBeGreaterThanOrEqual(76);
    expect(210 + width / 2).toBeLessThanOrEqual(420 - 84);
    expect(getMobileExploreBarTitleCentredWidth(420, 3)).toBeLessThan(120);
  });

  test("shown once the hero title passes the bar, hidden on the way back, and wobbling on the line does not toggle", () => {
    const seq: boolean[] = [];
    let shown = false;
    for (const y of [0, 299, 305, 309, 320, 305, 295, 293, 291, 0]) {
      shown = getMobileExploreBarTitleShown(shown, y, 300);
      seq.push(shown);
    }
    expect(seq).toEqual([false, false, false, true, true, true, true, true, false, false]);
    let state = true;
    for (const y of [300, 298, 302, 296, 304]) state = getMobileExploreBarTitleShown(state, y, 300);
    expect(state).toBe(true);
  });
});
