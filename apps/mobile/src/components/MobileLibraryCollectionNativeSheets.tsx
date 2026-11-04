import type {
  MobileCollectionNameNativeSheetProps,
  MobileCollectionsManagerNativeSheetProps,
  MobileLibraryTitleMenuNativeSheetProps,
} from "./MobileLibraryCollectionNativeSheets.types";

/** Android / web keep the React Native library sheets in `LibraryScreen`. */
export const mobileLibraryCollectionNativeSheetsAvailable = false;

export function MobileLibraryTitleMenuNativeSheet(_props: MobileLibraryTitleMenuNativeSheetProps) {
  return null;
}

export function MobileCollectionNameNativeSheet(_props: MobileCollectionNameNativeSheetProps) {
  return null;
}

export function MobileCollectionsManagerNativeSheet(_props: MobileCollectionsManagerNativeSheetProps) {
  return null;
}
