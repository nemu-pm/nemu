import { FilterType, type Filter, type FilterValue } from "@/sources/aidokuContract";
import { formatMobileString, type MobileStrings } from "./mobileI18n";
import {
  getMobileSourceFilterChipOptions,
  getMobileSourceFilterChipSelectedValues,
  getMobileSourceFilterChipValueLabel,
  getMobileSourceFilterCheckOptionName,
  getMobileSourceFilterLabel,
  getNextMobileSourceFilterChipValue,
  isMobileSourceFilterChipActive,
} from "./mobileSourceFilterChips";
import {
  getMobileActiveSourceFilterCount,
  getMobileCheckFilterState,
  getNextMobileCheckFilterValue,
} from "./mobileSourceFilterValues";

/**
 * The search filters as two native menus instead of a strip of chips: one
 * "Filters (n)" button (a submenu per group, check filters inline) and one
 * sort menu. Pure, so the count in the label, the checkmarks and what a tap
 * means stay unit-testable and identical to the picker sheet's rules.
 */
export type MobileSourceFilterMenuAction = {
  id?: string;
  title: string;
  image?: string;
  state?: "on" | "off";
  displayInline?: boolean;
  subactions?: MobileSourceFilterMenuAction[];
};

export type MobileSourceFilterMenus = {
  /** "Filters" or "Filters (2)". */
  filtersLabel: string;
  /** The active filters other than the sort. */
  filterCount: number;
  filterActions: MobileSourceFilterMenuAction[];
  /** The current sort, e.g. "Latest Chapter ↓". Null without a sort filter. */
  sortLabel: string | null;
  sortActions: MobileSourceFilterMenuAction[];
};

const OPTION = "opt";
const CHECK = "check";
export const MOBILE_SOURCE_FILTER_MENU_CLEAR = "clear";
export const MOBILE_SOURCE_FILTER_MENU_PANEL = "panel";

function valueFor(values: readonly FilterValue[], filter: Filter): FilterValue | undefined {
  return values.find((value) => value.name === filter.name);
}

export function getMobileSourceFilterMenuCount(filters: readonly Filter[], values: readonly FilterValue[]): number {
  const sortNames = new Set(filters.filter((filter) => filter.type === FilterType.Sort).map((filter) => filter.name));
  return getMobileActiveSourceFilterCount(values.filter((value) => !sortNames.has(value.name)));
}

function optionActions(
  filter: Filter,
  filterIndex: number,
  value: FilterValue | undefined,
  strings: MobileStrings,
): MobileSourceFilterMenuAction[] {
  const selected = new Set(getMobileSourceFilterChipSelectedValues(filter, value));
  return getMobileSourceFilterChipOptions(filter, value, strings).map((option) => ({
    id: `${OPTION}:${filterIndex}:${option.value}`,
    title: option.label,
    state: selected.has(option.value) ? ("on" as const) : ("off" as const),
  }));
}

export function buildMobileSourceFilterMenus(
  filters: readonly Filter[],
  values: readonly FilterValue[],
  strings: MobileStrings,
): MobileSourceFilterMenus {
  const filterActions: MobileSourceFilterMenuAction[] = [];
  const sortActions: MobileSourceFilterMenuAction[] = [];
  let sortLabel: string | null = null;
  const checks: MobileSourceFilterMenuAction[] = [];

  filters.forEach((filter, index) => {
    const value = valueFor(values, filter);
    if (filter.type === FilterType.Sort) {
      const label = getMobileSourceFilterLabel(filter);
      const current = getMobileSourceFilterChipValueLabel(filter, value, strings);
      sortLabel ??= current;
      const options = optionActions(filter, index, value, strings);
      // One sort filter is the menu itself; a second one gets its own heading.
      if (sortActions.length === 0) sortActions.push(...options);
      else sortActions.push({ title: label, displayInline: true, subactions: options });
      return;
    }
    if (filter.type === FilterType.Check) {
      const state = getMobileCheckFilterState(filter, value);
      const name = getMobileSourceFilterCheckOptionName(filter);
      checks.push({
        id: `${CHECK}:${index}`,
        title: state === 2 ? formatMobileString(strings.sourceBrowse.notFilter, { option: name }) : name,
        state: state === 0 ? "off" : "on",
      });
      return;
    }
    if (filter.type === FilterType.Select || filter.type === FilterType.Genre) {
      const label = getMobileSourceFilterLabel(filter);
      const active = isMobileSourceFilterChipActive(filter, value);
      filterActions.push({
        title: active ? `${label} · ${getMobileSourceFilterChipValueLabel(filter, value, strings)}` : label,
        subactions: optionActions(filter, index, value, strings),
      });
    }
  });

  const filterCount = getMobileSourceFilterMenuCount(filters, values);
  if (checks.length) filterActions.push({ title: strings.designExplore.filtersMenu, displayInline: true, subactions: checks });
  // The way out to the full panel (and the reset) follow the groups as plain items.
  filterActions.push({ id: MOBILE_SOURCE_FILTER_MENU_PANEL, title: strings.designExplore.allFilters, image: "slider.horizontal.3" });
  if (values.length) filterActions.push({ id: MOBILE_SOURCE_FILTER_MENU_CLEAR, title: strings.designExplore.clearFilters, image: "xmark.circle" });

  return {
    filtersLabel: filterCount > 0
      ? formatMobileString(strings.designExplore.filtersMenuCount, { count: String(filterCount) })
      : strings.designExplore.filtersMenu,
    filterCount,
    filterActions,
    sortLabel,
    sortActions,
  };
}

export type MobileSourceFilterMenuEvent =
  | { kind: "change"; filter: Filter; value: FilterValue["value"] | undefined }
  | { kind: "clear" }
  | { kind: "panel" };

/** What a tapped menu item asks for, against the filters and values it was built from. */
export function resolveMobileSourceFilterMenuEvent(
  id: string,
  filters: readonly Filter[],
  values: readonly FilterValue[],
): MobileSourceFilterMenuEvent | null {
  if (id === MOBILE_SOURCE_FILTER_MENU_CLEAR) return { kind: "clear" };
  if (id === MOBILE_SOURCE_FILTER_MENU_PANEL) return { kind: "panel" };
  const [kind, indexText, ...rest] = id.split(":");
  const filter = filters[Number.parseInt(indexText ?? "", 10)];
  if (!filter) return null;
  const value = valueFor(values, filter);
  if (kind === CHECK && filter.type === FilterType.Check) {
    return { kind: "change", filter, value: getNextMobileCheckFilterValue(filter, value) };
  }
  if (kind === OPTION) {
    return {
      kind: "change",
      filter,
      value: getNextMobileSourceFilterChipValue({ filter, value, optionValue: rest.join(":"), mode: "select" }),
    };
  }
  return null;
}
