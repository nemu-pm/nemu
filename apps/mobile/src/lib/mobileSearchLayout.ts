import { MOBILE_EXPANDED_WIDTH } from "@/lib/mobileAdaptiveLayout";
import type { MobileSplitPaneOptions } from "@/lib/mobileSplitPaneLayout";
import type { SearchSourceSelection } from "@/lib/mobileSearch";

/**
 * Search on regular widths (Duo inner display, tablets, unfolded foldables):
 * a Mail / Notes style sidebar split — search field, source list and recent
 * searches in the leading pane, results in the trailing pane (HIG, Designing
 * for iPhone Duo: "show an additional level of hierarchy on the inner
 * display").
 *
 * - Flat, the sidebar is a narrow column (Notes) with a hairline divider.
 * - Partially folded as a book, it is exactly the leading half and nothing
 *   sits on the fold (`getMobileSplitPaneLayout` aligns the panes).
 * - Side by side only when the container is wider than tall enough to keep a
 *   useful results grid (HIG arrangement views; Material list-detail shows one
 *   pane below 840dp) — the Duo's inner portrait display and portrait tablets
 *   keep the single-column search.
 */
export const MOBILE_SEARCH_SPLIT_OPTIONS: MobileSplitPaneOptions = {
  leadingFraction: 0.36,
  minLeading: 300,
  maxLeading: 340,
  minTrailing: 440,
  minFoldPane: 280,
  minFlatSplitWidth: MOBILE_EXPANDED_WIDTH,
};

/** What a sidebar row shows at its trailing edge for the current query. */
export type MobileSearchSidebarStatus =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "count"; count: number; more: boolean }
  | { kind: "error" };

/** The subset of a live-search group the sidebar needs. */
export type MobileSearchSidebarGroupInput =
  | { sourceId: string; status: "loading" }
  | { sourceId: string; status: "ready"; count: number; hasMore: boolean }
  | { sourceId: string; status: "blocked" };

export type MobileSearchSidebarMemory = {
  query: string;
  statuses: Record<string, MobileSearchSidebarStatus>;
};

function statusForGroup(group: MobileSearchSidebarGroupInput): MobileSearchSidebarStatus {
  if (group.status === "loading") return { kind: "loading" };
  if (group.status === "blocked") return { kind: "error" };
  return { kind: "count", count: group.count, more: group.hasMore };
}

/**
 * Per-source trailing status for the sidebar. Sources outside the current
 * search scope keep the last result they produced for the same query, like
 * Mail keeps every mailbox's count while one is selected — narrowing the scope
 * to one source must not blank the other rows. A new query starts afresh.
 *
 * Returns the statuses and the memory to keep for the next call.
 */
export function resolveMobileSearchSidebarStatuses({
  query,
  groups,
  memory,
}: {
  query: string;
  /** Live groups of the current scope; null while no live search runs. */
  groups: MobileSearchSidebarGroupInput[] | null;
  memory: MobileSearchSidebarMemory | null;
}): { statuses: Record<string, MobileSearchSidebarStatus>; memory: MobileSearchSidebarMemory | null } {
  const trimmed = query.trim();
  if (!trimmed) return { statuses: {}, memory: null };
  const previous = memory?.query === trimmed ? memory.statuses : {};
  const statuses: Record<string, MobileSearchSidebarStatus> = { ...previous };
  for (const group of groups ?? []) {
    const next = statusForGroup(group);
    // A re-run of a source that already answered keeps its answer on screen
    // until the new one lands (the results pane does the same).
    if (next.kind === "loading" && previous[group.sourceId]?.kind === "count") {
      continue;
    }
    statuses[group.sourceId] = next;
  }
  return { statuses, memory: { query: trimmed, statuses } };
}

/** The "All sources" row: loading while any in-scope row loads, else their sum. */
export function summarizeMobileSearchSidebarStatuses(
  statuses: Record<string, MobileSearchSidebarStatus>,
  scopeSourceIds: string[],
): MobileSearchSidebarStatus {
  let count = 0;
  let more = false;
  let answered = false;
  for (const id of scopeSourceIds) {
    const status = statuses[id];
    if (!status || status.kind === "none") continue;
    if (status.kind === "loading") return { kind: "loading" };
    if (status.kind === "count") {
      count += status.count;
      more ||= status.more;
      answered = true;
    }
  }
  return answered ? { kind: "count", count, more } : { kind: "none" };
}

export function formatMobileSearchSidebarCount(status: Extract<MobileSearchSidebarStatus, { kind: "count" }>): string {
  return `${status.count}${status.more ? "+" : ""}`;
}

/**
 * Sidebar selection. The rows edit the same persisted scope as the compact
 * chip row (state is shared across displays), with list semantics: a tap picks
 * that one source (a sidebar selects, like Mail's mailboxes), a long press adds
 * or removes it for a multi-source scope. "All" always restores every source.
 */
export function resolveMobileSearchSidebarPress({
  sourceIds,
  selection,
  target,
  gesture,
}: {
  sourceIds: string[];
  selection: SearchSourceSelection;
  /** A source id, or null for the "All sources" row. */
  target: string | null;
  gesture: "press" | "longPress";
}): SearchSourceSelection {
  if (target === null) return null;
  if (!sourceIds.includes(target)) return selection;
  if (gesture === "press") {
    return sourceIds.length === 1 ? null : [target];
  }
  const current = new Set(selection ?? sourceIds);
  if (current.has(target)) current.delete(target);
  else current.add(target);
  if (current.size === sourceIds.length) return null;
  return sourceIds.filter((id) => current.has(id));
}

/**
 * Highlighted rows. "All" is the selected row while every source is in scope;
 * otherwise each in-scope source row is.
 */
export function isMobileSearchSidebarRowSelected(
  selection: SearchSourceSelection,
  target: string | null,
): boolean {
  if (target === null) return selection === null;
  return selection !== null && selection.includes(target);
}
