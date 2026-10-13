import { LOCAL_ARCHIVE_REGISTRY_ID, LOCAL_ARCHIVE_SOURCE_ID } from "@/lib/localArchives/policy";

/** Registry id of every built-in self-hosted server source (Komga, Kavita, Suwayomi). */
export const SELF_HOSTED_REGISTRY_ID = "self-hosted";

export const SELF_HOSTED_KINDS = ["komga", "kavita", "suwayomi"] as const;
export type SelfHostedKind = (typeof SELF_HOSTED_KINDS)[number];

/** The kinds the Add Source sheet offers a setup form for. */
export const SELF_HOSTED_SETUP_KINDS: readonly SelfHostedKind[] = ["komga", "kavita", "suwayomi"];

/** What a self-hosted source row persists (and syncs). Credentials are never part of it. */
export type SelfHostedConfig = {
  kind: SelfHostedKind;
  /** Origin plus optional reverse-proxy path, no trailing slash, no credentials. */
  server: string;
};

/**
 * Source-id prefixes only the built-in sources may use. A downloaded `.aix`
 * (imported file or directory entry) with one of these ids is refused, so a
 * package can never impersonate a server source, inherit its saved login or its
 * local-network grant, or collide with an installed server's key.
 */
export const RESERVED_SOURCE_ID_PREFIXES: readonly string[] = [...SELF_HOSTED_KINDS];

const RESERVED_EXACT_SOURCE_IDS: readonly string[] = [LOCAL_ARCHIVE_SOURCE_ID, LOCAL_ARCHIVE_REGISTRY_ID];

export function isReservedSourceId(sourceId: string | null | undefined): boolean {
  const id = (sourceId ?? "").trim().toLowerCase();
  if (!id) return false;
  return (
    RESERVED_SOURCE_ID_PREFIXES.some((prefix) => id.startsWith(prefix)) ||
    RESERVED_EXACT_SOURCE_IDS.includes(id)
  );
}

export function isSelfHostedKind(value: unknown): value is SelfHostedKind {
  return typeof value === "string" && (SELF_HOSTED_KINDS as readonly string[]).includes(value);
}

export function isSelfHostedRegistryId(registryId: string | null | undefined): boolean {
  return registryId === SELF_HOSTED_REGISTRY_ID;
}

/** Canonical (`registry:source`) key of a server source, as the rest of the app keys sources. */
export function selfHostedSourceKey(sourceId: string): string {
  return `${SELF_HOSTED_REGISTRY_ID}:${sourceId}`;
}

const MAX_SLUG_LENGTH = 32;

/**
 * Lowercase ASCII slug of the display name; names with no usable characters
 * (a name entirely in Chinese, say) fall back to "server". The slug is only a
 * readable part of the key. Identity is the key, never the name.
 */
export function slugifyServerName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug || "server";
}

/**
 * `komga.<slug>`, with `-1`, `-2`, ... on collision with an existing key
 * (removed servers keep their tombstoned key reserved so library entries of the
 * old server can never attach to a different one later).
 */
export function makeSelfHostedSourceId(
  kind: SelfHostedKind,
  name: string,
  existingSourceIds: Iterable<string>,
): string {
  const taken = new Set([...existingSourceIds].map((id) => id.toLowerCase()));
  const base = `${kind}.${slugifyServerName(name)}`;
  if (!taken.has(base)) return base;
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Could not find a free source key.");
}

export function selfHostedKindOfSourceId(sourceId: string): SelfHostedKind | null {
  const kind = sourceId.split(".")[0]?.toLowerCase();
  return isSelfHostedKind(kind) ? kind : null;
}

export type ServerUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: "empty" | "invalid" | "scheme" | "credentials" | "unreachable-host" };

const NEVER_REACHABLE_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
  "metadata.aws.internal",
  "metadata.azure.internal",
]);

/**
 * Validates and canonicalises what the user typed: http(s) only, no
 * credentials in the URL (they belong in the login fields), no query or
 * fragment, no trailing slash. A missing scheme is read as http, the usual
 * spelling for a home server (`192.168.1.20:25600`). Loopback and metadata
 * hosts are rejected up front with a clear reason; native networking refuses
 * them regardless.
 */
export function normalizeServerUrl(input: string): ServerUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return { ok: false, reason: "invalid" };
  if (
    NEVER_REACHABLE_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    /^127\./.test(host)
  ) {
    return { ok: false, reason: "unreachable-host" };
  }
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, url: `${url.origin}${path}` };
}

export function isSelfHostedConfig(value: unknown): value is SelfHostedConfig {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return isSelfHostedKind(record.kind) && typeof record.server === "string" && record.server.length > 0;
}

/** Credential setting keys, stored through the existing source-settings vault (Keychain / Keystore). */
export const SELF_HOSTED_CREDENTIAL_KEYS = ["username", "password", "apiKey"] as const;

export type SelfHostedCredentials = {
  username?: string;
  password?: string;
  apiKey?: string;
};

export function readSelfHostedCredentials(values: Record<string, unknown> | null | undefined): SelfHostedCredentials {
  const out: SelfHostedCredentials = {};
  for (const key of SELF_HOSTED_CREDENTIAL_KEYS) {
    const value = values?.[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}
