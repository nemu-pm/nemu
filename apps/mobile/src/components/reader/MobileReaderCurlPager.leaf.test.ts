import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mobileReaderCurlLayout } from "@/lib/mobileReaderPageCurl";

const pager = readFileSync(path.join(import.meta.dir, "MobileReaderCurlPager.tsx"), "utf8");

describe("a single page's leaf is the whole stage", () => {
  test("the pager never sizes the leaf to the page's box", () => {
    expect(pager).toContain("mobileReaderCurlLayout({ stage, spreadMode, spreadSlots, foldGap, pageBox: null })");
    expect(pager).not.toContain("settledPageBox");
  });

  test("so the bands beside a letterboxed page turn with it and a zoomed page reaches past its box", () => {
    const layout = mobileReaderCurlLayout({ stage: { width: 466, height: 678 }, spreadMode: false, pageBox: null });
    expect(layout.frame).toEqual({ x: 0, y: 0, width: 466, height: 678 });
    expect(layout.pageLeaf).toBeUndefined();
  });
});
