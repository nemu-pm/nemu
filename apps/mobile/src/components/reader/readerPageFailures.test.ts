import { describe, expect, test } from "bun:test";
import { readerSegmentErrorKey, readerVisiblePageFailures } from "./readerPageFailures";

type Page = { id: string; imageProcessing?: string };
const identity = (page: Page) => `ch1:${page.id}`;

describe("readerVisiblePageFailures", () => {
  test("a healthy spread has nothing to retry", () => {
    expect(readerVisiblePageFailures([{ id: "a" }, { id: "b" }], identity, ["ch1:c"])).toEqual([]);
  });

  test("names each failed page on screen by how it failed", () => {
    const processing = { id: "a", imageProcessing: "failed" };
    const image = { id: "b" };
    const segmented = { id: "c" };
    const keys = ["ch1:b", readerSegmentErrorKey("ch1:c", 2), readerSegmentErrorKey("ch1:c", 5)];
    expect(readerVisiblePageFailures([processing, image, segmented], identity, keys)).toEqual([
      { kind: "processing", page: processing },
      { kind: "image", page: image, identity: "ch1:b" },
      { kind: "segments", page: segmented, errorKeys: ["ch1:c:segment:2", "ch1:c:segment:5"] },
    ]);
  });

  test("another page's tile is not this page's failure", () => {
    expect(readerVisiblePageFailures([{ id: "a" }], identity, ["ch1:ab:segment:0"])).toEqual([]);
  });
});
