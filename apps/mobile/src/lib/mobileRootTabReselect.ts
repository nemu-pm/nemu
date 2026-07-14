import type { MobileRootTabHref } from "./mobileRootTabs";

type MobileRootTabReselectHandler = () => void;

const handlers = new Map<MobileRootTabHref, Set<MobileRootTabReselectHandler>>();

export function subscribeMobileRootTabReselect(
  href: MobileRootTabHref,
  handler: MobileRootTabReselectHandler,
): () => void {
  const existingHandlers = handlers.get(href);
  const nextHandlers = existingHandlers ?? new Set<MobileRootTabReselectHandler>();
  nextHandlers.add(handler);
  if (!existingHandlers) handlers.set(href, nextHandlers);

  return () => {
    nextHandlers.delete(handler);
    if (nextHandlers.size === 0) handlers.delete(href);
  };
}

export function emitMobileRootTabReselect(href: MobileRootTabHref): void {
  handlers.get(href)?.forEach((handler) => handler());
}
