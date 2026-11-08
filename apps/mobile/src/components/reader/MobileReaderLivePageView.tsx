import { type ReactNode, useSyncExternalStore } from "react";
import {
  mobileReaderLivePageIndex,
  type MobileReaderLivePageStore,
} from "@/lib/mobileReaderLivePage";

const NO_LIVE_PAGE_STORE: MobileReaderLivePageStore = {
  get: () => null,
  set: () => undefined,
  subscribe: () => () => undefined,
};

/**
 * Scroll reading: renders a piece of chrome (the toolbar's page counter) for
 * the page the list shows right now. Only this element subscribes to the live
 * page store, so a page crossing mid-fling repaints the label — at once, no
 * transition — not the reader. A commit supersedes the live page (see
 * `mobileReaderLivePageIndex`). Without a store it shows `committedIndex`.
 */
export function MobileReaderLivePageView({
  liveStore,
  committedIndex,
  children,
}: {
  liveStore?: MobileReaderLivePageStore;
  committedIndex: number;
  children: (pageIndex: number) => ReactNode;
}) {
  const store = liveStore ?? NO_LIVE_PAGE_STORE;
  const live = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <>{children(mobileReaderLivePageIndex(live, committedIndex))}</>;
}
