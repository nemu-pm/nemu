import {
  LOCAL_ARCHIVE_LIMITS,
  LOCAL_ARCHIVE_PAGE_EXTENSIONS,
  LocalArchiveError,
  type LocalArchiveLimits,
} from "./policy";

export type ArchiveEntryDecision =
  | { kind: "page"; name: string; extension: string }
  | { kind: "skip" };

const SKIPPED_NAMES = new Set(["thumbs.db", "desktop.ini"]);

/**
 * Classifies one zip entry name. Throws for names that must fail the whole
 * import (path traversal and friends); returns `skip` for harmless extras.
 */
export function classifyArchiveEntry(
  rawName: string,
  limits: Pick<LocalArchiveLimits, "maxPathLength"> = LOCAL_ARCHIVE_LIMITS,
): ArchiveEntryDecision {
  if (rawName.length === 0 || rawName.length > limits.maxPathLength) {
    throw new LocalArchiveError("unsafe-path", "Invalid entry name length.");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(rawName) || rawName.includes("\\")) {
    throw new LocalArchiveError("unsafe-path", "Entry name has control characters or backslashes.");
  }
  if (rawName.startsWith("/") || /^[A-Za-z]:/.test(rawName)) {
    throw new LocalArchiveError("unsafe-path", "Absolute entry path.");
  }
  const isDirectory = rawName.endsWith("/");
  const segments = rawName.split("/").filter((segment, index, all) => !(segment === "" && index === all.length - 1));
  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw new LocalArchiveError("unsafe-path", "Entry path escapes the archive.");
  }
  if (isDirectory) return { kind: "skip" };
  if (segments.some((segment) => segment.startsWith(".") || segment === "__MACOSX")) {
    return { kind: "skip" };
  }
  const file = segments[segments.length - 1]!;
  if (SKIPPED_NAMES.has(file.toLowerCase())) return { kind: "skip" };
  const dot = file.lastIndexOf(".");
  const extension = dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
  if (!(LOCAL_ARCHIVE_PAGE_EXTENSIONS as readonly string[]).includes(extension)) {
    return { kind: "skip" };
  }
  return { kind: "page", name: segments.join("/"), extension };
}

function tokenize(value: string): Array<string | bigint> {
  return (value.toLowerCase().match(/\d+|\D+/g) ?? []).map((part) => (/^\d/.test(part) ? BigInt(part) : part));
}

/** Natural, case-insensitive path order: `2.jpg` before `10.jpg`, folder by folder. */
export function compareNaturalPaths(a: string, b: string): number {
  const left = a.split("/");
  const right = b.split("/");
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const lastLeft = i === left.length - 1;
    const lastRight = i === right.length - 1;
    // Files in a folder sort before its subfolders' contents? Keep it simple:
    // compare segment tokens; a file and a folder at the same depth compare by name.
    const result = compareSegment(left[i]!, right[i]!);
    if (result !== 0) return result;
    if (lastLeft !== lastRight) return lastLeft ? -1 : 1;
  }
  return left.length - right.length;
}

function compareSegment(a: string, b: string): number {
  const x = tokenize(a);
  const y = tokenize(b);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const p = x[i]!;
    const q = y[i]!;
    if (typeof p === "bigint" && typeof q === "bigint") {
      if (p !== q) return p < q ? -1 : 1;
    } else if (typeof p === "string" && typeof q === "string") {
      if (p !== q) return p < q ? -1 : 1;
    } else {
      return typeof p === "bigint" ? -1 : 1;
    }
  }
  return x.length - y.length || (a < b ? -1 : a > b ? 1 : 0);
}
