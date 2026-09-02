import { describe, expect, test } from "bun:test";
import {
  keepReferenceIfUnchanged,
  stabilizeListReferences,
} from "./mobileStableData";

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

describe("stabilizeListReferences", () => {
  const keyOf = (item: { id: string }) => item.id;

  test("returns the current array when nothing changed", () => {
    const current = [
      { id: "a", version: 1 },
      { id: "b", version: 2 },
    ];
    const next = [
      { id: "a", version: 1 },
      { id: "b", version: 2 },
    ];
    expect(stabilizeListReferences(current, next, keyOf)).toBe(current);
  });

  test("keeps sibling item references when only one item changed", () => {
    const a = { id: "a", version: 1 };
    const b = { id: "b", version: 2 };
    const current = [a, b];
    const next = [
      { id: "a", version: 1 },
      { id: "b", version: 3 },
    ];
    const result = stabilizeListReferences(current, next, keyOf);
    expect(result).not.toBe(current);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(next[1]!);
  });

  test("keeps unchanged item references across insertions and reorders", () => {
    const a = { id: "a", version: 1 };
    const current = [a];
    const next = [
      { id: "b", version: 1 },
      { id: "a", version: 1 },
    ];
    const result = stabilizeListReferences(current, next, keyOf);
    expect(result).not.toBe(current);
    expect(result[0]).toBe(next[0]!);
    expect(result[1]).toBe(a);
  });

  test("a removal produces a new array", () => {
    const current = [
      { id: "a", version: 1 },
      { id: "b", version: 2 },
    ];
    const next = [{ id: "a", version: 1 }];
    const result = stabilizeListReferences(current, next, keyOf);
    expect(result).not.toBe(current);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(current[0]!);
  });
});
