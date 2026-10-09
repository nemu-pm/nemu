import { describe, expect, test } from "bun:test";
import {
  getMobileCollectionFolderPeek,
  getMobileCollectionFolderWidth,
  getMobileExploreSectionHeadingHeight,
  MOBILE_COLLECTION_FOLDER_ASPECT,
  MOBILE_COLLECTION_FOLDER_GAP,
} from "./mobileCollectionFolderGeometry";

const GAP = 12;

describe("collection folders", () => {
  test("a phone shows two whole folders and a peek of the third; the width is whole points, bounded, and never shrinks as the window grows", () => {
    expect(getMobileCollectionFolderWidth(380, GAP)).toBe(164);
    expect(getMobileCollectionFolderWidth(0, GAP)).toBe(150);
    expect(getMobileCollectionFolderWidth(1300, GAP)).toBe(196);
    let previous = 0;
    for (let content = 240; content <= 1400; content += 7) {
      const width = getMobileCollectionFolderWidth(content, GAP);
      expect(Number.isInteger(width) && width >= previous).toBe(true);
      previous = width;
    }
  });

  test("at rest the folders show 40 % or more of their art, never so much that the names sit under the accessory; the peek grows with the heading", () => {
    const art = Math.round(getMobileCollectionFolderWidth(380, MOBILE_COLLECTION_FOLDER_GAP) * MOBILE_COLLECTION_FOLDER_ASPECT);
    expect(getMobileCollectionFolderPeek(380)).toEqual({ min: 40 + Math.round(art * 0.4), max: 40 + art - 56 });
    const grown = getMobileExploreSectionHeadingHeight(2.1) - 40;
    expect(grown).toBeGreaterThan(0);
    expect(getMobileCollectionFolderPeek(380, 2.1).min - getMobileCollectionFolderPeek(380).min).toBe(grown);
  });
});
