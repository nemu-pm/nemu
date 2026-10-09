import type { NavigationTitleMenuProps } from "./types";

/** Android / web: no UIKit title menu; screens render their own fallback. */
export const navigationTitleMenuAvailable = false;

export default function NavigationTitleMenu(_props: NavigationTitleMenuProps) {
  return null;
}
