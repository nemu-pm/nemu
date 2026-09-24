/**
 * Scoped reloads for the source browse route.
 *
 * `router.invalidate()` with no filter re-runs every loader in the tree (the
 * shell, the browse layout, and any cached or preloaded match), which is a lot
 * of work to undo a Cloudflare block on one source. This filter selects only
 * the browse match for the one source the page is showing.
 */
export const SOURCE_BROWSE_ROUTE_ID = "/_shell/browse/$registryId/$sourceId" as const;

export type SourceBrowseMatchLike = {
  routeId: string;
  params: unknown;
};

export function isSourceBrowseMatchFor(
  match: SourceBrowseMatchLike,
  source: { registryId: string; sourceId: string },
): boolean {
  if (match.routeId !== SOURCE_BROWSE_ROUTE_ID) return false;
  const params = match.params as Partial<Record<"registryId" | "sourceId", unknown>> | null;
  return (
    params?.registryId === source.registryId && params?.sourceId === source.sourceId
  );
}
