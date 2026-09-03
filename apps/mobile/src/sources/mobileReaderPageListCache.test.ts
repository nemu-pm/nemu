import { describe, expect, test } from "bun:test";
import { decodeMobileReaderPageListCache } from "./mobileReaderPageListCache";

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
});
