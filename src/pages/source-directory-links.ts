import { normalizeSourceDirectoryUrl, type SourceDirectoryUrlResult } from "@nemu/core/sources";

/**
 * The add link a directory publisher puts on their own site:
 * `nemu://addSourceList?url=<percent-encoded address>`. nemu shows the
 * directory's name and address and asks before adding it. The app also takes
 * `aidoku://addSourceList?url=` and `https://aidoku.app/add-source-list/?url=`
 * (apps/mobile/src/lib/mobileSourceDirectoryLink.ts).
 */
export function nemuAddSourceListLink(address: string): string {
  return `nemu://addSourceList?url=${encodeURIComponent(address)}`;
}

export type AddSourceListLinkResult =
  | { ok: true; link: string }
  | { ok: false; reason: Extract<SourceDirectoryUrlResult, { ok: false }>["reason"] };

/**
 * The link for an address a publisher typed, checked by the rules the app
 * applies when adding (HTTPS, no credentials, not on a local network). The
 * address is linked as typed: like Aidoku, the app tries it as a list first
 * and then as a folder holding `index.min.json`.
 */
export function addSourceListLinkFor(address: string): AddSourceListLinkResult {
  const trimmed = address.trim();
  const normalized = normalizeSourceDirectoryUrl(trimmed);
  if (!normalized.ok) return normalized;
  return { ok: true, link: nemuAddSourceListLink(trimmed) };
}
