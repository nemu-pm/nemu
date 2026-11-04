import type { SourceDirectory } from "@nemu/core/sources";
import { extractMobileSourceDirectoryUrl } from "./mobileSourceDirectoryLink";

/**
 * nemu.pm's page listing source directories with one-tap
 * `nemu://addSourceList` links (the web app's /directories route). The app
 * itself never presets or lists a third-party directory; the Add Directory
 * page opens this one in the in-app browser instead.
 */
export const NEMU_SOURCE_DIRECTORIES_PAGE_URL = "https://nemu.pm/directories";

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
