/**
 * How the live-source part of Search presents each source's answer.
 *
 * Apple's grouped search results (App Store, Music, Files) show a section only
 * for a group that has something to show; empty groups are not drawn as a
 * repeated placeholder card. Here:
 *
 * - sources with matches → one section each (header + grid), in the order the
 *   search ranked them;
 * - sources still searching → one quiet line with an inline spinner;
 * - sources that failed → one compact row each (the reason and Retry);
 * - sources with no match → one summary line naming them.
 *
 * A title the Library section already shows is not repeated in its source's
 * section. A source left with nothing else did not fail to match, so it gets
 * its own line saying so, or keeps a header with See All if it has more pages.
 * A source with titles in the Library section is never named as having no
 * results, even when its live search misses what the local match found.
 */

import type { LibraryEntry } from "@/data/schema";
import { makeSourceKey } from "@/sources/aidokuRegistry";

type LiveGroupSource = { id: string; name: string };

export type MobileLiveSearchGroupLike<S extends LiveGroupSource = LiveGroupSource> =
  | { status: "loading"; source: S }
  | { status: "ready"; source: S; items: readonly unknown[]; hasMore: boolean; allInLibrary?: boolean }
  | { status: "blocked"; source: S; title?: string; detail: string };

export type MobileLiveSearchPartition<G extends MobileLiveSearchGroupLike> = {
  /** Sources that answered with at least one match. */
  sections: Extract<G, { status: "ready" }>[];
  /** Sources still searching. */
  loading: G["source"][];
  /** Sources that could not be searched. */
  failed: Extract<G, { status: "blocked" }>[];
  /** Sources that answered with no match and have nothing in the Library section. */
  empty: G["source"][];
  /** Sources whose only matches are in the Library section, with no more pages. */
  inLibrary: G["source"][];
};

export function partitionMobileLiveSearchGroups<G extends MobileLiveSearchGroupLike>(
  groups: readonly G[],
  /** Sources the Library section has titles under for this query. */
  librarySourceIds?: ReadonlySet<string>,
): MobileLiveSearchPartition<G> {
  const partition: MobileLiveSearchPartition<G> = { sections: [], loading: [], failed: [], empty: [], inLibrary: [] };
  for (const group of groups) {
    if (group.status === "loading") {
      partition.loading.push(group.source);
    } else if (group.status === "blocked") {
      partition.failed.push(group as Extract<G, { status: "blocked" }>);
    } else if (group.items.length > 0 || (group.allInLibrary && group.hasMore)) {
      partition.sections.push(group as Extract<G, { status: "ready" }>);
    } else if (group.allInLibrary) {
      partition.inLibrary.push(group.source);
    } else if (!librarySourceIds?.has(group.source.id)) {
      partition.empty.push(group.source);
    }
  }
  return partition;
}

/** False when the live part of the page has nothing to draw, not even a status line. */
export function mobileLiveSearchPartitionHasContent(
  partition: MobileLiveSearchPartition<MobileLiveSearchGroupLike>,
): boolean {
  return (
    partition.sections.length > 0 ||
    partition.loading.length > 0 ||
    partition.failed.length > 0 ||
    partition.empty.length > 0 ||
    partition.inLibrary.length > 0
  );
}

type LiveResultSource = LiveGroupSource & {
  registryId: string;
  rawSourceId: string;
  sourceKeys?: string[];
};

type LiveResultGroupLike =
  | { status: "loading" | "blocked"; source: LiveResultSource }
  | { status: "ready"; source: LiveResultSource; items: readonly { id: string }[] };

/**
 * Takes the titles of the Library section out of the live results, by the same
 * identity as library membership: a result belongs to an entry when one of the
 * entry's source links names its source and manga key. Only the entries on
 * screen count: a saved title the local match missed (the source matched an
 * alternate title) stays in the live results, or the search would lose it.
 *
 * Derived for display, so the retained answers stay whole: removing a title
 * from the Library brings it straight back without searching again.
 */
export function omitLibraryTitlesFromLiveSearchGroups<G extends LiveResultGroupLike>(
  groups: G[],
  shownEntries: readonly Pick<LibraryEntry, "sources">[],
): G[] {
  const shownKeys = new Set(
    shownEntries.flatMap((entry) =>
      entry.sources.map((link) => `${makeSourceKey(link.registryId, link.sourceId)}\u0000${link.sourceMangaId}`),
    ),
  );
  if (shownKeys.size === 0) return groups;
  let changed = false;
  const next = groups.map((group) => {
    if (group.status !== "ready") return group;
    const { source } = group;
    const sourceKeys = source.sourceKeys ?? [makeSourceKey(source.registryId, source.rawSourceId)];
    const items = group.items.filter(
      (item) => !sourceKeys.some((key) => shownKeys.has(`${key}\u0000${item.id}`)),
    );
    if (items.length === group.items.length) return group;
    changed = true;
    return { ...group, items, allInLibrary: items.length === 0 };
  });
  return changed ? next : groups;
}

/** The secondary count beside a section title: "8", or "20+" when the source has more. */
export function formatMobileSearchSectionCount(count: number, hasMore = false): string {
  return `${count}${hasMore ? "+" : ""}`;
}

/**
 * Source names for a summary line ("No results in A, B and C"). Past `limit`
 * names the rest collapse into a count so the line stays a line.
 */
export function summarizeMobileSearchSourceNames(
  names: readonly string[],
  limit = 5,
): { names: string[]; overflow: number } {
  const safeLimit = Math.max(1, Math.floor(limit));
  if (names.length <= safeLimit) return { names: [...names], overflow: 0 };
  // "A, B, C, D and 1 more" reads worse than naming E: only collapse two or more.
  const shown = names.length - safeLimit === 1 ? names.length : safeLimit;
  return { names: names.slice(0, shown), overflow: names.length - shown };
}

/**
 * The sources a Retry (or a solved Cloudflare check) runs again for the same
 * query: every in-scope source except those that already answered. A source
 * that already produced results keeps them instead of searching twice.
 */
export function resolveMobileLiveSearchRetrySourceIds({
  sourceIds,
  answered,
}: {
  sourceIds: readonly string[];
  /** Status of each source's last answer for the same query. */
  answered: ReadonlyMap<string, "ready" | "blocked">;
}): string[] {
  return sourceIds.filter((id) => answered.get(id) !== "ready");
}

export type MobileSearchFailureGroup<S extends LiveGroupSource = LiveGroupSource> = {
  /** Short reason shown under the names ("Source error", "Site verification needed"). */
  reason: string;
  /** Longer explanation for assistive tech. */
  detail?: string;
  sources: S[];
};

/**
 * Failed sources that share a reason collapse into one row ("ja.raw1001,
 * ja.rawkuro and zh.mkzhan — Source error") with one Retry, so five packages
 * that are not cached on this device read as one problem, not five cards.
 * Order follows each reason's first failure.
 */
export function groupMobileSearchFailures<S extends LiveGroupSource>(
  failed: readonly { source: S; title?: string; detail: string }[],
): MobileSearchFailureGroup<S>[] {
  const groups = new Map<string, MobileSearchFailureGroup<S>>();
  for (const group of failed) {
    const reason = group.title ?? group.detail;
    const key = `${reason}\u0000${group.title ? group.detail : ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.sources.push(group.source);
    } else {
      groups.set(key, { reason, detail: group.title ? group.detail : undefined, sources: [group.source] });
    }
  }
  return [...groups.values()];
}
