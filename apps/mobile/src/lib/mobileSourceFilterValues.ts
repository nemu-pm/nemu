import {
  FilterType,
  type CheckFilter,
  type Filter,
  type FilterValue,
  type MultiSelectValue,
  type SortFilter,
  type SortSelection,
} from "@/sources/aidokuContract";

export type MobileCheckFilterState = 0 | 1 | 2;

function normalizeSortIndex(index: unknown, optionCount: number): number {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    return 0;
  }
  if (optionCount <= 0) return 0;
  return Math.min(index, optionCount - 1);
}

export function getMobileSortFilterSelection(
  filter: SortFilter,
  value?: FilterValue,
): SortSelection {
  const current =
    value?.type === FilterType.Sort &&
    value.value &&
    typeof value.value === "object"
      ? (value.value as Partial<SortSelection>)
      : null;
  const fallback = filter.default ?? { index: 0, ascending: false };
  const optionCount = filter.options?.length ?? 0;

  return {
    index: normalizeSortIndex(current?.index ?? fallback.index, optionCount),
    ascending: current?.ascending ?? fallback.ascending ?? false,
  };
}

export function canSelectMobileSourceSortFilterOption({
  selected,
  canAscend,
}: {
  selected: boolean;
  canAscend: boolean;
}): boolean {
  return !selected || canAscend;
}

export function getMobileCheckFilterState(
  filter: CheckFilter,
  value?: FilterValue,
): MobileCheckFilterState {
  if (value?.type !== FilterType.Check) {
    return filter.default ? 1 : 0;
  }
  if (value.value === 0) return 0;
  if (value.value === 2) return 2;
  if (value.value === 1 || value.value === true) return 1;
  if (value.value === false) return 2;
  return filter.default ? 1 : 0;
}

export function getNextMobileCheckFilterValue(
  filter: CheckFilter,
  value?: FilterValue,
): number | undefined {
  const state = getMobileCheckFilterState(filter, value);
  if (filter.canExclude) {
    const next = state === 0 ? 1 : state === 1 ? 2 : 0;
    return next === 0 && !filter.default ? undefined : next;
  }
  const next = state === 0 ? 1 : 0;
  return next === 0 && !filter.default ? undefined : next;
}

export function isMobileSourceFilterValueActive(
  value: FilterValue,
): boolean {
  if (value.type === FilterType.Text || value.type === FilterType.Author) {
    return typeof value.value === "string" && value.value.trim().length > 0;
  }

  if (
    value.type === FilterType.Genre &&
    value.value &&
    typeof value.value === "object"
  ) {
    const multi = value.value as MultiSelectValue;
    return Boolean(
      (multi.included?.length ?? 0) || (multi.excluded?.length ?? 0),
    );
  }

  return value.value !== undefined && value.value !== null;
}

export function compactMobileSourceFilterValues(
  values: FilterValue[],
): FilterValue[] {
  return values.filter(isMobileSourceFilterValueActive);
}

export function getMobileActiveSourceFilterCount(
  values: FilterValue[],
): number {
  return values.reduce((count, value) => {
    if (!isMobileSourceFilterValueActive(value)) return count;
    if (
      value.type === FilterType.Genre &&
      value.value &&
      typeof value.value === "object"
    ) {
      const multi = value.value as MultiSelectValue;
      return (
        count + (multi.included?.length ?? 0) + (multi.excluded?.length ?? 0)
      );
    }
    return count + 1;
  }, 0);
}

export function updateMobileSourceFilterValues(
  values: FilterValue[],
  filter: Filter,
  nextValue: FilterValue["value"] | undefined,
): FilterValue[] {
  const next = values.filter((item) => item.name !== filter.name);
  if (nextValue !== undefined) {
    const value: FilterValue = {
      type: filter.type,
      name: filter.name,
      value: nextValue,
    };
    if (isMobileSourceFilterValueActive(value)) next.push(value);
  }
  return next;
}

/**
 * The chip row is source browse *chrome*, not a search result: it belongs on
 * screen from the first paint, or the whole header re-lays out the moment the
 * runtime metadata lands. The filters persisted with the installed package
 * stand in until the runtime answers — the runtime result merges those same
 * package fields back in, so the stand-in row is always a subset of the final
 * one and chips are only ever added, never pulled out from under a tap. A
 * blocked or failed filters fetch falls back to the runtime's own (empty)
 * answer so a stale row cannot outlive the notice that replaced it.
 */
export function resolveMobileSourceBrowseFilters({
  filtersStatus,
  runtimeFilters,
  packageFilters,
}: {
  filtersStatus: "idle" | "loading" | "ready" | "blocked" | "error" | string;
  runtimeFilters: Filter[];
  packageFilters: Filter[];
}): Filter[] {
  if (runtimeFilters.length > 0) return runtimeFilters;
  if (filtersStatus === "idle" || filtersStatus === "loading") {
    return packageFilters;
  }
  return runtimeFilters;
}

export function isMobileInlineSourceFilter(filter: Filter): boolean {
  if ((filter as Filter & { hideFromHeader?: boolean }).hideFromHeader) {
    return false;
  }
  if (
    filter.type === FilterType.Sort ||
    filter.type === FilterType.Select ||
    filter.type === FilterType.Genre
  ) {
    return true;
  }
  if (filter.type === FilterType.Check) {
    return filter.default === undefined || filter.default === null;
  }
  return false;
}

export function getMobileInlineSourceFilters(
  filters: Filter[],
  values: FilterValue[],
  limit: number,
): Filter[] {
  const activeNames = new Set(
    compactMobileSourceFilterValues(values).map((value) => value.name),
  );
  const enabled = filters.filter((filter) => activeNames.has(filter.name));
  const disabled = filters.filter((filter) => !activeNames.has(filter.name));
  return [...enabled, ...disabled]
    .filter(isMobileInlineSourceFilter)
    .slice(0, limit);
}
