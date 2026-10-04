import { getActiveMobileSourceProfileScope } from "@/sources/mobileSourceProfileScope";
import {
  readMobileSearchRecentsText,
  writeMobileSearchRecentsText,
} from "./mobileSearchRecentsStorage";

/**
 * Recent search queries, shown in the regular-width search sidebar.
 *
 * Device-local and per profile (the same profile scope the live-search cache
 * and image cache key on), never synced: it is a convenience list, not user
 * data. Stored as one small JSON file per profile (see
 * `mobileSearchRecentsStorage.native.ts`); the pure list logic lives here.
 */
export const MOBILE_SEARCH_RECENTS_LIMIT = 8;
const MAX_QUERY_LENGTH = 120;

export function normalizeMobileSearchRecentQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

/** Most recent first, case-insensitively de-duplicated, capped. */
export function addMobileSearchRecent(
  recents: readonly string[],
  query: string,
  limit = MOBILE_SEARCH_RECENTS_LIMIT,
): string[] {
  const normalized = normalizeMobileSearchRecentQuery(query);
  if (!normalized) return [...recents];
  const key = normalized.toLocaleLowerCase();
  return [
    normalized,
    ...recents.filter((item) => item.toLocaleLowerCase() !== key),
  ].slice(0, limit);
}

export function removeMobileSearchRecent(recents: readonly string[], query: string): string[] {
  const key = normalizeMobileSearchRecentQuery(query).toLocaleLowerCase();
  return recents.filter((item) => item.toLocaleLowerCase() !== key);
}

export function parseMobileSearchRecents(text: string | null): string[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    const list =
      parsed && typeof parsed === "object" && Array.isArray((parsed as { queries?: unknown }).queries)
        ? (parsed as { queries: unknown[] }).queries
        : [];
    let recents: string[] = [];
    for (const item of [...list].reverse()) {
      if (typeof item === "string") recents = addMobileSearchRecent(recents, item);
    }
    return recents;
  } catch {
    return [];
  }
}

export function serializeMobileSearchRecents(recents: readonly string[]): string {
  return JSON.stringify({ version: 1, queries: recents });
}

/** Short stable file-name-safe key for a profile scope (the scope itself may hold an account id). */
export function mobileSearchRecentsScopeKey(scope: string): string {
  let hash = 5381;
  for (let index = 0; index < scope.length; index += 1) {
    hash = ((hash << 5) + hash + scope.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

const memory = new Map<string, string[]>();

export async function loadMobileSearchRecents(
  scope = getActiveMobileSourceProfileScope(),
): Promise<string[]> {
  const key = mobileSearchRecentsScopeKey(scope);
  const cached = memory.get(key);
  if (cached) return cached;
  let recents: string[] = [];
  try {
    recents = parseMobileSearchRecents(await readMobileSearchRecentsText(key));
  } catch {
    recents = [];
  }
  memory.set(key, recents);
  return recents;
}

export async function saveMobileSearchRecents(
  recents: readonly string[],
  scope = getActiveMobileSourceProfileScope(),
): Promise<void> {
  const key = mobileSearchRecentsScopeKey(scope);
  memory.set(key, [...recents]);
  await writeMobileSearchRecentsText(key, serializeMobileSearchRecents(recents));
}
