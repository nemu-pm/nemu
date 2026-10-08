import { useSyncExternalStore } from "react";
import { isMobileNowReadingCovered, type MobileNowReadingCover } from "@/lib/mobileNowReadingCover";

/**
 * When the Now Reading accessory shows (design-explore).
 *
 * `always` (default): whenever something is in progress.
 * `away` (`EXPO_PUBLIC_NEMU_NOW_READING=away`): not while the Library shows
 * the same title's Continue Reading card — the card is right there, a second
 * copy under it says nothing. It appears once that card scrolls out of view,
 * another card becomes the active one, or the user leaves the Library.
 *
 * In a compact-height window (a phone in landscape) the accessory steps aside
 * while the cards rest in view in either mode: the cards cannot rest clear of
 * it there (`MobileNowReadingCover.compactHeight`); and on a title page,
 * whose info pane holds its own Continue (`shortTitlePane`).
 */
export const mobileNowReadingMode: "always" | "away" =
  process.env.EXPO_PUBLIC_NEMU_NOW_READING === "away" ? "away" : "always";

let state: MobileNowReadingCover = {
  libraryFocused: false,
  scrolledBy: 0,
  hideWhileScrolledUnder: null,
  firstCardActive: true,
  compactHeight: false,
};
let covered = false;
const listeners = new Set<() => void>();

function update(patch: Partial<MobileNowReadingCover>) {
  state = { ...state, ...patch };
  const next =
    (mobileNowReadingMode === "away" || state.compactHeight === true || state.shortTitlePane === true) &&
    isMobileNowReadingCovered(state);
  if (next === covered) return;
  covered = next;
  for (const listener of listeners) listener();
}

/** The Library tab is (or stops being) the screen in front. */
export function setMobileLibraryFocused(focused: boolean) {
  update({ libraryFocused: focused });
}

/** How far the Library list is scrolled from its resting top. */
export function reportMobileLibraryScroll(scrolledBy: number) {
  if (Math.abs(scrolledBy - state.scrolledBy) >= 1) update({ scrolledBy });
}

/** The scroll distance under which the first card still shows enough of itself (null: no cards). */
export function reportMobileContinueCardsFrame(hideWhileScrolledUnder: number | null) {
  update({ hideWhileScrolledUnder });
}

/** Whether the first card (the title the accessory would show) is the active one. */
export function reportMobileFirstContinueCardActive(active: boolean) {
  update({ firstCardActive: active });
}

/** The Library's window is (or stops being) compact height. */
export function reportMobileNowReadingCompactHeight(compactHeight: boolean) {
  update({ compactHeight });
}

// Title pages in front with a short info pane (a counter: a page mounts
// before the one it covers unmounts during a push or pop).
let shortTitlePanes = 0;

/** A title page's short info pane comes into (+1) or leaves (-1) the front. */
export function reportMobileShortTitlePane(delta: 1 | -1) {
  shortTitlePanes = Math.max(0, shortTitlePanes + delta);
  update({ shortTitlePane: shortTitlePanes > 0 });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Whether the accessory is on screen (the tab layout reports it), for the
// resting edge of a short window, where UIKit leaves it out of the inset.
let shown = false;
const shownListeners = new Set<() => void>();

export function reportMobileNowReadingShown(next: boolean) {
  if (next === shown) return;
  shown = next;
  for (const listener of shownListeners) listener();
}

export function useMobileNowReadingShown(): boolean {
  return useSyncExternalStore(
    (listener) => {
      shownListeners.add(listener);
      return () => {
        shownListeners.delete(listener);
      };
    },
    () => shown,
    () => false,
  );
}

/** True while the Library's own card stands in for the accessory (always false in `always` mode). */
export function useMobileNowReadingCovered(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => covered,
    () => false,
  );
}
