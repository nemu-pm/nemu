import type { ReactNode } from "react";

export type MobileAddSourcesStackProps = {
  /** The pages over the list, from `@/lib/mobileAddSourcesPages`. */
  path: string[];
  /** The system back popped a page, or a row pushed one. */
  onPathChange: (path: string[]) => void;
  /** A directory was added: the caller pops back to the list, on these sources. */
  onDirectoryAdded: (directoryId: string) => void;
  /** A server was saved and its form is cleared: the caller brings the sheet down. */
  onServerConnected: () => void;
  /** The top page holds what a swipe-down would discard, or a request in flight. */
  onDismissBlockedChange: (blocked: boolean) => void;
  /** The root page's bar, as the system draws it: its title, the filter and ✕. */
  title: string;
  closeAccessibilityLabel: string;
  onClose: () => void;
  filter: {
    accessibilityLabel: string;
    /** A filter is on: the button says so. */
    active: boolean;
    onPress: () => void;
  };
  /** The list: the stack's root page. */
  children: ReactNode;
};
