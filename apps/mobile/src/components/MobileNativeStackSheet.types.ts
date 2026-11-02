import type { ReactNode } from "react";

/** Where a page's React Native content lays out: the page's width and the Form inset its groups sit on. */
export type MobileNativeStackSheetLayout = { width: number; inset: number };

export type MobileNativeStackSheetPage = {
  /** The page's identity (its NavigationStack path value). */
  id: string;
  /** In the bar, centred. */
  title: string;
  /** The page's React Native content, laid out at `layout`. */
  render: (layout: MobileNativeStackSheetLayout) => ReactNode;
  /**
   * An inert copy of the page (no side effects: handlers are no-ops, nothing
   * starts) laid out off screen so the sheet presents at its height. Without
   * one the sheet starts at `estimatedHeight` and fits once the page is up.
   */
  measure?: (layout: MobileNativeStackSheetLayout) => ReactNode;
};

export type MobileNativeStackSheetProps = {
  visible: boolean;
  /** The person dismissed the sheet (swipe down or ✕), reported once it is down. */
  onClose: () => void;
  /** The system finished dismissing the sheet. */
  onDismiss?: () => void;
  /** The root page, then each page pushed on it. */
  pages: MobileNativeStackSheetPage[];
  /** The system back (chevron or edge swipe) popped to `depth` pages. */
  onPop?: (depth: number) => void;
  closeAccessibilityLabel: string;
  /** Disables ✕ (work in flight). */
  closeDisabled?: boolean;
  /** Blocks swipe-to-dismiss (work in flight). */
  interactiveDismissDisabled?: boolean;
  /** Measured heights are kept per group and page (and width), across presentations. */
  group: string;
  /** The detent until the page on top has a measured height. */
  estimatedHeight: number;
  /** The tallest the sheet may be (a fold's hinge); taller pages scroll. */
  maxHeight?: number | null;
  /**
   * `glass` (default): the system's Liquid Glass sheet. `material`: the
   * regular material, as the reader settings sheet (legible over manga pages).
   */
  background?: "glass" | "material";
  /** The screen behind stays interactive and undimmed (a book-posed reader). */
  backgroundInteraction?: boolean;
  testID?: string;
};
