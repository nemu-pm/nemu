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
 */

type LiveGroupSource = { id: string; name: string };

export type MobileLiveSearchGroupLike<S extends LiveGroupSource = LiveGroupSource> =
  | { status: "loading"; source: S }
  | { status: "ready"; source: S; items: readonly unknown[]; hasMore: boolean }
  | { status: "blocked"; source: S; title?: string; detail: string };

export type MobileLiveSearchPartition<G extends MobileLiveSearchGroupLike> = {
  /** Sources that answered with at least one match. */
  sections: Extract<G, { status: "ready" }>[];
  /** Sources still searching. */
  loading: G["source"][];
  /** Sources that could not be searched. */
  failed: Extract<G, { status: "blocked" }>[];
  /** Sources that answered with no match. */
  empty: G["source"][];
};

export function partitionMobileLiveSearchGroups<G extends MobileLiveSearchGroupLike>(
  groups: readonly G[],
): MobileLiveSearchPartition<G> {
  const partition: MobileLiveSearchPartition<G> = { sections: [], loading: [], failed: [], empty: [] };
  for (const group of groups) {
    if (group.status === "loading") {
      partition.loading.push(group.source);
    } else if (group.status === "blocked") {
      partition.failed.push(group as Extract<G, { status: "blocked" }>);
    } else if (group.items.length > 0) {
      partition.sections.push(group as Extract<G, { status: "ready" }>);
    } else {
      partition.empty.push(group.source);
    }
  }
  return partition;
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
  /** Short reason shown under the names ("Source error", "Cloudflare protection detected"). */
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
