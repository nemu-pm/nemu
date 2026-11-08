import type { ReactNode } from "react";
import type { NemuColorScheme, NemuTokens } from "@/design-system";
import type { MobileLibraryTitleMenuSection } from "@/lib/mobileLibraryTitleMenu";

export type MobileLibraryTitleMenuProps = {
  /** The navigation title: the shown collection's name, or Library for All. */
  title: string;
  sections: MobileLibraryTitleMenuSection[];
  /** Spoken after the title ("switches the shown collection"). */
  accessibilityHint: string;
  tokens: NemuTokens;
  scheme: NemuColorScheme;
  onAction: (id: string) => void;
};

/**
 * Header option overrides that put the menu on the navigation title. Android
 * replaces the title with a dropdown; iOS keeps the plain title (the UIKit
 * title menu attaches through `MobileLibraryTitleMenuAnchor`).
 */
export type MobileLibraryTitleMenuHeaderOptions = {
  headerTitle?: () => ReactNode;
};
