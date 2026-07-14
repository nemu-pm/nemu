export type MobileRootTabHref = "/library" | "/browse" | "/search" | "/settings";
export type MobileRootTabPressAction = "navigate" | "reselect" | "ignore";

function normalizedPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function normalizedComparablePathname(pathname: string): string {
  const segments = normalizedPathSegments(pathname);
  if (segments.length === 0) return "/library";
  if (segments.length === 1 && segments[0] === "index") return "/library";
  return `/${segments.join("/")}`;
}

function isMobileLibraryRootAlias(pathname: string): boolean {
  const normalizedPathname = normalizedComparablePathname(pathname);
  return normalizedPathname === "/library";
}

export function isMobileReaderRoute(pathname: string): boolean {
  const segments = normalizedPathSegments(pathname);
  return segments[0] === "sources" && segments.length >= 5;
}

export function shouldShowMobileFloatingTabBar(pathname: string): boolean {
  return !isMobileReaderRoute(pathname);
}

export function isMobileRootTabSelected(
  pathname: string,
  href: MobileRootTabHref,
): boolean {
  const normalizedPathname = normalizedComparablePathname(pathname);
  if (href === "/library") return normalizedPathname === "/library";
  return normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
}

export function exactMobileRootTabHrefForPathname(
  pathname: string,
): MobileRootTabHref | null {
  const normalizedPathname = normalizedComparablePathname(pathname);
  if (isMobileLibraryRootAlias(normalizedPathname)) return "/library";
  if (normalizedPathname === "/browse") return "/browse";
  if (normalizedPathname === "/search") return "/search";
  if (normalizedPathname === "/settings") return "/settings";
  return null;
}

export function shouldReselectMobileRootTab(
  pathname: string,
  href: MobileRootTabHref,
): boolean {
  return exactMobileRootTabHrefForPathname(pathname) === href;
}

export function canNavigateMobileRootTab(
  pathname: string,
  href: MobileRootTabHref,
): boolean {
  const normalizedPathname = normalizedComparablePathname(pathname);
  return normalizedPathname !== href;
}

export function getMobileRootTabPressAction(
  pathname: string,
  href: MobileRootTabHref,
): MobileRootTabPressAction {
  if (shouldReselectMobileRootTab(pathname, href)) return "reselect";
  if (canNavigateMobileRootTab(pathname, href)) return "navigate";
  return "ignore";
}
