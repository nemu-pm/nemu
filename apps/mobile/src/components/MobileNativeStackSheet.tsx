import type { MobileNativeStackSheetProps } from "./MobileNativeStackSheet.types";

/** Android / web keep their React Native sheets (`MobileNativeSheetScaffold`). */
export const mobileNativeStackSheetAvailable = false;

export function MobileNativeStackSheet(_props: MobileNativeStackSheetProps) {
  return null;
}
