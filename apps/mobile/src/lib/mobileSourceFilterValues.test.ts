import { describe, expect, test } from "bun:test";
import {
  FilterType,
  type CheckFilter,
  type Filter,
  type FilterValue,
  type SortFilter,
} from "@nemu.pm/aidoku-runtime";
import {
  canSelectMobileSourceSortFilterOption,
  compactMobileSourceFilterValues,
  getMobileActiveSourceFilterCount,
  getMobileInlineSourceFilters,
  getMobileCheckFilterState,
  getNextMobileCheckFilterValue,
  getMobileSortFilterSelection,
  updateMobileSourceFilterValues,
} from "./mobileSourceFilterValues";

function checkFilter(overrides: Partial<CheckFilter> = {}): CheckFilter {
  return {
    type: FilterType.Check,
    name: "Completed",
    canExclude: false,
    default: false,
    ...overrides,
  };
}

function checkValue(value: FilterValue["value"]): FilterValue {
  return {
    type: FilterType.Check,
    name: "Completed",
    value,
  };
}

function inlineFilter(type: Filter["type"], name: string): Filter {
  if (type === FilterType.Sort) {
    return {
      type,
      name,
      options: ["Popular", "Latest"],
      default: { index: 0, ascending: false },
      canAscend: true,
    };
  }
  if (type === FilterType.Select) {
    return {
      type,
      name,
      options: ["Any", "Done"],
      default: 0,
    };
  }
  if (type === FilterType.Genre) {
    return {
      type,
      name,
      options: ["Action", "Drama"],
      canExclude: true,
      default: [],
    };
  }
  return {
    type,
    name,
    canExclude: false,
  } as Filter;
}

describe("mobile source filter values", () => {
  test("normalizes sort filters with missing or malformed runtime defaults", () => {
    const filter = {
      type: FilterType.Sort,
      name: "Sort",
      options: ["Popular", "Latest"],
      canAscend: true,
    } as unknown as SortFilter;

    expect(getMobileSortFilterSelection(filter, undefined)).toEqual({
      index: 0,
      ascending: false,
    });
    expect(
      getMobileSortFilterSelection(filter, {
        type: FilterType.Sort,
        name: "Sort",
        value: { index: 9, ascending: true },
      }),
    ).toEqual({
      index: 1,
      ascending: true,
    });
    expect(
      getMobileSortFilterSelection(filter, {
        type: FilterType.Sort,
        name: "Sort",
        value: { index: -1, ascending: true },
      }),
    ).toEqual({
      index: 0,
      ascending: true,
    });
  });

  test("gates fixed-direction selected sort options as no-op selections", () => {
    expect(
      canSelectMobileSourceSortFilterOption({
        selected: false,
        canAscend: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileSourceSortFilterOption({
        selected: true,
        canAscend: true,
      }),
    ).toBe(true);
    expect(
      canSelectMobileSourceSortFilterOption({
        selected: true,
        canAscend: false,
      }),
    ).toBe(false);
  });

  test("cycles non-excludable check filters through runtime numeric states", () => {
    const filter = checkFilter();

    expect(getMobileCheckFilterState(filter)).toBe(0);
    expect(getNextMobileCheckFilterValue(filter)).toBe(1);
    expect(getMobileCheckFilterState(filter, checkValue(1))).toBe(1);
    expect(getNextMobileCheckFilterValue(filter, checkValue(1))).toBeUndefined();
  });

  test("cycles excludable check filters through include and exclude states", () => {
    const filter = checkFilter({ canExclude: true });

    expect(getNextMobileCheckFilterValue(filter)).toBe(1);
    expect(getNextMobileCheckFilterValue(filter, checkValue(1))).toBe(2);
    expect(getNextMobileCheckFilterValue(filter, checkValue(2))).toBeUndefined();
  });

  test("uses default check state and preserves legacy boolean values", () => {
    const filter = checkFilter({ default: true, canExclude: true });

    expect(getMobileCheckFilterState(filter)).toBe(1);
    expect(getMobileCheckFilterState(filter, checkValue(true))).toBe(1);
    expect(getMobileCheckFilterState(filter, checkValue(false))).toBe(2);
  });

  test("sends an explicit off state for default-enabled non-excludable checks", () => {
    const filter = checkFilter({ default: true, canExclude: false });

    expect(getMobileCheckFilterState(filter)).toBe(1);
    expect(getNextMobileCheckFilterValue(filter)).toBe(0);
    expect(getMobileCheckFilterState(filter, checkValue(0))).toBe(0);
    expect(getNextMobileCheckFilterValue(filter, checkValue(0))).toBe(1);
  });

  test("cycles default-enabled excludable checks through exclude and explicit off", () => {
    const filter = checkFilter({ default: true, canExclude: true });

    expect(getNextMobileCheckFilterValue(filter)).toBe(2);
    expect(getNextMobileCheckFilterValue(filter, checkValue(2))).toBe(0);
    expect(getNextMobileCheckFilterValue(filter, checkValue(0))).toBe(1);
  });

  test("selects mobile inline filters with active filters first", () => {
    const filters = [
      inlineFilter(FilterType.Select, "Status"),
      inlineFilter(FilterType.Sort, "Sort"),
      inlineFilter(FilterType.Genre, "Genres"),
      inlineFilter(FilterType.Select, "Language"),
    ];

    const selected = getMobileInlineSourceFilters(
      filters,
      [
        {
          type: FilterType.Genre,
          name: "Genres",
          value: { included: ["Action"], excluded: [] },
        },
        { type: FilterType.Select, name: "Status", value: "Done" },
      ],
      3,
    );

    expect(selected.map((filter) => filter.name)).toEqual([
      "Status",
      "Genres",
      "Sort",
    ]);
  });

  test("ignores blank text and empty genre values when compacting filters", () => {
    const values: FilterValue[] = [
      { type: FilterType.Text, name: "Author", value: "  " },
      {
        type: FilterType.Genre,
        name: "Genres",
        value: { included: [], excluded: [] },
      },
      { type: FilterType.Text, name: "Keyword", value: "hero" },
      {
        type: FilterType.Genre,
        name: "Tags",
        value: { included: ["Action"], excluded: ["Horror"] },
      },
    ];

    expect(compactMobileSourceFilterValues(values)).toEqual([
      { type: FilterType.Text, name: "Keyword", value: "hero" },
      {
        type: FilterType.Genre,
        name: "Tags",
        value: { included: ["Action"], excluded: ["Horror"] },
      },
    ]);
  });

  test("counts only meaningful active filter selections", () => {
    expect(
      getMobileActiveSourceFilterCount([
        { type: FilterType.Text, name: "Author", value: "" },
        {
          type: FilterType.Genre,
          name: "Genres",
          value: { included: ["Action"], excluded: ["Horror"] },
        },
        { type: FilterType.Check, name: "Completed", value: 1 },
      ]),
    ).toBe(3);
  });

  test("drops inactive values when updating source filters", () => {
    const filters = [
      inlineFilter(FilterType.Text, "Author"),
      inlineFilter(FilterType.Genre, "Genres"),
    ];

    const withText = updateMobileSourceFilterValues(
      [],
      filters[0],
      "artist",
    );
    expect(withText).toEqual([
      { type: FilterType.Text, name: "Author", value: "artist" },
    ]);

    expect(
      updateMobileSourceFilterValues(withText, filters[0], " "),
    ).toEqual([]);

    const withGenre: FilterValue[] = [
      { type: FilterType.Text, name: "Author", value: "artist" },
      {
        type: FilterType.Genre,
        name: "Genres",
        value: { included: ["Action"], excluded: [] },
      },
    ];

    expect(
      updateMobileSourceFilterValues(withGenre, filters[1], {
        included: [],
        excluded: [],
      }),
    ).toEqual([{ type: FilterType.Text, name: "Author", value: "artist" }]);
  });

  test("keeps inactive values from promoting inline filters", () => {
    const filters = [
      inlineFilter(FilterType.Select, "Status"),
      inlineFilter(FilterType.Genre, "Genres"),
      inlineFilter(FilterType.Select, "Language"),
    ];

    const selected = getMobileInlineSourceFilters(
      filters,
      [
        {
          type: FilterType.Genre,
          name: "Genres",
          value: { included: [], excluded: [] },
        },
        { type: FilterType.Select, name: "Language", value: "en" },
      ],
      3,
    );

    expect(selected.map((filter) => filter.name)).toEqual([
      "Language",
      "Status",
      "Genres",
    ]);
  });

  test("keeps full-sheet-only filters out of the mobile inline strip", () => {
    const filters = [
      { type: FilterType.Text, name: "Author", placeholder: "Any author" },
      { type: FilterType.Group, name: "Advanced", filters: [] },
      checkFilter({ name: "Completed", default: false }),
      checkFilter({ name: "Ongoing", default: true }),
      inlineFilter(FilterType.Check, "No default"),
      inlineFilter(FilterType.Select, "Status"),
      {
        ...inlineFilter(FilterType.Select, "Full sheet only"),
        hideFromHeader: true,
      } as unknown as Filter,
    ];

    const selected = getMobileInlineSourceFilters(filters, [], 8);

    expect(selected.map((filter) => filter.name)).toEqual([
      "No default",
      "Status",
    ]);
  });
});
