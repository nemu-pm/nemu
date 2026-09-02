import { describe, expect, test } from "bun:test";
import { keepReferenceIfUnchanged } from "./mobileStableData";

describe("keepReferenceIfUnchanged", () => {
  test("keeps the current reference for content-identical data", () => {
    const current = [{ id: "a", version: 1 }, { id: "b", version: 2 }];
    const next = [{ id: "a", version: 1 }, { id: "b", version: 2 }];
    expect(keepReferenceIfUnchanged(current, next)).toBe(current);
  });

  test("returns the next reference when content differs", () => {
    const current = [{ id: "a", version: 1 }];
    for (const next of [
      [{ id: "a", version: 2 }],
      [{ id: "a", version: 1 }, { id: "b", version: 1 }],
      [],
    ]) {
      expect(keepReferenceIfUnchanged(current, next)).toBe(next);
    }
  });

  test("order changes count as changes", () => {
    const current = [{ id: "a" }, { id: "b" }];
    const next = [{ id: "b" }, { id: "a" }];
    expect(keepReferenceIfUnchanged(current, next)).toBe(next);
  });

  test("unserializable data falls back to the next reference", () => {
    type Cyclic = { self?: unknown };
    const current: Cyclic = {};
    current.self = current;
    const next: Cyclic = {};
    next.self = next;
    expect(keepReferenceIfUnchanged(current, next)).toBe(next);
  });
});
