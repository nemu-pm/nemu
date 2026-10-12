import { router } from "expo-router";
import {
  mobileRootTabHrefForUrl,
  navigateToMobileRootTab,
} from "@/lib/mobileRootTabNavigation";

/**
 * A `nemu://` link to a tab root that arrives while the app is running goes
 * back to that root (closing a detail or reader above the tabs) instead of
 * pushing a second copy of it; see `navigateToMobileRootTab`. Every other
 * link, and the launch URL, keeps Expo Router's default handling.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    if (initial) return path;
    const href = mobileRootTabHrefForUrl(path);
    if (!href) return path;
    return navigateToMobileRootTab(href, { popToRoot: true, router })
      ? null
      : path;
  } catch {
    return path;
  }
}
