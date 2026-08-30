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

export function canSelectMobileMangaDetailSourceTab({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}
