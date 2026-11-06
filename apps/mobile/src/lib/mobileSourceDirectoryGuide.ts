import type { SourceDirectory } from "@nemu/core/sources";
import { extractMobileSourceDirectoryUrl } from "./mobileSourceDirectoryLink";

/**
 * nemu.pm's help on source directories (the web app's
 * /help/source-directories route): what they are, how to add one, and the add
 * link format for publishers. It lists no directory. Add Source Directory's
 * How Source Directories Work row opens it, and is hidden while this is null.
 */
export const NEMU_SOURCE_DIRECTORIES_HELP_URL: string | null =
  "https://nemu.pm/help/source-directories";

/**
 * Whether a swipe-down is blocked on Add Source Directory: it would discard
 * what was typed, or walk away from a check in flight. Cancel still leaves.
 */
export function mobileAddSourceDirectoryBlocksDismiss({
  address,
  checking,
}: {
  address: string;
  checking: boolean;
}): boolean {
  return checking || address.length > 0;
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
