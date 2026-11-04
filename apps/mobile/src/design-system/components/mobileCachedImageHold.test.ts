import { describe, expect, test } from "bun:test";
import { resolveMobileHeldImage } from "./mobileCachedImageHold";

describe("resolveMobileHeldImage", () => {
  const shown = { sourceKey: "old", source: { uri: "file:///old.jpg" } };
  const base = { hold: true, hasImage: false, failed: false, sourceKey: "new", shown };

  test("a new cover still loading keeps the cover already shown", () => {
    expect(resolveMobileHeldImage(base)).toEqual({ uri: "file:///old.jpg" });
  });

  test("nothing is held once the new cover can show, after a failure, or when off", () => {
    expect(resolveMobileHeldImage({ ...base, hasImage: true })).toBeNull();
    expect(resolveMobileHeldImage({ ...base, failed: true })).toBeNull();
    expect(resolveMobileHeldImage({ ...base, hold: false })).toBeNull();
  });

  test("nothing to hold before any image loaded or for the same source", () => {
    expect(resolveMobileHeldImage({ ...base, shown: null })).toBeNull();
    expect(resolveMobileHeldImage({ ...base, sourceKey: "old" })).toBeNull();
  });
});
