import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  Filter,
  FilterValue,
  TextFilter,
  SelectFilter,
  SortFilter,
  CheckFilter,
  GroupFilter,
  GenreFilter,
  SortSelection,
  MultiSelectValue,
} from "@/lib/sources/aidoku/types";
import { FilterType } from "@/lib/sources/aidoku/types";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUp01Icon,
  ArrowDown01Icon,
  Tick02Icon,
  Cancel01Icon,
  FilterIcon,
} from "@hugeicons/core-free-icons";

// ============================================================================
// Filter Drawer (Full Filter List in Dialog)
// ============================================================================

interface FilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filter[];
  values: FilterValue[];
  onApply: (values: FilterValue[]) => void;
}

export function FilterDrawer({
  open,
  onOpenChange,
  filters,
  values,
  onApply,
}: FilterDrawerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Map<string, FilterValue>>(new Map());

  // Initialize draft from values when opening
  useMemo(() => {
    if (open) {
      const map = new Map<string, FilterValue>();
      values.forEach((v) => map.set(v.name, v));
      setDraft(map);
    }
  }, [open, values]);

  const updateFilter = useCallback(
    (name: string, type: FilterType, value: FilterValue["value"]) => {
      setDraft((prev) => {
        const next = new Map(prev);
        next.set(name, { type, name, value });
        return next;
      });
    },
    []
  );

  const removeFilter = useCallback((name: string) => {
    setDraft((prev) => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    onApply(Array.from(draft.values()));
    onOpenChange(false);
  }, [draft, onApply, onOpenChange]);

  const handleReset = useCallback(() => {
    setDraft(new Map());
    onApply([]);
    onOpenChange(false);
  }, [onApply, onOpenChange]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-h-[85vh] sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("browse.filters")}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="-mx-6 max-h-[60vh] overflow-y-auto px-6">
          <div className="space-y-6 py-2">
            {filters.map((filter, idx) => (
              <FilterControl
                key={`${filter.name}-${idx}`}
                filter={filter}
                value={draft.get(filter.name)}
                onChange={updateFilter}
                onRemove={removeFilter}
              />
            ))}
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={handleReset}>
            {t("browse.resetFilters")}
          </Button>
          <Button onClick={handleApply}>{t("browse.applyFilters")}</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ============================================================================
// Filter Header Bar (Inline filter pills under search)
// Following Swift's FilterHeaderView pattern
// ============================================================================

interface FilterHeaderBarProps {
  filters: Filter[];
  values: FilterValue[];
  onChange: (values: FilterValue[]) => void;
  onOpenFullFilters: () => void;
}

export function FilterHeaderBar({
  filters,
  values,
  onChange,
  onOpenFullFilters,
}: FilterHeaderBarProps) {
  // Sort filters: enabled ones first
  const sortedFilters = useMemo(() => {
    const valueNames = new Set(values.map((v) => v.name));
    const enabled = filters.filter((f) => valueNames.has(f.name));
    const disabled = filters.filter((f) => !valueNames.has(f.name));
    return [...enabled, ...disabled];
  }, [filters, values]);

  // Count total active filter selections
  const filterCount = useMemo(() => {
    return values.reduce((acc, v) => {
      if (v.type === FilterType.Genre && v.value && typeof v.value === "object") {
        const msv = v.value as MultiSelectValue;
        return acc + (msv.included?.length ?? 0) + (msv.excluded?.length ?? 0);
      }
      return acc + 1;
    }, 0);
  }, [values]);

  // Handle inline filter toggle/change
  const handleFilterChange = useCallback(
    (name: string, type: FilterType, value: FilterValue["value"]) => {
      const newValues = values.filter((v) => v.name !== name);
      newValues.push({ name, type, value });
      onChange(newValues);
    },
    [values, onChange]
  );

  const handleFilterRemove = useCallback(
    (name: string) => {
      onChange(values.filter((v) => v.name !== name));
    },
    [values, onChange]
  );

  // Only show non-hidden, inline-friendly filters (following Swift's FilterHeaderView)
  // Swift shows: sort, select, multiselect, and check (without default)
  // Swift hides: text, group/range, and check with default value
  const visibleFilters = sortedFilters.filter((f) => {
    // Hide text filters, groups from header
    if (f.type === FilterType.Text || f.type === FilterType.Group) return false;
    // Hide check filters with a default value (they appear enabled by default, confusing in header)
    if (f.type === FilterType.Check) {
      const cf = f as CheckFilter;
      if (cf.default !== undefined && cf.default !== null) return false;
    }
    // Show everything else (Sort, Select, Genre/MultiSelect)
    return true;
  });

  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      {/* Filter button to open full dialog */}
      <button
        onClick={onOpenFullFilters}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          filterCount > 0
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
        )}
      >
        <HugeiconsIcon icon={FilterIcon} className="size-3.5" />
        {filterCount > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {filterCount}
          </span>
        )}
      </button>

      {/* Inline filter pills */}
      {visibleFilters.map((filter, idx) => (
        <InlineFilterPill
          key={`${filter.name}-${idx}`}
          filter={filter}
          value={values.find((v) => v.name === filter.name)}
          onChange={handleFilterChange}
          onRemove={handleFilterRemove}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Inline Filter Pill (for header bar)
// ============================================================================

interface InlineFilterPillProps {
  filter: Filter;
  value?: FilterValue;
  onChange: (name: string, type: FilterType, value: FilterValue["value"]) => void;
  onRemove: (name: string) => void;
}

function InlineFilterPill({
  filter,
  value,
  onChange,
  onRemove,
}: InlineFilterPillProps) {
  switch (filter.type) {
    case FilterType.Sort:
      return (
        <InlineSortPill
          filter={filter as SortFilter}
          value={value?.value as SortSelection | undefined}
          onChange={onChange}
        />
      );
    case FilterType.Select:
      return (
        <InlineSelectPill
          filter={filter as SelectFilter}
          value={value?.value as string | undefined}
          onChange={onChange}
          onRemove={onRemove}
        />
      );
    case FilterType.Check:
      return (
        <InlineCheckPill
          filter={filter as CheckFilter}
          value={value?.value as number | undefined}
          onChange={onChange}
          onRemove={onRemove}
        />
      );
    case FilterType.Genre:
      return (
        <InlineMultiSelectPill
          filter={filter as GenreFilter}
          value={value?.value as MultiSelectValue | undefined}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

function InlineSortPill({
  filter,
  value,
  onChange,
}: {
  filter: SortFilter;
  value?: SortSelection;
  onChange: InlineFilterPillProps["onChange"];
}) {
  const options = filter.options ?? [];
  const defaultIndex = filter.default?.index ?? 0;
  const defaultAscending = filter.default?.ascending ?? false;
  const selectedIndex = value?.index ?? defaultIndex;
  const ascending = value?.ascending ?? defaultAscending;
  const canAscend = filter.canAscend ?? true;
  const isActive = selectedIndex !== defaultIndex || ascending !== defaultAscending;

  const handleSelect = (idx: number) => {
    if (selectedIndex === idx && canAscend) {
      // Toggle ascending when clicking the same option
      onChange(filter.name, FilterType.Sort, { index: idx, ascending: !ascending });
    } else {
      onChange(filter.name, FilterType.Sort, { index: idx, ascending: false });
    }
  };

  const label = filter.name
    ? `${filter.name}: ${options[selectedIndex] ?? ""}`
    : (options[selectedIndex] ?? "Sort");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          isActive
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
        )}
      >
        {label}
        <HugeiconsIcon
          icon={ascending ? ArrowUp01Icon : ArrowDown01Icon}
          className="size-3"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option, idx) => (
          <DropdownMenuItem key={idx} onClick={() => handleSelect(idx)}>
            <span className="flex-1">{option}</span>
            {selectedIndex === idx && (
              <HugeiconsIcon
                icon={ascending ? ArrowUp01Icon : ArrowDown01Icon}
                className="size-4 text-muted-foreground"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InlineSelectPill({
  filter,
  value,
  onChange,
  onRemove,
}: {
  filter: SelectFilter;
  value?: string; // String ID, not index!
  onChange: InlineFilterPillProps["onChange"];
  onRemove: InlineFilterPillProps["onRemove"];
}) {
  const options = filter.options ?? [];
  const ids = filter.ids ?? options; // Use ids if available, else options are IDs
  const defaultId = ids[filter.default ?? 0] ?? "";
  
  // Find selected index from string value
  const selectedIndex = value ? ids.indexOf(value) : (filter.default ?? 0);
  const effectiveIndex = selectedIndex >= 0 ? selectedIndex : (filter.default ?? 0);
  const isActive = value !== undefined && value !== defaultId;

  const handleSelect = (idx: number) => {
    const selectedId = ids[idx] ?? options[idx] ?? "";
    if (selectedId === defaultId) {
      onRemove(filter.name);
    } else {
      onChange(filter.name, FilterType.Select, selectedId);
    }
  };

  const label = filter.name
    ? `${filter.name}: ${options[effectiveIndex] ?? ""}`
    : (options[effectiveIndex] ?? "Select");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          isActive
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
        )}
      >
        {label}
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option, idx) => (
          <DropdownMenuItem key={idx} onClick={() => handleSelect(idx)}>
            <span className="flex-1">{option}</span>
            {effectiveIndex === idx && (
              <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InlineCheckPill({
  filter,
  value,
  onChange,
  onRemove,
}: {
  filter: CheckFilter;
  value?: number;
  onChange: InlineFilterPillProps["onChange"];
  onRemove: InlineFilterPillProps["onRemove"];
}) {
  const canExclude = filter.canExclude ?? false;
  const state = value ?? (filter.default ? 1 : 0);

  const handleClick = () => {
    let next: number;
    if (canExclude) {
      next = state === 0 ? 1 : state === 1 ? 2 : 0;
    } else {
      next = state === 0 ? 1 : 0;
    }

    if (next === 0) {
      onRemove(filter.name);
    } else {
      onChange(filter.name, FilterType.Check, next);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        state === 1 && "border-primary/30 bg-primary/10 text-primary",
        state === 2 && "border-destructive/30 bg-destructive/10 text-destructive",
        state === 0 && "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
      )}
    >
      {state === 1 && <HugeiconsIcon icon={Tick02Icon} className="size-3" />}
      {state === 2 && <HugeiconsIcon icon={Cancel01Icon} className="size-3" />}
      {filter.name}
    </button>
  );
}

function InlineMultiSelectPill({
  filter,
  value,
  onChange,
}: {
  filter: GenreFilter;
  value?: MultiSelectValue; // String arrays, not index-based!
  onChange: InlineFilterPillProps["onChange"];
}) {
  const options = filter.options ?? [];
  const ids = filter.ids ?? options; // Use ids if available, else options are IDs
  const canExclude = filter.canExclude ?? false;

  // Build sets from string arrays for quick lookup
  const includedSet = useMemo(() => new Set(value?.included ?? []), [value]);
  const excludedSet = useMemo(() => new Set(value?.excluded ?? []), [value]);
  
  const activeCount = includedSet.size + excludedSet.size;
  const isActive = activeCount > 0;

  // Get state for an option by its ID
  const getState = (id: string): "none" | "included" | "excluded" => {
    if (includedSet.has(id)) return "included";
    if (excludedSet.has(id)) return "excluded";
    return "none";
  };

  const handleToggle = (idx: number) => {
    const id = ids[idx] ?? options[idx] ?? "";
    const current = getState(id);
    
    // Build new arrays
    const newIncluded = [...includedSet].filter(x => x !== id);
    const newExcluded = [...excludedSet].filter(x => x !== id);
    
    if (current === "none") {
      newIncluded.push(id);
    } else if (current === "included" && canExclude) {
      newExcluded.push(id);
    }
    // else: current is "excluded" or (current is "included" and !canExclude) -> remove

    const newValue: MultiSelectValue = { included: newIncluded, excluded: newExcluded };
    onChange(filter.name, FilterType.Genre, newValue);
  };

  // Use dropdown menu for multiselect
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          isActive
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
        )}
      >
        {filter.name}
        {activeCount > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {activeCount}
          </span>
        )}
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option, idx) => {
          const id = ids[idx] ?? option;
          const state = getState(id);
          return (
            <DropdownMenuItem
              key={idx}
              closeOnClick={false}
              onClick={() => handleToggle(idx)}
            >
              <span className="flex-1">{option}</span>
              {state === "included" && (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  className={cn("size-4", canExclude ? "text-green-600" : "text-primary")}
                />
              )}
              {state === "excluded" && (
                <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-red-600" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Filter Control Router (for full drawer)
// ============================================================================

interface FilterControlProps {
  filter: Filter;
  value?: FilterValue;
  onChange: (name: string, type: FilterType, value: FilterValue["value"]) => void;
  onRemove: (name: string) => void;
}

function FilterControl({ filter, value, onChange, onRemove }: FilterControlProps) {
  switch (filter.type) {
    case FilterType.Text:
      return (
        <TextFilterControl
          filter={filter as TextFilter}
          value={value?.value as string | undefined}
          onChange={onChange}
          onRemove={onRemove}
        />
      );
    case FilterType.Select:
      return (
        <SelectFilterControl
          filter={filter as SelectFilter}
          value={value?.value as string | undefined}
          onChange={onChange}
          onRemove={onRemove}
        />
      );
    case FilterType.Sort:
      return (
        <SortFilterControl
          filter={filter as SortFilter}
          value={value?.value as SortSelection | undefined}
          onChange={onChange}
        />
      );
    case FilterType.Check:
      return (
        <CheckFilterControl
          filter={filter as CheckFilter}
          value={value?.value as number | undefined}
          onChange={onChange}
          onRemove={onRemove}
        />
      );
    case FilterType.Group:
      return (
        <GroupFilterControl
          filter={filter as GroupFilter}
          value={value}
          onChange={onChange}
          onRemove={onRemove}
        />
      );
    case FilterType.Genre:
      return (
        <GenreFilterControl
          filter={filter as GenreFilter}
          value={value?.value as MultiSelectValue | undefined}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

// ============================================================================
// Text Filter - Text input field
// ============================================================================

function TextFilterControl({
  filter,
  value,
  onChange,
  onRemove,
}: {
  filter: TextFilter;
  value?: string;
  onChange: FilterControlProps["onChange"];
  onRemove: FilterControlProps["onRemove"];
}) {
  const handleChange = (text: string) => {
    if (text.trim()) {
      onChange(filter.name, FilterType.Text, text);
    } else {
      onRemove(filter.name);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <Input
        type="text"
        placeholder={filter.placeholder ?? filter.name}
        value={value ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full"
      />
    </div>
  );
}

// ============================================================================
// Select Filter - Radio-style single selection
// ============================================================================

function SelectFilterControl({
  filter,
  value,
  onChange,
  onRemove,
}: {
  filter: SelectFilter;
  value?: string; // String ID, not index!
  onChange: FilterControlProps["onChange"];
  onRemove: FilterControlProps["onRemove"];
}) {
  const options = filter.options ?? [];
  const ids = filter.ids ?? options;
  const defaultId = ids[filter.default ?? 0] ?? "";
  
  // Find selected index from string value
  const selectedIndex = value ? ids.indexOf(value) : (filter.default ?? 0);
  const effectiveIndex = selectedIndex >= 0 ? selectedIndex : (filter.default ?? 0);

  const handleSelect = (idx: number) => {
    const selectedId = ids[idx] ?? options[idx] ?? "";
    if (selectedId === defaultId) {
      onRemove(filter.name);
    } else {
      onChange(filter.name, FilterType.Select, selectedId);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <div className="space-y-1">
        {options.map((option, idx) => {
          const isSelected = effectiveIndex === idx;
          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                "hover:bg-muted/50"
              )}
            >
              <div
                className={cn(
                  "flex size-5 items-center justify-center rounded",
                  isSelected ? "bg-primary" : "bg-muted"
                )}
              >
                {isSelected && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    className="size-3.5 text-primary-foreground"
                  />
                )}
              </div>
              <span className="text-sm">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Sort Filter - Pills with ascending/descending chevrons
// ============================================================================

function SortFilterControl({
  filter,
  value,
  onChange,
}: {
  filter: SortFilter;
  value?: SortSelection;
  onChange: FilterControlProps["onChange"];
}) {
  const options = filter.options ?? [];
  const selectedIndex = value?.index ?? filter.default?.index ?? 0;
  const ascending = value?.ascending ?? filter.default?.ascending ?? false;
  const canAscend = filter.canAscend ?? true;

  const handleClick = (idx: number) => {
    if (selectedIndex === idx && canAscend) {
      onChange(filter.name, FilterType.Sort, { index: idx, ascending: !ascending });
    } else {
      onChange(filter.name, FilterType.Sort, { index: idx, ascending: false });
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((option, idx) => {
          const isSelected = selectedIndex === idx;
          return (
            <button
              key={idx}
              onClick={() => handleClick(idx)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/80"
              )}
            >
              {option}
              {isSelected && canAscend && (
                <HugeiconsIcon
                  icon={ascending ? ArrowUp01Icon : ArrowDown01Icon}
                  className="size-4"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Check Filter - Checkbox row with optional exclude state
// ============================================================================

function CheckFilterControl({
  filter,
  value,
  onChange,
  onRemove,
}: {
  filter: CheckFilter;
  value?: number;
  onChange: FilterControlProps["onChange"];
  onRemove: FilterControlProps["onRemove"];
}) {
  const canExclude = filter.canExclude ?? false;
  const state = value ?? (filter.default ? 1 : 0);

  const handleToggle = () => {
    let next: number;
    if (canExclude) {
      next = state === 0 ? 1 : state === 1 ? 2 : 0;
    } else {
      next = state === 0 ? 1 : 0;
    }

    if (next === 0) {
      onRemove(filter.name);
    } else {
      onChange(filter.name, FilterType.Check, next);
    }
  };

  return (
    <button
      onClick={handleToggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
    >
      <div
        className={cn(
          "flex size-5 items-center justify-center rounded",
          state === 0 && "bg-muted",
          state === 1 && "bg-primary",
          state === 2 && "bg-destructive"
        )}
      >
        {state === 1 && (
          <HugeiconsIcon
            icon={Tick02Icon}
            className="size-3.5 text-primary-foreground"
          />
        )}
        {state === 2 && (
          <HugeiconsIcon
            icon={Cancel01Icon}
            className="size-3.5 text-destructive-foreground"
          />
        )}
      </div>
      <span className="text-sm">{filter.name}</span>
    </button>
  );
}

// ============================================================================
// Group Filter - Nested filters with border
// ============================================================================

function GroupFilterControl({
  filter,
  value,
  onChange,
  onRemove,
}: {
  filter: GroupFilter;
  value?: FilterValue;
  onChange: FilterControlProps["onChange"];
  onRemove: FilterControlProps["onRemove"];
}) {
  const childFilters = filter.filters ?? [];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <div className="ml-2 space-y-4 border-l-2 border-border pl-4">
        {childFilters.map((childFilter, idx) => (
          <FilterControl
            key={`${childFilter.name}-${idx}`}
            filter={childFilter}
            value={value?.filters?.find((f) => f.name === childFilter.name)}
            onChange={onChange}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Genre/MultiSelect Filter - Pills with include/exclude states
// ============================================================================

function GenreFilterControl({
  filter,
  value,
  onChange,
}: {
  filter: GenreFilter;
  value?: MultiSelectValue; // String arrays, not index-based!
  onChange: FilterControlProps["onChange"];
}) {
  const options = filter.options ?? [];
  const ids = filter.ids ?? options;
  const canExclude = filter.canExclude ?? false;

  // Build sets from string arrays for quick lookup
  const includedSet = useMemo(() => new Set(value?.included ?? []), [value]);
  const excludedSet = useMemo(() => new Set(value?.excluded ?? []), [value]);

  // Get state for an option by its ID
  const getState = (id: string): "none" | "included" | "excluded" => {
    if (includedSet.has(id)) return "included";
    if (excludedSet.has(id)) return "excluded";
    return "none";
  };

  const handleToggle = (idx: number) => {
    const id = ids[idx] ?? options[idx] ?? "";
    const current = getState(id);
    
    // Build new arrays
    const newIncluded = [...includedSet].filter(x => x !== id);
    const newExcluded = [...excludedSet].filter(x => x !== id);
    
    if (current === "none") {
      newIncluded.push(id);
    } else if (current === "included" && canExclude) {
      newExcluded.push(id);
    }
    // else: remove (current is excluded, or included without canExclude)

    const newValue: MultiSelectValue = { included: newIncluded, excluded: newExcluded };
    onChange(filter.name, FilterType.Genre, newValue);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((option, idx) => {
          const id = ids[idx] ?? option;
          const state = getState(id);
          return (
            <button
              key={idx}
              onClick={() => handleToggle(idx)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                state === "none" &&
                  "bg-muted text-muted-foreground hover:bg-muted/80",
                state === "included" &&
                  (canExclude
                    ? "bg-green-600 text-white"
                    : "bg-primary text-primary-foreground"),
                state === "excluded" && "bg-red-600 text-white"
              )}
            >
              {option}
              {state === "included" && canExclude && (
                <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
              )}
              {state === "excluded" && (
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
