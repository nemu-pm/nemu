import { describe, expect, test } from "bun:test";
import { moveSourceSettingListItem } from "./settings-values";

describe("moveSourceSettingListItem", () => {
  test("moves an entry up and down without mutating the input", () => {
    const values = ["a", "b", "c"];

    expect(moveSourceSettingListItem(values, 1, 0)).toEqual(["b", "a", "c"]);
    expect(moveSourceSettingListItem(values, 1, 2)).toEqual(["a", "c", "b"]);
    expect(values).toEqual(["a", "b", "c"]);
  });

  test("moves across the whole list", () => {
    expect(moveSourceSettingListItem(["a", "b", "c", "d"], 0, 3)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
    expect(moveSourceSettingListItem(["a", "b", "c", "d"], 3, 0)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  test("reports a no-op move as null", () => {
    expect(moveSourceSettingListItem(["a", "b"], 1, 1)).toBeNull();
    expect(moveSourceSettingListItem([], 0, 0)).toBeNull();
  });

  test("rejects out-of-range and non-integer indexes", () => {
    const values = ["a", "b", "c"];

    expect(moveSourceSettingListItem(values, -1, 0)).toBeNull();
    expect(moveSourceSettingListItem(values, 0, -1)).toBeNull();
    expect(moveSourceSettingListItem(values, 3, 0)).toBeNull();
    expect(moveSourceSettingListItem(values, 0, 3)).toBeNull();
    expect(moveSourceSettingListItem(values, 0.5, 1)).toBeNull();
    expect(moveSourceSettingListItem(values, 0, Number.NaN)).toBeNull();
  });
});
