import { useMemo } from "react";
import {
  NavigationTitleMenu,
  navigationTitleMenuAvailable,
  type NavigationTitleMenuSection,
} from "../../modules/nemu-navigation-title-menu";
import type {
  MobileLibraryTitleMenuIcon,
  MobileLibraryTitleMenuSection,
} from "@/lib/mobileLibraryTitleMenu";
import type {
  MobileLibraryTitleMenuHeaderOptions,
  MobileLibraryTitleMenuProps,
} from "./MobileLibraryTitleMenu.types";

/** The UIKit title menu needs the native module (absent in older binaries). */
export const mobileLibraryTitleMenuAvailable = navigationTitleMenuAvailable;

const SYMBOLS: Record<MobileLibraryTitleMenuIcon, string> = {
  library: "books.vertical",
  collection: "rectangle.stack",
  edit: "pencil",
  create: "rectangle.stack.badge.plus",
  manage: "folder.badge.gearshape",
};

function toNativeSections(
  sections: MobileLibraryTitleMenuSection[],
): NavigationTitleMenuSection[] {
  return sections.map((section) => ({
    id: section.id,
    items: section.items.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      systemImage: SYMBOLS[item.icon],
      checked: item.checked,
      disabled: item.disabled,
    })),
  }));
}

/**
 * iOS: `UINavigationItem.titleMenuProvider` on this screen — the system
 * chevron beside the navigation title, and the Files-style menu opened from
 * the title. Renders nothing visible.
 */
export function MobileLibraryTitleMenuAnchor({
  sections,
  onAction,
}: MobileLibraryTitleMenuProps) {
  const nativeSections = useMemo(() => toNativeSections(sections), [sections]);
  // No document header (icon + name) above the items: the owner wants the
  // menu to open straight on the collection list.
  return (
    <NavigationTitleMenu sections={nativeSections} onSelectAction={onAction} />
  );
}

export function getMobileLibraryTitleMenuHeaderOptions(
  _props: MobileLibraryTitleMenuProps,
): MobileLibraryTitleMenuHeaderOptions {
  return {};
}
