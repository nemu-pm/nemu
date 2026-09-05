import {
  FilterType,
  type Filter,
  type FilterValue,
  type MultiSelectValue,
} from "@/sources/aidokuContract";
import { formatMobileString, type MobileStrings } from "./mobileI18n";
import {
  getMobileCheckFilterState,
  getMobileSortFilterSelection,
  isMobileSourceFilterValueActive,
} from "./mobileSourceFilterValues";

/**
 * The source browse header used to stack one titled chip row per filter group,
 * which ate half a phone screen before a single cover appeared. It now renders
 * one horizontal row: a funnel that opens the full panel, plus one compact chip
 * per group. Select/sort/genre groups become `menu` chips that summarise their
 * current value and hand off to a picker sheet; check groups stay `toggle`
 * chips because a tri-state boolean has nothing to pick from.
 *
 * Everything here is pure so the summary text, the picker's option list, and
 * the "is this still the default?" decision stay unit-testable and identical
 * across the chip and the sheet.
 */
export type MobileSourceFilterChipKind = "menu" | "toggle";

export type MobileSourceFilterChipOption = {
  label: string;
  value: string;
};

export type MobileSourceFilterChipModel = {
  filter: Filter;
  kind: MobileSourceFilterChipKind;
  /** Group heading, e.g. 类别. */
  title: string;
  /** Composed chip text: `title: value` for menu chips, the option name for toggles. */
  label: string;
  /** Current value on its own, e.g. 任意 / 热门 ↓ / 已选 3 项. */
  valueLabel: string;
  active: boolean;
};

/** The synthetic "no constraint" row a single-select picker leads with. */
export const MOBILE_SOURCE_FILTER_ANY_OPTION_VALUE = "";

export function getMobileSourceFilterLabel(filter: Filter): string {
  const displayName = (filter as Filter & { displayName?: unknown }).displayName;
  return typeof displayName === "string" && displayName.trim()
    ? displayName
    : filter.name;
}

export function getMobileSourceFilterCheckOptionName(filter: Filter): string {
  const optionName = (filter as Filter & { optionName?: unknown }).optionName;
  return typeof optionName === "string" && optionName.trim()
    ? optionName.trim()
    : filter.name;
}

export function getMobileSourceFilterOptionValue(
  filter: Filter,
  index: number,
): string {
  if (filter.type !== FilterType.Select && filter.type !== FilterType.Genre) {
    return String(index);
  }
  return filter.ids?.[index] ?? filter.options[index] ?? String(index);
}

function getMultiSelectValue(value?: FilterValue): MultiSelectValue {
  if (value?.value && typeof value.value === "object") {
    return value.value as MultiSelectValue;
  }
  return { included: [], excluded: [] };
}

export function getMobileSourceFilterChipKind(
  filter: Filter,
): MobileSourceFilterChipKind {
  return filter.type === FilterType.Check ? "toggle" : "menu";
}

/**
 * Sort direction rides the option label (matching the retired inline chips)
 * so the picker needs no extra control of its own.
 */
function sortOptionLabel(
  option: string,
  selected: boolean,
  ascending: boolean,
): string {
  if (!selected) return option;
  return `${option}${ascending ? " ↑" : " ↓"}`;
}

export function getMobileSourceFilterChipOptions(
  filter: Filter,
  value: FilterValue | undefined,
  strings: MobileStrings,
): MobileSourceFilterChipOption[] {
  if (!("options" in filter) || !filter.options.length) return [];

  if (filter.type === FilterType.Sort) {
    const selection = getMobileSortFilterSelection(filter, value);
    return filter.options.map((option, index) => ({
      label: sortOptionLabel(
        option,
        selection.index === index,
        selection.ascending,
      ),
      value: String(index),
    }));
  }

  if (filter.type === FilterType.Genre) {
    const multi = getMultiSelectValue(value);
    const excluded = new Set(multi.excluded ?? []);
    return filter.options.map((option, index) => {
      const optionValue = getMobileSourceFilterOptionValue(filter, index);
      return {
        label: excluded.has(optionValue)
          ? formatMobileString(strings.sourceBrowse.notFilter, { option })
          : option,
        value: optionValue,
      };
    });
  }

  return [
    {
      label: strings.sourceBrowse.anyFilter,
      value: MOBILE_SOURCE_FILTER_ANY_OPTION_VALUE,
    },
    ...filter.options.map((option, index) => ({
      label: option,
      value: getMobileSourceFilterOptionValue(filter, index),
    })),
  ];
}

export function getMobileSourceFilterChipSelectedValues(
  filter: Filter,
  value: FilterValue | undefined,
): string[] {
  if (filter.type === FilterType.Sort) {
    return [String(getMobileSortFilterSelection(filter, value).index)];
  }
  if (filter.type === FilterType.Genre) {
    const multi = getMultiSelectValue(value);
    return [...(multi.included ?? []), ...(multi.excluded ?? [])];
  }
  return [
    typeof value?.value === "string"
      ? value.value
      : MOBILE_SOURCE_FILTER_ANY_OPTION_VALUE,
  ];
}

export function isMobileSourceFilterChipActive(
  filter: Filter,
  value: FilterValue | undefined,
): boolean {
  if (filter.type === FilterType.Check) {
    return getMobileCheckFilterState(filter, value) !== 0;
  }
  return Boolean(value && isMobileSourceFilterValueActive(value));
}

export function getMobileSourceFilterChipValueLabel(
  filter: Filter,
  value: FilterValue | undefined,
  strings: MobileStrings,
): string {
  if (filter.type === FilterType.Sort) {
    const selection = getMobileSortFilterSelection(filter, value);
    const option = filter.options[selection.index];
    if (!option) return strings.sourceBrowse.anyFilter;
    return sortOptionLabel(option, true, selection.ascending);
  }

  if (filter.type === FilterType.Genre) {
    const multi = getMultiSelectValue(value);
    const included = multi.included ?? [];
    const excluded = multi.excluded ?? [];
    const total = included.length + excluded.length;
    if (total === 0) return strings.sourceBrowse.anyFilter;
    if (total === 1) {
      const only = included[0] ?? excluded[0] ?? "";
      const index = filter.options.findIndex(
        (_option, optionIndex) =>
          getMobileSourceFilterOptionValue(filter, optionIndex) === only,
      );
      const optionName = index >= 0 ? filter.options[index] : only;
      return excluded.length
        ? formatMobileString(strings.sourceBrowse.notFilter, {
            option: optionName,
          })
        : optionName;
    }
    return formatMobileString(strings.sourceBrowse.filterSelectedCountOther, {
      count: String(total),
    });
  }

  if (filter.type !== FilterType.Select) return strings.sourceBrowse.anyFilter;
  if (typeof value?.value !== "string") return strings.sourceBrowse.anyFilter;
  const selected = value.value;
  const index = filter.options.findIndex(
    (_option, optionIndex) =>
      getMobileSourceFilterOptionValue(filter, optionIndex) === selected,
  );
  return index >= 0 ? filter.options[index] : strings.sourceBrowse.anyFilter;
}

export function getMobileSourceFilterChipModel(
  filter: Filter,
  value: FilterValue | undefined,
  strings: MobileStrings,
): MobileSourceFilterChipModel {
  const title = getMobileSourceFilterLabel(filter);
  const active = isMobileSourceFilterChipActive(filter, value);

  if (filter.type === FilterType.Check) {
    const optionName = getMobileSourceFilterCheckOptionName(filter);
    const label =
      getMobileCheckFilterState(filter, value) === 2
        ? formatMobileString(strings.sourceBrowse.notFilter, {
            option: optionName,
          })
        : optionName;
    return { filter, kind: "toggle", title, label, valueLabel: label, active };
  }

  const valueLabel = getMobileSourceFilterChipValueLabel(
    filter,
    value,
    strings,
  );
  return {
    filter,
    kind: "menu",
    title,
    label: formatMobileString(strings.sourceBrowse.sourceFilterOption, {
      filter: title,
      option: valueLabel,
    }),
    valueLabel,
    active,
  };
}

export function getMobileSourceFilterChipModels(
  filters: Filter[],
  values: FilterValue[],
  strings: MobileStrings,
): MobileSourceFilterChipModel[] {
  const valueMap = new Map<string, FilterValue>();
  for (const value of values) valueMap.set(value.name, value);
  return filters.map((filter) =>
    getMobileSourceFilterChipModel(filter, valueMap.get(filter.name), strings),
  );
}

/**
 * Resolves what a picker tap means. Select rows carry the synthetic "any" row,
 * sort rows reuse a tap on the current option to flip direction, and genre rows
 * toggle include (tap) or exclude (long press) exactly as the old chips did.
 */
export function getNextMobileSourceFilterChipValue({
  filter,
  value,
  optionValue,
  mode,
}: {
  filter: Filter;
  value: FilterValue | undefined;
  optionValue: string;
  mode: "select" | "exclude";
}): FilterValue["value"] | undefined {
  if (filter.type === FilterType.Sort) {
    const selection = getMobileSortFilterSelection(filter, value);
    const index = Number.parseInt(optionValue, 10);
    if (!Number.isInteger(index) || index < 0) return value?.value;
    const sameOption = selection.index === index;
    const canAscend = filter.canAscend ?? true;
    return {
      index,
      ascending: sameOption && canAscend ? !selection.ascending : false,
    };
  }

  if (filter.type === FilterType.Genre) {
    const multi = getMultiSelectValue(value);
    const included = new Set(multi.included ?? []);
    const excluded = new Set(multi.excluded ?? []);
    if (mode === "select") {
      if (included.has(optionValue)) {
        included.delete(optionValue);
      } else {
        included.add(optionValue);
        excluded.delete(optionValue);
      }
    } else if (filter.canExclude) {
      if (excluded.has(optionValue)) {
        excluded.delete(optionValue);
      } else {
        excluded.add(optionValue);
        included.delete(optionValue);
      }
    }
    const next: MultiSelectValue = {
      included: [...included],
      excluded: [...excluded],
    };
    return next.included.length || next.excluded.length ? next : undefined;
  }

  if (optionValue === MOBILE_SOURCE_FILTER_ANY_OPTION_VALUE) return undefined;
  return value?.value === optionValue ? undefined : optionValue;
}

/** A sort re-tap only flips direction, so the picker stays open for it. */
export function shouldCloseMobileSourceFilterChipSheet({
  filter,
  value,
  optionValue,
}: {
  filter: Filter;
  value: FilterValue | undefined;
  optionValue: string;
}): boolean {
  if (filter.type === FilterType.Genre) return false;
  if (filter.type === FilterType.Sort) {
    const index = Number.parseInt(optionValue, 10);
    return getMobileSortFilterSelection(filter, value).index !== index;
  }
  return true;
}
