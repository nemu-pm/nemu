/**
 * Scroll reading keeps the page on screen out of React state while the
 * reader scrolls: committing it per page crossing re-rendered the whole
 * reader (and every mounted page) a dozen times per fling. The live page —
 * the page under the screen's vertical centre — lives in this tiny store,
 * which only the progress bar and the toolbar's page counter subscribe to;
 * the reader state takes the page once the scroll settles.
 */
export type MobileReaderLivePage = {
  /** The page the list shows right now. */
  index: number;
  /** The committed page this live value was measured against. */
  baseIndex: number;
};

export type MobileReaderLivePageStore = {
  get(): MobileReaderLivePage | null;
  set(next: MobileReaderLivePage | null): void;
  subscribe(listener: () => void): () => void;
};

export function createMobileReaderLivePageStore(): MobileReaderLivePageStore {
  let value: MobileReaderLivePage | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (
        value === next ||
        (value &&
          next &&
          value.index === next.index &&
          value.baseIndex === next.baseIndex)
      ) {
        return;
      }
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The page the progress bar shows. A live value only counts while the
 * committed page is still the one it was measured against: any commit (the
 * settle, a scrubber jump, a restore) supersedes it without a reset step.
 */
export function mobileReaderLivePageIndex(
  live: MobileReaderLivePage | null,
  committedIndex: number,
): number {
  return live && live.baseIndex === committedIndex ? live.index : committedIndex;
}
