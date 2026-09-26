type MangaDetailRouteSource = {
  id: string;
};

function addUniqueCandidate(candidates: string[], candidate: string | null | undefined) {
  const trimmed = candidate?.trim();
  if (!trimmed || candidates.includes(trimmed)) return;
  candidates.push(trimmed);
}

function decodeRouteComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function encodePathSeparators(value: string): string {
  return value.replace(/\//g, "%2F");
}

export function getMobileMangaDetailRouteIdCandidates(
  value: string | string[] | undefined,
): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return [];

  const candidates: string[] = [];
  const trimmed = raw.trim();
  addUniqueCandidate(candidates, trimmed);

  const decoded = decodeRouteComponent(trimmed);
  addUniqueCandidate(candidates, decoded);

  addUniqueCandidate(candidates, encodePathSeparators(trimmed));
  if (decoded) {
    addUniqueCandidate(candidates, encodePathSeparators(decoded));
  }

  return candidates;
}

export function normalizeMobileMangaDetailSourceParam(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

export function resolveMobileMangaDetailSelectedSourceId(
  sources: MangaDetailRouteSource[],
  routeSourceId: string | null,
  fallbackSourceId: string | null,
): string | null {
  if (!sources.length) return null;

  if (routeSourceId) {
    return sources.some((source) => source.id === routeSourceId)
      ? routeSourceId
      : sources[0].id;
  }

  if (
    fallbackSourceId &&
    sources.some((source) => source.id === fallbackSourceId)
  ) {
    return fallbackSourceId;
  }

  return sources[0].id;
}

export function getMobileMangaDetailRouteSourceParam(
  sourceId: string | null,
  sources: MangaDetailRouteSource[],
): string | undefined {
  if (!sourceId) return undefined;
  const sourceIndex = sources.findIndex((source) => source.id === sourceId);
  if (sourceIndex === 0) return undefined;
  return sourceId;
}

export function shouldRedirectMissingMobileMangaDetailEntry({
  loading,
  error,
  hasEntry,
}: {
  loading: boolean;
  error: string | null;
  hasEntry: boolean;
}): boolean {
  return !loading && !error && !hasEntry;
}

export type MobileMangaDetailExitAction = "none" | "back" | "replace-library";

/**
 * How the library detail screen leaves itself after its title disappears
 * (removed here, or on another device). It used to `router.replace("/library")`
 * — replacing the detail with a *second* library index on top of the tab's
 * own, so the user landed on a duplicate Library screen with a Back button.
 * Both the missing-entry redirect and the removal flow fired it, too.
 *
 * - Pop back to whatever pushed the detail (the library grid or a collection)
 *   when the stack can be dismissed.
 * - Only a detail with nothing under it (cold deep link without the stack's
 *   initial route) replaces itself with the library.
 * - Exit at most once per screen instance.
 */
export function resolveMobileMangaDetailExitAction({
  alreadyExiting,
  canDismiss,
}: {
  alreadyExiting: boolean;
  canDismiss: boolean;
}): MobileMangaDetailExitAction {
  if (alreadyExiting) return "none";
  return canDismiss ? "back" : "replace-library";
}

export function canSelectMobileMangaDetailSourceTab({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}
