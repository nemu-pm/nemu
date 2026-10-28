import { describe, expect, test } from "bun:test";
import { getMobileCollectionFolderWidth } from "./mobileCollectionFolderGeometry";

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
});
