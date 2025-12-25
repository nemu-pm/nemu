import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  FilterState,
  FilterCheckBox,
  FilterTriState,
  FilterText,
  FilterSelect,
  FilterSort,
  FilterGroup,
} from "@nemu.pm/tachiyomi-runtime";
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
// Tachiyomi Filter Drawer (Full Filter List in Dialog)
// ============================================================================

interface TachiyomiFilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FilterState[];
  onApply: (filters: FilterState[]) => void;
  onReset: () => void;
}

export function TachiyomiFilterDrawer({
  open,
  onOpenChange,
  filters,
  onApply,
  onReset,
}: TachiyomiFilterDrawerProps) {
  const { t } = useTranslation();
  // Deep clone filters for draft state
  const [draft, setDraft] = useState<FilterState[]>(() => 
    JSON.parse(JSON.stringify(filters))
  );

  // Re-initialize draft when opening or filters change
  useMemo(() => {
    if (open) {
      setDraft(JSON.parse(JSON.stringify(filters)));
    }
  }, [open, filters]);

  const updateFilter = useCallback((index: number, updated: FilterState) => {
    setDraft((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    onApply(draft);
    onOpenChange(false);
  }, [draft, onApply, onOpenChange]);

  const handleReset = useCallback(() => {
    onReset();
    onOpenChange(false);
  }, [onReset, onOpenChange]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-h-[85vh] sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("browse.filters")}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="-mx-6 max-h-[60vh] overflow-y-auto px-6">
          <div className="space-y-6 py-2">
            {draft.map((filter, idx) => (
              <FilterControl
                key={`${filter.name}-${idx}`}
                filter={filter}
                onChange={(updated) => updateFilter(idx, updated)}
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
// Tachiyomi Filter Header Bar (Inline filter pills under search)
// ============================================================================

interface TachiyomiFilterHeaderBarProps {
  filters: FilterState[];
  onChange: (filters: FilterState[]) => void;
  onOpenFullFilters: () => void;
}

export function TachiyomiFilterHeaderBar({
  filters,
  onChange,
  onOpenFullFilters,
}: TachiyomiFilterHeaderBarProps) {
  // Count active filters (non-default states)
  const filterCount = useMemo(() => {
    let count = 0;
    const countFilters = (list: FilterState[]) => {
      for (const f of list) {
        switch (f.type) {
          case "CheckBox":
            if (f.state) count++;
            break;
          case "TriState":
            if (f.state !== 0) count++;
            break;
          case "Text":
            if (f.state) count++;
            break;
          case "Select":
            if (f.state !== 0) count++;
            break;
          case "Sort":
            // Sort is always "active" in some way, don't count
            break;
          case "Group":
            countFilters(f.state);
            break;
        }
      }
    };
    countFilters(filters);
    return count;
  }, [filters]);

  const updateFilter = useCallback((index: number, updated: FilterState) => {
    const next = [...filters];
    next[index] = updated;
    onChange(next);
  }, [filters, onChange]);

  // Only show interactive, inline-friendly filters in header
  // Hide: Header, Separator, Text, Group (these go in full drawer)
  const visibleFilters = filters
    .map((f, i) => ({ filter: f, index: i }))
    .filter(({ filter }) => {
      return filter.type === "CheckBox" || 
             filter.type === "TriState" || 
             filter.type === "Select" || 
             filter.type === "Sort";
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
      {visibleFilters.map(({ filter, index }) => (
        <InlineFilterPill
          key={`${filter.name}-${index}`}
          filter={filter}
          onChange={(updated) => updateFilter(index, updated)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Inline Filter Pill (for header bar)
// ============================================================================

interface InlineFilterPillProps {
  filter: FilterState;
  onChange: (updated: FilterState) => void;
}

function InlineFilterPill({ filter, onChange }: InlineFilterPillProps) {
  switch (filter.type) {
    case "CheckBox":
      return <InlineCheckboxPill filter={filter} onChange={onChange} />;
    case "TriState":
      return <InlineTristatePill filter={filter} onChange={onChange} />;
    case "Select":
      return <InlineSelectPill filter={filter} onChange={onChange} />;
    case "Sort":
      return <InlineSortPill filter={filter} onChange={onChange} />;
    default:
      return null;
  }
}

function InlineCheckboxPill({
  filter,
  onChange,
}: {
  filter: FilterCheckBox;
  onChange: (updated: FilterState) => void;
}) {
  const handleClick = () => {
    onChange({ ...filter, state: !filter.state });
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        filter.state
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
      )}
    >
      {filter.state && <HugeiconsIcon icon={Tick02Icon} className="size-3" />}
      {filter.name}
    </button>
  );
}

function InlineTristatePill({
  filter,
  onChange,
}: {
  filter: FilterTriState;
  onChange: (updated: FilterState) => void;
}) {
  const handleClick = () => {
    // Cycle: 0 (ignore) -> 1 (include) -> 2 (exclude) -> 0
    const nextState = (filter.state + 1) % 3;
    onChange({ ...filter, state: nextState });
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        filter.state === 1 && "border-primary/30 bg-primary/10 text-primary",
        filter.state === 2 && "border-destructive/30 bg-destructive/10 text-destructive",
        filter.state === 0 && "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
      )}
    >
      {filter.state === 1 && <HugeiconsIcon icon={Tick02Icon} className="size-3" />}
      {filter.state === 2 && <HugeiconsIcon icon={Cancel01Icon} className="size-3" />}
      {filter.name}
    </button>
  );
}

function InlineSelectPill({
  filter,
  onChange,
}: {
  filter: FilterSelect;
  onChange: (updated: FilterState) => void;
}) {
  const selectedLabel = filter.values[filter.state] ?? filter.values[0] ?? "Select";
  const isActive = filter.state !== 0;

  const handleSelect = (idx: number) => {
    onChange({ ...filter, state: idx });
  };

  const label = filter.name ? `${filter.name}: ${selectedLabel}` : selectedLabel;

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
        {filter.values.map((option, idx) => (
          <DropdownMenuItem key={idx} onClick={() => handleSelect(idx)}>
            <span className="flex-1">{option}</span>
            {filter.state === idx && (
              <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InlineSortPill({
  filter,
  onChange,
}: {
  filter: FilterSort;
  onChange: (updated: FilterState) => void;
}) {
  const state = filter.state ?? { index: 0, ascending: false };
  const selectedLabel = filter.values[state.index] ?? filter.values[0] ?? "Sort";

  const handleSelect = (idx: number) => {
    if (state.index === idx) {
      // Toggle ascending
      onChange({ ...filter, state: { index: idx, ascending: !state.ascending } });
    } else {
      onChange({ ...filter, state: { index: idx, ascending: false } });
    }
  };

  const label = filter.name ? `${filter.name}: ${selectedLabel}` : selectedLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        {label}
        <HugeiconsIcon
          icon={state.ascending ? ArrowUp01Icon : ArrowDown01Icon}
          className="size-3"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {filter.values.map((option, idx) => (
          <DropdownMenuItem key={idx} onClick={() => handleSelect(idx)}>
            <span className="flex-1">{option}</span>
            {state.index === idx && (
              <HugeiconsIcon
                icon={state.ascending ? ArrowUp01Icon : ArrowDown01Icon}
                className="size-4 text-muted-foreground"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Filter Control Router (for full drawer)
// ============================================================================

interface FilterControlProps {
  filter: FilterState;
  onChange: (updated: FilterState) => void;
}

function FilterControl({ filter, onChange }: FilterControlProps) {
  switch (filter.type) {
    case "Header":
      return <h3 className="text-sm font-semibold text-muted-foreground">{filter.name}</h3>;
    case "Separator":
      return <hr className="border-border" />;
    case "CheckBox":
      return <CheckboxFilterControl filter={filter} onChange={onChange} />;
    case "TriState":
      return <TristateFilterControl filter={filter} onChange={onChange} />;
    case "Text":
      return <TextFilterControl filter={filter} onChange={onChange} />;
    case "Select":
      return <SelectFilterControl filter={filter} onChange={onChange} />;
    case "Sort":
      return <SortFilterControl filter={filter} onChange={onChange} />;
    case "Group":
      return <GroupFilterControl filter={filter} onChange={onChange} />;
    default:
      return null;
  }
}

// ============================================================================
// Checkbox Filter Control
// ============================================================================

function CheckboxFilterControl({
  filter,
  onChange,
}: {
  filter: FilterCheckBox;
  onChange: (updated: FilterState) => void;
}) {
  const handleToggle = () => {
    onChange({ ...filter, state: !filter.state });
  };

  return (
    <button
      onClick={handleToggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
    >
      <div
        className={cn(
          "flex size-5 items-center justify-center rounded",
          filter.state ? "bg-primary" : "bg-muted"
        )}
      >
        {filter.state && (
          <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary-foreground" />
        )}
      </div>
      <span className="text-sm">{filter.name}</span>
    </button>
  );
}

// ============================================================================
// Tristate Filter Control
// ============================================================================

function TristateFilterControl({
  filter,
  onChange,
}: {
  filter: FilterTriState;
  onChange: (updated: FilterState) => void;
}) {
  const handleToggle = () => {
    const nextState = (filter.state + 1) % 3;
    onChange({ ...filter, state: nextState });
  };

  return (
    <button
      onClick={handleToggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
    >
      <div
        className={cn(
          "flex size-5 items-center justify-center rounded",
          filter.state === 0 && "bg-muted",
          filter.state === 1 && "bg-primary",
          filter.state === 2 && "bg-destructive"
        )}
      >
        {filter.state === 1 && (
          <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary-foreground" />
        )}
        {filter.state === 2 && (
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5 text-destructive-foreground" />
        )}
      </div>
      <span className="text-sm">{filter.name}</span>
    </button>
  );
}

// ============================================================================
// Text Filter Control
// ============================================================================

function TextFilterControl({
  filter,
  onChange,
}: {
  filter: FilterText;
  onChange: (updated: FilterState) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <Input
        type="text"
        placeholder={filter.name}
        value={filter.state}
        onChange={(e) => onChange({ ...filter, state: e.target.value })}
        className="w-full"
      />
    </div>
  );
}

// ============================================================================
// Select Filter Control
// ============================================================================

function SelectFilterControl({
  filter,
  onChange,
}: {
  filter: FilterSelect;
  onChange: (updated: FilterState) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <div className="space-y-1">
        {filter.values.map((option, idx) => {
          const isSelected = filter.state === idx;
          return (
            <button
              key={idx}
              onClick={() => onChange({ ...filter, state: idx })}
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
                  <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary-foreground" />
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
// Sort Filter Control
// ============================================================================

function SortFilterControl({
  filter,
  onChange,
}: {
  filter: FilterSort;
  onChange: (updated: FilterState) => void;
}) {
  const state = filter.state ?? { index: 0, ascending: false };

  const handleClick = (idx: number) => {
    if (state.index === idx) {
      onChange({ ...filter, state: { index: idx, ascending: !state.ascending } });
    } else {
      onChange({ ...filter, state: { index: idx, ascending: false } });
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <div className="flex flex-wrap gap-2">
        {filter.values.map((option, idx) => {
          const isSelected = state.index === idx;
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
              {isSelected && (
                <HugeiconsIcon
                  icon={state.ascending ? ArrowUp01Icon : ArrowDown01Icon}
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
// Group Filter Control
// ============================================================================

function GroupFilterControl({
  filter,
  onChange,
}: {
  filter: FilterGroup;
  onChange: (updated: FilterState) => void;
}) {
  const updateChild = (index: number, updated: FilterState) => {
    const newState = [...filter.state];
    newState[index] = updated;
    onChange({ ...filter, state: newState });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{filter.name}</h3>
      <div className="ml-2 space-y-2 border-l-2 border-border pl-4">
        {filter.state.map((childFilter, idx) => (
          <FilterControl
            key={`${childFilter.name}-${idx}`}
            filter={childFilter}
            onChange={(updated) => updateChild(idx, updated)}
          />
        ))}
      </div>
    </div>
  );
}
