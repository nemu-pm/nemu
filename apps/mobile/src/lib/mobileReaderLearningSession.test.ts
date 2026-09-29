import { describe, expect, test } from "bun:test";
import { mobileReaderLearningPageResetKey } from "./mobileReaderLearningSession";

const base = { registryId: "r", sourceId: "s", chapterId: "c", pageKey: "p1" };

describe("learning session reset keys", () => {
  test("page-scoped tools always follow the page", () => {
    expect(mobileReaderLearningPageResetKey(base)).not.toBe(mobileReaderLearningPageResetKey({ ...base, pageKey: "p2" }));
    expect(mobileReaderLearningPageResetKey(base)).not.toBe(mobileReaderLearningPageResetKey({ ...base, chapterId: "c2" }));
  });
});
