import type { SourceDirectory } from "@nemu/core/sources";
import { extractMobileSourceDirectoryUrl } from "./mobileSourceDirectoryLink";

/**
 * Aidoku's own guide to installing sources (source lists are added in its
 * settings). The Add Directory page points here instead of naming any list:
 * nemu never presets or recommends a third-party directory.
 */
export const AIDOKU_SOURCE_LISTS_GUIDE_URL =
  "https://aidoku.app/help/guides/getting-started/#installing-a-source";

/**
 * A nemu.pm page listing directories with one-tap `nemu://addSourceList`
 * links. Null until that page is published; its row on the Add Directory page
 * stays hidden while unset.
 */
export const NEMU_SOURCE_DIRECTORIES_PAGE_URL: string | null = null;

/** Which stack pushed the Add Directory page, and so where adding returns. */
export type MobileAddSourceDirectoryOrigin = "browse" | "settings";

export function parseMobileAddSourceDirectoryOrigin(
  value: unknown,
): MobileAddSourceDirectoryOrigin {
  return value === "browse" ? "browse" : "settings";
}

/**
 * True once a directory the user added is switched on. Until then Add Sources
 * lists only the built-in demo sources, and its guide to adding a directory is
 * shown as a card instead of a quiet row at the end of the list.
 */
export function hasMobileUserSourceDirectory(
  directories: readonly Pick<SourceDirectory, "builtIn" | "enabled">[],
): boolean {
  return directories.some((directory) => !directory.builtIn && directory.enabled);
}

/**
 * What the Paste button puts in the address field: a pasted `nemu://`,
 * `aidoku://addSourceList` or aidoku.app add-source-list link becomes the
 * address inside it, so the field shows what will actually be added. Null
 * when the clipboard holds nothing that looks like an address.
 */
export function mobileSourceDirectoryAddressFromClipboard(
  text: string | null | undefined,
): string | null {
  const trimmed = text?.trim() ?? "";
  if (!trimmed || /\s/.test(trimmed)) return null;
  const address = extractMobileSourceDirectoryUrl(trimmed).trim();
  return /^https?:\/\/\S+$/i.test(address) ? address : null;
}
