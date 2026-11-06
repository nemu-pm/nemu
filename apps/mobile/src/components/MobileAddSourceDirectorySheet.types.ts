/** Settings: Add Source Directory as its own sheet, mounted while it is up. */
export type MobileAddSourceDirectorySheetProps = {
  visible: boolean;
  /** The sheet should come down (Cancel, a swipe, added). */
  onClose: () => void;
  /** It is down; the caller can unmount it. */
  onDismiss: () => void;
};

/** Add Sources: the page pushed inside that sheet. */
export type MobileAddSourcesDirectoryPageProps = {
  /** The page is on the sheet's stack. */
  open: boolean;
  /** Added: the caller pops back to the list, on these sources. */
  onAdded: (directoryId: string) => void;
  /** The page holds what a swipe-down would discard, or a check in flight. */
  onDismissBlockedChange: (blocked: boolean) => void;
};
