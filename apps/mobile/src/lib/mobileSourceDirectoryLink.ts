/**
 * `nemu://addSourceList?url=<https url>` and Aidoku's
 * `aidoku://addSourceList?url=<https url>` add a source directory in one tap.
 * Any other `aidoku://` link (Aidoku's `aidoku://<sourceId>/<mangaKey>` deep
 * links) is not ours to handle and is ignored.
 */

export const MOBILE_SOURCE_DIRECTORY_LINK_SCHEMES = ["nemu", "aidoku"] as const;

export type MobileSourceDirectoryLink =
  | { kind: "add-directory"; url: string }
  /** An `aidoku://` or `nemu://` link this app does not act on. */
  | { kind: "ignored" };

const LINK = /^(nemu|aidoku):\/{0,3}([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/** The `url` query value: encoded, or pasted raw (with its own `?` and `&`). */
function queryUrl(query: string): string | null {
  const start = /(?:^|&)url=/i.exec(query);
  if (!start) return null;
  const raw = query.slice(start.index + start[0].length);
  // Raw `url=https://host/a?x=1&y=2`: the whole tail is the address.
  if (/^https?:\/\//i.test(raw)) return raw;
  const decoded = decode(raw.split("&")[0] ?? "");
  return decoded && decoded.trim() ? decoded.trim() : null;
}

/**
 * Classifies a link. Null means it is not one of ours at all (another scheme,
 * a web URL, garbage); `ignored` means ours by scheme but not an add link.
 */
export function parseMobileSourceDirectoryLink(
  input: string,
): MobileSourceDirectoryLink | null {
  const match = LINK.exec(input.trim());
  if (!match) return null;
  const route = match[2]!.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (route !== "addsourcelist") {
    // nemu:// links to anything else (tabs, screens) are the router's own.
    return match[1]!.toLowerCase() === "aidoku" ? { kind: "ignored" } : null;
  }
  const url = queryUrl(match[3] ?? "");
  return url ? { kind: "add-directory", url } : { kind: "ignored" };
}

/**
 * What the add-directory prompt does with pasted text: a `nemu://` or
 * `aidoku://addSourceList?url=` link yields its inner address, anything else
 * is returned unchanged.
 */
export function extractMobileSourceDirectoryUrl(input: string): string {
  const link = parseMobileSourceDirectoryLink(input);
  return link?.kind === "add-directory" ? link.url : input;
}
