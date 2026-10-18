/**
 * The chapters header pill's label: "Source · N" once a source is named (the
 * library page's switch or the source's own page), the sort direction otherwise.
 */
export function getMobileExploreChapterMenuLabel(input: {
  selected: { name: string; count?: string | null } | null;
  sourceName?: string;
  fallbackCount?: number;
  sortDirection: "asc" | "desc";
  sortAscending: string;
  sortDescending: string;
}): string {
  const { selected, sourceName, fallbackCount } = input;
  if (selected) return `${selected.name}${(selected.count ?? fallbackCount) ? ` · ${selected.count ?? fallbackCount}` : ""}`;
  if (sourceName) return `${sourceName}${fallbackCount ? ` · ${fallbackCount}` : ""}`;
  return input.sortDirection === "desc" ? input.sortDescending : input.sortAscending;
}
