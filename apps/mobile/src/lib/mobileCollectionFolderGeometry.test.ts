import { describe, expect, test } from "bun:test";
import {
  getMobileCollectionFolderPeek,
  getMobileCollectionFolderWidth,
  getMobileExploreSectionHeadingHeight,
  MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE,
  MOBILE_COLLECTION_FOLDER_ASPECT,
  MOBILE_COLLECTION_FOLDER_GAP,
  MOBILE_COLLECTION_FOLDER_CUT,
  MOBILE_COLLECTION_FOLDER_MAX_WIDTH,
  MOBILE_COLLECTION_FOLDER_MIN_WIDTH,
  MOBILE_COLLECTION_FOLDER_PEEK,
} from "./mobileCollectionFolderGeometry";

const GAP = 12;

describe("collection folder width", () => {
  test("a phone shows two whole folders and a peek of the third", () => {
    // 420 pt window, 20 pt gutters.
    const content = 380;
    const width = getMobileCollectionFolderWidth(content, GAP);
    expect(width).toBe(164);
    expect(width * 2 + GAP + MOBILE_COLLECTION_FOLDER_PEEK).toBe(content);
  });

  test("a narrow window keeps a folder wide enough for its fanned covers", () => {
    expect(getMobileCollectionFolderWidth(280, GAP)).toBe(MOBILE_COLLECTION_FOLDER_MIN_WIDTH);
    expect(getMobileCollectionFolderWidth(0, GAP)).toBe(MOBILE_COLLECTION_FOLDER_MIN_WIDTH);
  });

  test("a wide window fits more folders instead of larger ones", () => {
    for (const content of [700, 900, 1300]) {
      expect(getMobileCollectionFolderWidth(content, GAP)).toBe(MOBILE_COLLECTION_FOLDER_MAX_WIDTH);
    }
  });

  test("the width is whole points and never shrinks as the window grows", () => {
    let previous = 0;
    for (let content = 240; content <= 1400; content += 7) {
      const width = getMobileCollectionFolderWidth(content, GAP);
      expect(Number.isInteger(width)).toBe(true);
      expect(width).toBeGreaterThanOrEqual(previous);
      previous = width;
    }
  });
});

describe("collections at rest", () => {
  test("the folders show at least 40 % of their art, and never so much that their names sit in the accessory's slit", () => {
    // Air: 380 pt of content, 164 pt folders.
    const art = Math.round(getMobileCollectionFolderWidth(380, MOBILE_COLLECTION_FOLDER_GAP) * MOBILE_COLLECTION_FOLDER_ASPECT);
    expect(getMobileCollectionFolderPeek(380)).toEqual({
      min: 40 + Math.round(art * 0.4),
      max: 40 + art - MOBILE_COLLECTION_FOLDER_CUT,
    });
  });

  test("the heading grows with the text size, up to the heading's own cap", () => {
    expect(getMobileExploreSectionHeadingHeight(1)).toBe(40);
    // XXXL (1.235) and AX3 (2.1, capped at 1.3).
    expect(getMobileExploreSectionHeadingHeight(1.235)).toBe(47);
    expect(getMobileExploreSectionHeadingHeight(2.1)).toBe(Math.ceil(28 * MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE) + 12);
    expect(getMobileExploreSectionHeadingHeight(0.8)).toBe(40);
    const base = getMobileCollectionFolderPeek(380);
    const large = getMobileCollectionFolderPeek(380, 2.1);
    expect(large.min - base.min).toBe(getMobileExploreSectionHeadingHeight(2.1) - 40);
    expect(large.max - base.max).toBe(getMobileExploreSectionHeadingHeight(2.1) - 40);
  });
});
