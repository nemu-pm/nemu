import { describe, expect, test } from "bun:test";
import {
  parseMobileCoverTintStore,
  rememberMobileCoverTint,
  serializeMobileCoverTintStore,
} from "./mobileCoverTintStore";

describe("mobile cover tint store", () => {
  test("round-trips tints in recency order", () => {
    const store = parseMobileCoverTintStore(null);
    expect(rememberMobileCoverTint(store, "https://a/cover.jpg", { r: 1, g: 2, b: 3 })).toBe(true);
    expect(rememberMobileCoverTint(store, "item:b", { r: 200, g: 100, b: 0 })).toBe(true);
    const restored = parseMobileCoverTintStore(serializeMobileCoverTintStore(store));
    expect([...restored]).toEqual([
      ["https://a/cover.jpg", { r: 1, g: 2, b: 3 }],
      ["item:b", { r: 200, g: 100, b: 0 }],
    ]);
  });

  test("an unchanged colour refreshes recency without asking for a write", () => {
    const store = parseMobileCoverTintStore(null);
    rememberMobileCoverTint(store, "a", { r: 1, g: 1, b: 1 });
    rememberMobileCoverTint(store, "b", { r: 2, g: 2, b: 2 });
    expect(rememberMobileCoverTint(store, "a", { r: 1, g: 1, b: 1 })).toBe(false);
    expect([...store.keys()]).toEqual(["b", "a"]);
    expect(rememberMobileCoverTint(store, "a", { r: 9, g: 1, b: 1 })).toBe(true);
  });

  test("evicts the oldest entries beyond the limit", () => {
    const store = parseMobileCoverTintStore(null);
    for (let index = 0; index < 5; index += 1) {
      rememberMobileCoverTint(store, `k${index}`, { r: index, g: 0, b: 0 }, 3);
    }
    expect([...store.keys()]).toEqual(["k2", "k3", "k4"]);
    const text = serializeMobileCoverTintStore(store);
    expect([...parseMobileCoverTintStore(text, 2).keys()]).toEqual(["k3", "k4"]);
  });

  test("ignores damaged, foreign and out-of-range input", () => {
    expect(parseMobileCoverTintStore("{not json").size).toBe(0);
    expect(parseMobileCoverTintStore(JSON.stringify({ version: 99, tints: [["a", 1, 2, 3]] })).size).toBe(0);
    const store = parseMobileCoverTintStore(
      JSON.stringify({
        version: 1,
        tints: [["ok", 10, 20, 30], ["bad", 300, 0, 0], ["short", 1, 2], [5, 1, 2, 3], ["", 1, 2, 3], ["float", 1.5, 2, 3]],
      }),
    );
    expect([...store]).toEqual([["ok", { r: 10, g: 20, b: 30 }]]);
  });

  test("refuses oversized keys", () => {
    const store = parseMobileCoverTintStore(null);
    expect(rememberMobileCoverTint(store, "x".repeat(3000), { r: 1, g: 2, b: 3 })).toBe(false);
    expect(store.size).toBe(0);
  });
});
