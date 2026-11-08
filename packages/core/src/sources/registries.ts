/**
 * Source directories ("registries" in the code) — the Aidoku-style
 * `index.min.json` catalogs a source can be installed from.
 *
 * `AIDOKU_REGISTRIES` is the legacy built-in pair web still iterates (`as
 * const`, readonly literal; web only reads it). Mobile no longer auto-registers
 * those two: it ships the Nemu recommended directory and lets the user add
 * their own. The two legacy directories stay exported as
 * `LEGACY_DEFAULT_SOURCE_DIRECTORIES` so a profile that installed sources from
 * them keeps receiving updates (they become user-added directories on first
 * launch of the new model).
 */

import { sha256Bytes } from "../source-oauth";

export type AidokuRegistryDefinition = {
  id: string;
  name: string;
  indexUrl: string;
};

export const AIDOKU_REGISTRIES = [
  {
    id: "aidoku-community",
    name: "Aidoku Community",
    indexUrl: "https://aidoku-community.github.io/sources/index.min.json",
  },
  {
    id: "aidoku-zh",
    name: "Aidoku ZH",
    indexUrl:
      "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
  },
] as const satisfies readonly AidokuRegistryDefinition[];

/** Stable id of the one directory nemu ships with. */
export const NEMU_RECOMMENDED_REGISTRY_ID = "nemu-recommended";

export const NEMU_RECOMMENDED_REGISTRY: AidokuRegistryDefinition = {
  id: NEMU_RECOMMENDED_REGISTRY_ID,
  name: "nemu example sources",
  // Placeholder until the nemu-pm/source-registry Pages site is published.
  indexUrl: "https://nemu-pm.github.io/source-registry/index.min.json",
};

/** The pre-directory built-ins. Ids are kept: installed sources reference them. */
export const LEGACY_DEFAULT_SOURCE_DIRECTORIES: readonly AidokuRegistryDefinition[] =
  AIDOKU_REGISTRIES;

/** Persisted directory entry (a `registries` row of `type: "url"`). */
export type SourceDirectory = AidokuRegistryDefinition & {
  /** Shipped with the app: can be disabled but not removed. */
  builtIn: boolean;
  /** Disabled directories are skipped by catalog loads and source updates. */
  enabled: boolean;
  addedAt: number;
  /** The user typed this name: catalog refreshes never replace it. */
  customName?: boolean;
};

export const SOURCE_DIRECTORY_MAX_URL_LENGTH = 2_048;
export const SOURCE_DIRECTORY_MAX_NAME_LENGTH = 80;
export const SOURCE_DIRECTORY_MAX_COUNT = 32;

export type SourceDirectoryUrlResult =
  | { ok: true; indexUrl: string }
  | {
      ok: false;
      reason:
        | "empty"
        | "invalid"
        | "not-https"
        | "credentials"
        | "too-long"
        | "local-host";
    };

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fe80:") || /^f[cd]/.test(host)) {
    return host.includes(":");
  }
  const parts = host.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    const [a, b] = parts.map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return false;
}

/**
 * Turns what a user typed into the canonical index URL. A bare site or folder
 * URL gets `index.min.json` appended (GitHub Pages sites publish at the root);
 * a URL that already names a `.json` file is kept. HTTPS only: a directory
 * decides which code gets installed, so it must not be tamperable in transit.
 */
export function normalizeSourceDirectoryUrl(
  input: string,
): SourceDirectoryUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > SOURCE_DIRECTORY_MAX_URL_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not-https" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  if (!url.hostname || isLocalOrPrivateHost(url.hostname)) {
    return { ok: false, reason: "local-host" };
  }
  url.hash = "";
  if (!/\.json$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/index.min.json`;
  }
  const indexUrl = url.toString();
  if (indexUrl.length > SOURCE_DIRECTORY_MAX_URL_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  return { ok: true, indexUrl };
}

/**
 * The addresses to try for what a user typed, in order. Aidoku tries a URL
 * with no `.json` file as a source list itself first and, if that is not a
 * list, `<url>/index.min.json`; a URL that names a `.json` file is tried alone.
 */
export function sourceDirectoryCandidateUrls(
  input: string,
): { ok: true; urls: string[] } | Extract<SourceDirectoryUrlResult, { ok: false }> {
  const normalized = normalizeSourceDirectoryUrl(input);
  if (!normalized.ok) return normalized;
  const url = new URL(input.trim());
  url.hash = "";
  if (/\.json$/i.test(url.pathname)) return { ok: true, urls: [normalized.indexUrl] };
  const exact = url.toString();
  return {
    ok: true,
    urls: exact === normalized.indexUrl ? [exact] : [exact, normalized.indexUrl],
  };
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Deterministic id for a user-added directory. Re-adding the same URL on any
 * device yields the same id, so sources installed from it keep their update
 * origin across remove/re-add and across devices.
 */
export function sourceDirectoryIdForUrl(indexUrl: string): string {
  const knownDefault = [
    NEMU_RECOMMENDED_REGISTRY,
    ...LEGACY_DEFAULT_SOURCE_DIRECTORIES,
  ].find((entry) => entry.indexUrl === indexUrl);
  if (knownDefault) return knownDefault.id;
  return `dir-${hex(sha256Bytes(new TextEncoder().encode(indexUrl))).slice(0, 12)}`;
}

/**
 * The pre-2026 fallback name, `host/path` of the index URL (trailing
 * `index(.min).json` and slashes dropped). Kept to recognise names that were
 * generated this way, so a catalog refresh can replace them.
 */
export function legacySourceDirectoryHostPathName(indexUrl: string): string {
  try {
    const url = new URL(indexUrl);
    const path = url.pathname
      .replace(/\/(index(\.min)?\.json)$/i, "")
      .replace(/\/+$/, "");
    return `${url.hostname}${path}`.slice(0, SOURCE_DIRECTORY_MAX_NAME_LENGTH);
  } catch {
    return indexUrl.slice(0, SOURCE_DIRECTORY_MAX_NAME_LENGTH);
  }
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * A readable fallback name for a directory whose index publishes none:
 * - a known directory (recommended / legacy built-ins): its name;
 * - `raw.githubusercontent.com/OWNER/REPO/…` and
 *   `cdn.jsdelivr.net/gh/OWNER/REPO@ref/…`: `OWNER/REPO`;
 * - `OWNER.github.io/REPO/…`: `OWNER/REPO` (`OWNER` for a root site);
 * - anything else: `host/path` of the index URL.
 */
export function defaultSourceDirectoryName(indexUrl: string): string {
  const known = [NEMU_RECOMMENDED_REGISTRY, ...LEGACY_DEFAULT_SOURCE_DIRECTORIES].find(
    (entry) => entry.indexUrl === indexUrl,
  );
  if (known) return known.name;
  let url: URL;
  try {
    url = new URL(indexUrl);
  } catch {
    return indexUrl.slice(0, SOURCE_DIRECTORY_MAX_NAME_LENGTH);
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean).map(safeDecode);
  let repo: string | undefined;
  if (host === "raw.githubusercontent.com" && parts.length >= 2) {
    repo = `${parts[0]}/${parts[1]}`;
  } else if (host === "cdn.jsdelivr.net" && parts[0] === "gh" && parts.length >= 3) {
    const name = parts[2]!.split("@")[0];
    if (name) repo = `${parts[1]}/${name}`;
  } else if (host.endsWith(".github.io") && host.length > ".github.io".length) {
    const owner = host.slice(0, -".github.io".length);
    const first = parts[0];
    repo = first && !/\.json$/i.test(first) ? `${owner}/${first}` : owner;
  }
  if (repo) return repo.slice(0, SOURCE_DIRECTORY_MAX_NAME_LENGTH);
  return legacySourceDirectoryHostPathName(indexUrl);
}

/**
 * The name a stored directory should take after its index was fetched, or
 * null to keep it. Only generated names are replaced — the old `host/path`
 * form or the current fallback for the URL — by the index's own name, else by
 * the current fallback rule. A name the user typed is never touched.
 */
export function refreshedSourceDirectoryName({
  storedName,
  indexUrl,
  indexName,
  customName = false,
}: {
  storedName: string;
  indexUrl: string;
  indexName?: string | null;
  /** The user typed this name (never overwritten). */
  customName?: boolean;
}): string | null {
  if (customName) return null;
  const fallback = defaultSourceDirectoryName(indexUrl);
  const generated =
    storedName === legacySourceDirectoryHostPathName(indexUrl) || storedName === fallback;
  if (!generated) return null;
  const published = indexName?.trim().slice(0, SOURCE_DIRECTORY_MAX_NAME_LENGTH);
  const next = published || fallback;
  return next && next !== storedName ? next : null;
}
