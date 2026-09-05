import { describe, expect, test } from "bun:test";
import {
  FilterType,
  type Filter,
  type FilterValue,
} from "@/sources/aidokuContract";
import { getMobileStrings } from "./mobileI18n";
import {
  MOBILE_SOURCE_FILTER_ANY_OPTION_VALUE,
  getMobileSourceFilterChipModel,
  getMobileSourceFilterChipModels,
  getMobileSourceFilterChipOptions,
  getMobileSourceFilterChipSelectedValues,
  getMobileSourceFilterChipValueLabel,
  getMobileSourceFilterOptionValue,
  getNextMobileSourceFilterChipValue,
  isMobileSourceFilterChipActive,
  shouldCloseMobileSourceFilterChipSheet,
} from "./mobileSourceFilterChips";

const en = getMobileStrings("en");
const zh = getMobileStrings("zh");

const selectFilter: Filter = {
  type: FilterType.Select,
  name: "Status",
  options: ["Ongoing", "Completed"],
  ids: ["ongoing", "completed"],
  default: 0,
};

const sortFilter: Filter = {
  type: FilterType.Sort,
  name: "Sort",
  options: ["Popular", "Latest"],
  default: { index: 0, ascending: false },
  canAscend: true,
};

const genreFilter: Filter = {
  type: FilterType.Genre,
  name: "Genre",
  options: ["Action", "Comedy", "Drama"],
  ids: ["action", "comedy", "drama"],
  canExclude: true,
  default: [],
};

const checkFilter: Filter = {
  type: FilterType.Check,
  name: "Doujin",
  canExclude: true,
  default: false,
};

function valueFor(filter: Filter, value: FilterValue["value"]): FilterValue {
  return { type: filter.type, name: filter.name, value };
}

describe("getMobileSourceFilterOptionValue", () => {
  test("prefers ids for select and genre filters", () => {
    expect(getMobileSourceFilterOptionValue(selectFilter, 1)).toBe("completed");
    expect(getMobileSourceFilterOptionValue(genreFilter, 0)).toBe("action");
  });

  test("falls back to the index for sort filters", () => {
    expect(getMobileSourceFilterOptionValue(sortFilter, 1)).toBe("1");
  });
});

describe("getMobileSourceFilterChipOptions", () => {
  test("leads single-select pickers with a synthetic any row", () => {
    const options = getMobileSourceFilterChipOptions(
      selectFilter,
      undefined,
      en,
    );
    expect(options[0]).toEqual({
      label: en.sourceBrowse.anyFilter,
      value: MOBILE_SOURCE_FILTER_ANY_OPTION_VALUE,
    });
    expect(options.slice(1).map((option) => option.value)).toEqual([
      "ongoing",
      "completed",
    ]);
  });

  test("marks the sort direction on the selected option only", () => {
    const options = getMobileSourceFilterChipOptions(
      sortFilter,
      valueFor(sortFilter, { index: 1, ascending: true }),
      en,
    );
    expect(options.map((option) => option.label)).toEqual([
      "Popular",
      "Latest ↑",
    ]);
  });

  test("labels excluded genre options with the not- format", () => {
    const options = getMobileSourceFilterChipOptions(
      genreFilter,
      valueFor(genreFilter, { included: ["action"], excluded: ["comedy"] }),
      en,
    );
    expect(options.map((option) => option.label)).toEqual([
      "Action",
      "Not Comedy",
      "Drama",
    ]);
  });
});

describe("getMobileSourceFilterChipSelectedValues", () => {
  test("checks the any row when a select filter is unset", () => {
    expect(
      getMobileSourceFilterChipSelectedValues(selectFilter, undefined),
    ).toEqual([MOBILE_SOURCE_FILTER_ANY_OPTION_VALUE]);
  });

  test("checks both included and excluded genre options", () => {
    expect(
      getMobileSourceFilterChipSelectedValues(
        genreFilter,
        valueFor(genreFilter, { included: ["action"], excluded: ["drama"] }),
      ),
    ).toEqual(["action", "drama"]);
  });

  test("falls back to the sort default index", () => {
    expect(
      getMobileSourceFilterChipSelectedValues(sortFilter, undefined),
    ).toEqual(["0"]);
  });
});

describe("getMobileSourceFilterChipValueLabel", () => {
  test("reports the default value as any", () => {
    expect(getMobileSourceFilterChipValueLabel(selectFilter, undefined, en)).toBe(
      "Any",
    );
    expect(getMobileSourceFilterChipValueLabel(genreFilter, undefined, zh)).toBe(
      "任意",
    );
  });

  test("summarises a single genre selection by name", () => {
    expect(
      getMobileSourceFilterChipValueLabel(
        genreFilter,
        valueFor(genreFilter, { included: [], excluded: ["comedy"] }),
        zh,
      ),
    ).toBe("不含 Comedy");
  });

  test("summarises multiple genre selections by count", () => {
    expect(
      getMobileSourceFilterChipValueLabel(
        genreFilter,
        valueFor(genreFilter, {
          included: ["action", "comedy"],
          excluded: ["drama"],
        }),
        zh,
      ),
    ).toBe("已选 3 项");
  });

  test("carries the sort direction glyph", () => {
    expect(
      getMobileSourceFilterChipValueLabel(
        sortFilter,
        valueFor(sortFilter, { index: 0, ascending: false }),
        en,
      ),
    ).toBe("Popular ↓");
  });
});

describe("isMobileSourceFilterChipActive", () => {
  test("is inactive while the value is the default", () => {
    expect(isMobileSourceFilterChipActive(selectFilter, undefined)).toBe(false);
    expect(isMobileSourceFilterChipActive(sortFilter, undefined)).toBe(false);
    expect(isMobileSourceFilterChipActive(checkFilter, undefined)).toBe(false);
  });

  test("is active once a value is chosen", () => {
    expect(
      isMobileSourceFilterChipActive(
        selectFilter,
        valueFor(selectFilter, "ongoing"),
      ),
    ).toBe(true);
    expect(
      isMobileSourceFilterChipActive(checkFilter, valueFor(checkFilter, 2)),
    ).toBe(true);
  });

  test("ignores an emptied genre selection", () => {
    expect(
      isMobileSourceFilterChipActive(
        genreFilter,
        valueFor(genreFilter, { included: [], excluded: [] }),
      ),
    ).toBe(false);
  });
});

describe("getMobileSourceFilterChipModel", () => {
  test("composes a menu chip as filter: value", () => {
    const model = getMobileSourceFilterChipModel(selectFilter, undefined, zh);
    expect(model.kind).toBe("menu");
    expect(model.label).toBe("Status：任意");
    expect(model.active).toBe(false);
  });

  test("keeps check filters as toggle chips with not- semantics", () => {
    const model = getMobileSourceFilterChipModel(
      checkFilter,
      valueFor(checkFilter, 2),
      en,
    );
    expect(model.kind).toBe("toggle");
    expect(model.label).toBe("Not Doujin");
    expect(model.active).toBe(true);
  });

  test("maps every filter in order", () => {
    const models = getMobileSourceFilterChipModels(
      [selectFilter, sortFilter, genreFilter, checkFilter],
      [],
      en,
    );
    expect(models.map((model) => model.kind)).toEqual([
      "menu",
      "menu",
      "menu",
      "toggle",
    ]);
  });
});

describe("getNextMobileSourceFilterChipValue", () => {
  test("clears a select filter through the any row", () => {
    expect(
      getNextMobileSourceFilterChipValue({
        filter: selectFilter,
        value: valueFor(selectFilter, "ongoing"),
        optionValue: MOBILE_SOURCE_FILTER_ANY_OPTION_VALUE,
        mode: "select",
      }),
    ).toBeUndefined();
  });

  test("re-tapping the current sort option flips the direction", () => {
    expect(
      getNextMobileSourceFilterChipValue({
        filter: sortFilter,
        value: valueFor(sortFilter, { index: 1, ascending: false }),
        optionValue: "1",
        mode: "select",
      }),
    ).toEqual({ index: 1, ascending: true });
  });

  test("a new sort option starts descending", () => {
    expect(
      getNextMobileSourceFilterChipValue({
        filter: sortFilter,
        value: valueFor(sortFilter, { index: 1, ascending: true }),
        optionValue: "0",
        mode: "select",
      }),
    ).toEqual({ index: 0, ascending: false });
  });

  test("long press excludes a genre and drops it from included", () => {
    expect(
      getNextMobileSourceFilterChipValue({
        filter: genreFilter,
        value: valueFor(genreFilter, { included: ["action"], excluded: [] }),
        optionValue: "action",
        mode: "exclude",
      }),
    ).toEqual({ included: [], excluded: ["action"] });
  });

  test("clearing the last genre selection clears the value", () => {
    expect(
      getNextMobileSourceFilterChipValue({
        filter: genreFilter,
        value: valueFor(genreFilter, { included: ["action"], excluded: [] }),
        optionValue: "action",
        mode: "select",
      }),
    ).toBeUndefined();
  });

  test("exclude is a no-op when the filter forbids it", () => {
    const noExclude: Filter = { ...genreFilter, canExclude: false };
    expect(
      getNextMobileSourceFilterChipValue({
        filter: noExclude,
        value: undefined,
        optionValue: "action",
        mode: "exclude",
      }),
    ).toBeUndefined();
  });
});

describe("shouldCloseMobileSourceFilterChipSheet", () => {
  test("keeps genre pickers open", () => {
    expect(
      shouldCloseMobileSourceFilterChipSheet({
        filter: genreFilter,
        value: undefined,
        optionValue: "action",
      }),
    ).toBe(false);
  });

  test("keeps a sort picker open while only the direction flips", () => {
    expect(
      shouldCloseMobileSourceFilterChipSheet({
        filter: sortFilter,
        value: valueFor(sortFilter, { index: 1, ascending: false }),
        optionValue: "1",
      }),
    ).toBe(false);
    expect(
      shouldCloseMobileSourceFilterChipSheet({
        filter: sortFilter,
        value: valueFor(sortFilter, { index: 1, ascending: false }),
        optionValue: "0",
      }),
    ).toBe(true);
  });

  test("closes a select picker on any choice", () => {
    expect(
      shouldCloseMobileSourceFilterChipSheet({
        filter: selectFilter,
        value: undefined,
        optionValue: "ongoing",
      }),
    ).toBe(true);
  });
});
