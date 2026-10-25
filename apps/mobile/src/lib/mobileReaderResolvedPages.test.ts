import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  keepMobileReaderResolvedPages,
  rememberMobileReaderResolvedPages,
  resetMobileReaderResolvedPagesForTesting,
  withMobileReaderResolvedPages,
} from "./mobileReaderResolvedPages";

const pending = (id: string) => ({ id, imageUri: `https://example.test/${id}.jpg`, imageProcessing: "pending" });
const fallback = (id: string) => ({ id, imageUri: `https://cdn.example.test/${id}.jpg`, imageProcessing: "fallback" });

describe("mobile reader resolved pages", () => {
  beforeEach(() => resetMobileReaderResolvedPagesForTesting());

  test("a chapter reopened this session paints the pages it resolved last time", () => {
    rememberMobileReaderResolvedPages("ch1", [fallback("0"), fallback("1"), pending("2")]);
    const reopened = withMobileReaderResolvedPages("ch1", [pending("0"), pending("1"), pending("2")]);
    expect(reopened.map((page) => page.imageProcessing)).toEqual(["fallback", "fallback", "pending"]);
    expect(reopened[0]!.imageUri).toBe("https://cdn.example.test/0.jpg");
  });

  test("another chapter, an unknown page or a page not pending keeps its own", () => {
    rememberMobileReaderResolvedPages("ch1", [fallback("0")]);
    const other = [pending("0")];
    expect(withMobileReaderResolvedPages("ch2", other)).toBe(other);
    const failed = [{ id: "0", imageUri: "https://example.test/0.jpg", imageProcessing: "failed" }];
    expect(withMobileReaderResolvedPages("ch1", failed)).toBe(failed);
  });

  test("never keeps a data URI (a processed page held in memory) or a failed page", () => {
    rememberMobileReaderResolvedPages("ch1", [
      { id: "0", imageUri: "data:image/png;base64,AAAA", imageProcessing: "ready" },
      { id: "1", imageUri: "https://example.test/1.jpg", imageProcessing: "failed" },
      { id: "2", imageUri: "file:///processed/2.png", imageProcessing: "ready" },
    ]);
    const reopened = withMobileReaderResolvedPages("ch1", [pending("0"), pending("1"), pending("2")]);
    expect(reopened.map((page) => page.imageProcessing)).toEqual(["pending", "pending", "ready"]);
  });

  test("holds a few chapters, the least recently noted going first", () => {
    for (let index = 0; index < 9; index += 1) rememberMobileReaderResolvedPages(`ch${index}`, [fallback("0")]);
    expect(withMobileReaderResolvedPages("ch0", [pending("0")])[0]!.imageProcessing).toBe("pending");
    expect(withMobileReaderResolvedPages("ch8", [pending("0")])[0]!.imageProcessing).toBe("fallback");
  });

  test("a processor's update never turns a page showing its image back into a plate", () => {
    const current = [fallback("0"), pending("1")];
    const update = [pending("0"), fallback("1")];
    const merged = keepMobileReaderResolvedPages(current, update);
    expect(merged.map((page) => page.imageProcessing)).toEqual(["fallback", "fallback"]);
    const unchanged = [fallback("0")];
    expect(keepMobileReaderResolvedPages([], unchanged)).toBe(unchanged);
  });

  test("the reader restores, keeps and remembers through it", () => {
    const reader = readFileSync(path.join(import.meta.dir, "../screens/ReaderScreen.tsx"), "utf8");
    expect(reader).toContain("withMobileReaderResolvedPages(pageListCacheKey, persisted.pages)");
    expect(reader).toContain("keepMobileReaderResolvedPages(previous.pages, refreshed.pages)");
    expect(reader).toContain("keepMobileReaderResolvedPages(current.pages, result.pages)");
    expect(reader).toContain("rememberMobileReaderResolvedPages(");
  });
});
