import { describe, expect, test } from "bun:test";
import { FilterType, type Filter, type FilterValue } from "@/sources/aidokuContract";
import { getMobileStrings } from "./mobileI18n";
import {
  buildMobileSourceFilterMenus,
  getMobileSourceFilterMenuCount,
  resolveMobileSourceFilterMenuEvent,
} from "./mobileSourceFilterMenu";

const strings = getMobileStrings("en");
const sort = { type: FilterType.Sort, name: "Sort", options: ["Latest", "Popular"], canAscend: true } as unknown as Filter;
const status = { type: FilterType.Select, name: "Status", options: ["Ongoing", "Done"] } as unknown as Filter;
const genre = { type: FilterType.Genre, name: "Genre", options: ["Action", "Drama"], ids: ["a", "d"], canExclude: true } as unknown as Filter;
const adult = { type: FilterType.Check, name: "Adult", optionName: "Adult" } as unknown as Filter;
const filters = [sort, status, genre, adult];

describe("source filter menus", () => {
  test("no active filters: plain label, sort in its own menu", () => {
    const menus = buildMobileSourceFilterMenus(filters, [], strings);
    expect(menus.filtersLabel).toBe("Filters");
    expect(menus.filterCount).toBe(0);
    expect(menus.sortActions.map((action) => action.title)).toHaveLength(2);
    expect(menus.sortLabel).toBeTruthy();
    expect(menus.filterActions.some((action) => action.title === "Status")).toBe(true);
  });

  test("the badge counts every active filter but not the sort", () => {
    const values: FilterValue[] = [
      { type: FilterType.Sort, name: "Sort", value: { index: 1, ascending: false } },
      { type: FilterType.Select, name: "Status", value: "Done" },
      { type: FilterType.Genre, name: "Genre", value: { included: ["a", "d"], excluded: [] } },
    ];
    expect(getMobileSourceFilterMenuCount(filters, values)).toBe(3);
    const menus = buildMobileSourceFilterMenus(filters, values, strings);
    expect(menus.filtersLabel).toBe("Filters (3)");
    expect(menus.filterActions.some((action) => action.id === "clear")).toBe(true);
    expect(menus.filterActions.some((action) => action.id === "panel")).toBe(true);
  });

  test("an active group names its value and checks it", () => {
    const values: FilterValue[] = [{ type: FilterType.Select, name: "Status", value: "Done" }];
    const menus = buildMobileSourceFilterMenus(filters, values, strings);
    const group = menus.filterActions.find((action) => action.title.startsWith("Status"));
    expect(group?.title).toBe("Status · Done");
    expect(group?.subactions?.find((action) => action.title === "Done")?.state).toBe("on");
  });

  test("taps resolve to the same values the picker sheet would set", () => {
    expect(resolveMobileSourceFilterMenuEvent("opt:1:Done", filters, [])).toEqual({ kind: "change", filter: status, value: "Done" });
    const values: FilterValue[] = [{ type: FilterType.Select, name: "Status", value: "Done" }];
    expect(resolveMobileSourceFilterMenuEvent("opt:1:Done", filters, values)).toEqual({ kind: "change", filter: status, value: undefined });
    expect(resolveMobileSourceFilterMenuEvent("opt:1:", filters, values)).toEqual({ kind: "change", filter: status, value: undefined });
    expect(resolveMobileSourceFilterMenuEvent("check:3", filters, [])).toEqual({ kind: "change", filter: adult, value: 1 });
    expect(resolveMobileSourceFilterMenuEvent("clear", filters, values)).toEqual({ kind: "clear" });
    expect(resolveMobileSourceFilterMenuEvent("panel", filters, values)).toEqual({ kind: "panel" });
    expect(resolveMobileSourceFilterMenuEvent("opt:9:x", filters, values)).toBeNull();
  });

  test("re-tapping the current sort flips its direction", () => {
    const values: FilterValue[] = [{ type: FilterType.Sort, name: "Sort", value: { index: 0, ascending: false } }];
    expect(resolveMobileSourceFilterMenuEvent("opt:0:0", filters, values)).toEqual({
      kind: "change",
      filter: sort,
      value: { index: 0, ascending: true },
    });
  });
});
