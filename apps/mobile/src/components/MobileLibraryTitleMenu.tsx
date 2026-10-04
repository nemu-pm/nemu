import type {
  MobileLibraryTitleMenuHeaderOptions,
  MobileLibraryTitleMenuProps,
} from "./MobileLibraryTitleMenu.types";

/** Web / fallback: no native title menu; the Library screen keeps its sheet. */
export const mobileLibraryTitleMenuAvailable = false;

export function MobileLibraryTitleMenuAnchor(_props: MobileLibraryTitleMenuProps) {
  return null;
}

export function getMobileLibraryTitleMenuHeaderOptions(
  _props: MobileLibraryTitleMenuProps,
): MobileLibraryTitleMenuHeaderOptions {
  return {};
}
