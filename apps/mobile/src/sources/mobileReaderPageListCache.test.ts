import { describe, expect, test } from "bun:test";
import {
  decodeMobileReaderPageListCache,
  decodeMobileReaderSourceImageProcessor,
} from "./mobileReaderPageListCache";

describe("persisted mobile reader page lists", () => {
  test("accepts a bounded fresh remote page list", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      v: 1,
      savedAt: 100,
      fetchedAt: 90,
      pages: [{ id: "0", index: 0, imageUri: "https://example.test/0.jpg", imageUriOwnership: "source" }],
      chapters: [{ id: "chapter" }],
      chapter: { id: "chapter" },
    }));
    expect(decodeMobileReaderPageListCache(bytes, 101)?.pages).toHaveLength(1);
  });

  test("rejects stale and local-uri payloads", () => {
    const payload = {
      v: 1,
      savedAt: 1,
      fetchedAt: 1,
      pages: [{ id: "0", index: 0, imageUri: "file:///private/page.jpg", imageUriOwnership: "app" }],
      chapters: [{ id: "chapter" }],
      chapter: { id: "chapter" },
    };
    expect(decodeMobileReaderPageListCache(new TextEncoder().encode(JSON.stringify(payload)), 2)).toBeNull();
  });

  test("keeps whether the source processed the list's images; absent stays unknown", () => {
    const payload = (extra: Record<string, unknown>) =>
      new TextEncoder().encode(JSON.stringify({
        v: 1,
        savedAt: 100,
        fetchedAt: 90,
        pages: [{ id: "0", index: 0, imageUri: "https://example.test/0.jpg", imageUriOwnership: "source" }],
        chapters: [{ id: "chapter" }],
        chapter: { id: "chapter" },
        ...extra,
      }));
    expect(decodeMobileReaderPageListCache(payload({ imageProcessor: true }), 101)?.imageProcessor).toBe(true);
    expect(decodeMobileReaderPageListCache(payload({ imageProcessor: false }), 101)?.imageProcessor).toBe(false);
    expect(decodeMobileReaderPageListCache(payload({}), 101)?.imageProcessor).toBeUndefined();
    expect(decodeMobileReaderPageListCache(payload({ imageProcessor: "yes" }), 101)?.imageProcessor).toBeUndefined();
  });

  test("the per-source processor record reads 1 / 0, anything else unknown", () => {
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(decodeMobileReaderSourceImageProcessor(bytes("1"))).toBe(true);
    expect(decodeMobileReaderSourceImageProcessor(bytes("0"))).toBe(false);
    expect(decodeMobileReaderSourceImageProcessor(bytes("x"))).toBeNull();
    expect(decodeMobileReaderSourceImageProcessor(null)).toBeNull();
  });
});
