import { describe, expect, test } from "bun:test";
import {
  parseMobileCoverTintStore,
  rememberMobileCoverTint,
  serializeMobileCoverTintStore,
} from "./mobileCoverTintStore";

describe("mobile cover tint store", () => {
  test("round-trips in recency order, refreshes an unchanged colour without a write, and evicts the oldest past the limit", () => {
    const store = parseMobileCoverTintStore(null);
    expect(rememberMobileCoverTint(store, "a", { r: 1, g: 1, b: 1 })).toBe(true);
    expect(rememberMobileCoverTint(store, "b", { r: 2, g: 2, b: 2 })).toBe(true);
    expect(rememberMobileCoverTint(store, "a", { r: 1, g: 1, b: 1 })).toBe(false);
    expect([...store.keys()]).toEqual(["b", "a"]);
    expect([...parseMobileCoverTintStore(serializeMobileCoverTintStore(store))]).toEqual([
      ["b", { r: 2, g: 2, b: 2 }],
      ["a", { r: 1, g: 1, b: 1 }],
    ]);
    const bounded = parseMobileCoverTintStore(null);
    for (let index = 0; index < 5; index += 1) rememberMobileCoverTint(bounded, `k${index}`, { r: index, g: 0, b: 0 }, 3);
    expect([...bounded.keys()]).toEqual(["k2", "k3", "k4"]);
  });

  test("damaged, foreign, out-of-range and oversized input is dropped", () => {
    expect(parseMobileCoverTintStore("{not json").size).toBe(0);
    expect(parseMobileCoverTintStore(JSON.stringify({ version: 99, tints: [["a", 1, 2, 3]] })).size).toBe(0);
    const store = parseMobileCoverTintStore(
      JSON.stringify({
        version: 1,
        tints: [["ok", 10, 20, 30], ["bad", 300, 0, 0], ["short", 1, 2], [5, 1, 2, 3], ["float", 1.5, 2, 3]],
      }),
    );
    expect([...store]).toEqual([["ok", { r: 10, g: 20, b: 30 }]]);
    expect(rememberMobileCoverTint(store, "x".repeat(3000), { r: 1, g: 2, b: 3 })).toBe(false);
  });
});
