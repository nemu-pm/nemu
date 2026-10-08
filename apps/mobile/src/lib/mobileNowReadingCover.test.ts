import { describe, expect, test } from "bun:test";
import {
  getMobileNowReadingHideUnder,
  isMobileNowReadingCompactHeight,
  isMobileNowReadingCovered,
} from "./mobileNowReadingCover";

const base = { libraryFocused: true, scrolledBy: 0, hideWhileScrolledUnder: 400, firstCardActive: true };

describe("Now Reading accessory, away mode", () => {
  test("hidden only while the Library shows the same title's card", () => {
    expect(isMobileNowReadingCovered(base)).toBe(true);
    // Scrolled until the card has left, another card active, Library not in front, no cards.
    expect(isMobileNowReadingCovered({ ...base, scrolledBy: 400 })).toBe(false);
    expect(isMobileNowReadingCovered({ ...base, firstCardActive: false })).toBe(false);
    expect(isMobileNowReadingCovered({ ...base, libraryFocused: false })).toBe(false);
    expect(isMobileNowReadingCovered({ ...base, hideWhileScrolledUnder: null })).toBe(false);
  });

  test("the card counts as shown while 80 pt of it stays below the bar", () => {
    // Air: cards end at 635 pt at rest, the bar at 112 pt.
    expect(getMobileNowReadingHideUnder(635, 112)).toBe(443);
    expect(getMobileNowReadingHideUnder(100, 112)).toBe(0);
  });

  test("compact height: hidden while any card rests in view, whichever is active", () => {
    const other = { ...base, hideWhileScrolledUnder: 120, firstCardActive: false };
    expect(isMobileNowReadingCovered(other)).toBe(false);
    expect(isMobileNowReadingCovered({ ...other, compactHeight: true })).toBe(true);
    // Still only on the Library and while the cards show.
    expect(isMobileNowReadingCovered({ ...other, compactHeight: true, scrolledBy: 200 })).toBe(false);
    expect(isMobileNowReadingCovered({ ...other, compactHeight: true, libraryFocused: false })).toBe(false);
    expect(isMobileNowReadingCompactHeight(420)).toBe(true);
    expect(isMobileNowReadingCompactHeight(912)).toBe(false);
    expect(isMobileNowReadingCompactHeight(0)).toBe(false);
  });

  test("compact height: a title page's info pane sends it aside in every mode", () => {
    const away = { ...base, libraryFocused: false, hideWhileScrolledUnder: null };
    expect(isMobileNowReadingCovered(away)).toBe(false);
    expect(isMobileNowReadingCovered({ ...away, compactHeight: true, shortTitlePane: true })).toBe(true);
    expect(isMobileNowReadingCovered({ ...away, shortTitlePane: false })).toBe(false);
  });
});
