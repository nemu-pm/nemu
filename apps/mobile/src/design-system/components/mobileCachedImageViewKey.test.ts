import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileCachedImageViewKey } from "./mobileCachedImageViewKey";

const jump = "file:///cache/nemu-image-cache/mobile-image_3Alocal_3Ad8a17854.png";
const webtoon = "file:///cache/nemu-image-cache/mobile-image_3Alocal_3Ab5558175.png";

describe("MobileCachedImage native view key (Browse icons, Duo iOS 27.1)", () => {
  test("two sources' icons never share a native image view, even at the same repair generation", () => {
    expect(getMobileCachedImageViewKey({ uri: jump }, 0)).not.toBe(getMobileCachedImageViewKey({ uri: webtoon }, 0));
  });

  test("a repair still replaces the view for the same URI", () => {
    expect(getMobileCachedImageViewKey({ uri: jump }, 1)).not.toBe(getMobileCachedImageViewKey({ uri: jump }, 0));
  });

  test("an image that keeps its URI keeps its key (reader pages and covers do not remount or flash)", () => {
    expect(getMobileCachedImageViewKey({ uri: jump }, 0)).toBe(getMobileCachedImageViewKey({ uri: jump }, 0));
    // New source objects with the same URI and other headers: same view.
    expect(getMobileCachedImageViewKey({ uri: jump, headers: { a: "1" } } as { uri: string }, 0)).toBe(
      getMobileCachedImageViewKey({ uri: jump }, 0),
    );
    expect(getMobileCachedImageViewKey(undefined, 0)).toBe("#0");
  });

  test("the inner Image is keyed by it, and Browse's library rows are real views", () => {
    const image = readFileSync(path.join(import.meta.dir, "MobileCachedImage.tsx"), "utf8");
    expect(image).toContain("key={getMobileCachedImageViewKey(imageSource, localRepairGeneration)}");
    expect(image).not.toContain("key={localRepairGeneration}");
    const browse = readFileSync(path.join(import.meta.dir, "../../screens/BrowseScreen.tsx"), "utf8");
    expect(browse).toContain("<View key={source.id} collapsable={false}>");
  });
});
