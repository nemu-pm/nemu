import { MOBILE_EXPANDED_WIDTH } from "@/lib/mobileAdaptiveLayout";
import type { MobileSplitPaneOptions } from "@/lib/mobileSplitPaneLayout";
import { toggleSearchSourceSelection, type SearchSourceSelection } from "@/lib/mobileSearch";

/**
 * Search on regular widths (Duo inner display, tablets, unfolded foldables):
 * a Mail / Notes style sidebar split — search field, source list and recent
 * searches in the leading pane, results in the trailing pane (HIG, Designing
 * for iPhone Duo: "show an additional level of hierarchy on the inner
 * display").
 *
 * - Partially folded as a book, it is exactly the leading half and nothing
 *   sits on the fold (`getMobileSplitPaneLayout` aligns the panes).
 * - Fully open windows use a narrow sidebar column
 *   (Notes) with a hairline divider.
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
  /**
   * Same semantics as the phone source chips: a tap toggles the source in the
   * scope (multi-select), a double tap or long press searches only it.
   */
  gesture: "press" | "only";
}): SearchSourceSelection {
  if (target === null) return null;
  if (!sourceIds.includes(target)) return selection;
  if (sourceIds.length === 1) return null;
  if (gesture === "only") return [target];
  return toggleSearchSourceSelection(sourceIds, selection, target);
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

export type MobileSearchSidebarCheckState = "on" | "off" | "mixed";

/**
 * The inclusion mark each sidebar row draws, so multi-select reads at a
 * glance: every in-scope source is checked (all of them while "All" is
 * active), an excluded source is an empty circle, and "All" is mixed while
 * only some sources are in scope.
 */
export function resolveMobileSearchSidebarCheckState({
  selection,
  target,
  sourceIds,
}: {
  selection: SearchSourceSelection;
  /** A source id, or null for the "All sources" row. */
  target: string | null;
  sourceIds: readonly string[];
}): MobileSearchSidebarCheckState {
  if (selection === null) return "on";
  if (target !== null) return selection.includes(target) ? "on" : "off";
  const included = sourceIds.filter((id) => selection.includes(id)).length;
  if (included === 0) return "off";
  return included >= sourceIds.length ? "on" : "mixed";
}

/**
 * The "Library" / "Live Source Results" group labels only disambiguate when
 * both groups are on screen; with one kind alone the source headers already
 * say where results come from, so the results start with them.
 */
export function mobileSearchShowsKindHeaders({
  libraryRows,
  liveActive,
}: {
  /** Library matches rendered for the query. */
  libraryRows: number;
  /** A live source search runs or has results for the query. */
  liveActive: boolean;
}): boolean {
  return libraryRows > 0 && liveActive;
}

/** Sidebar search field height: the iOS 36pt capsule, Android's 48dp field. */
export function mobileSearchFieldHeight(platform: string): number {
  return platform === "android" ? 48 : 36;
}

/** `MobileSearchSourceSectionHeader` / `MobileSearchKindHeader` row heights. */
export const MOBILE_SEARCH_SOURCE_HEADER_HEIGHT = 32;
export const MOBILE_SEARCH_KIND_HEADER_HEIGHT = 20;

/**
 * Sidebar split: one vertical grid for both panes. Both lists start at the
 * same content top under the title; the results pane's first header (the
 * first source header, or the "Library" label when both groups show) is
 * centred on the sidebar's search field, so the two columns start level.
 */
export function mobileSearchResultsTopInset({
  fieldHeight,
  firstHeaderHeight,
}: {
  fieldHeight: number;
  firstHeaderHeight: number;
}): number {
  return Math.max(0, Math.round((fieldHeight - firstHeaderHeight) / 2));
}
