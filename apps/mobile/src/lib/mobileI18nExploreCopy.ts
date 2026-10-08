import type { AppLanguage } from "@/data/schema";
import type { MobileStrings } from "./mobileI18n";

type CopyOverrides = {
  [Section in keyof MobileStrings]?: Partial<Record<keyof MobileStrings[Section], string>>;
};

/**
 * Design-explore copy that replaces the shipping words where the prototype
 * gives them another meaning. "Shelf" is the Library's layout there (Shelf |
 * Grid), so a collection is no longer called a shelf ("Create a shelf and
 * select it for this title"). Japanese already says コレクション. And the
 * installed-sources caption says what the list is for, not how it is built
 * ("Source packages, runtime settings, and local uninstall").
 */
export const MOBILE_DESIGN_EXPLORE_COPY: Partial<Record<AppLanguage, CopyOverrides>> = {
  en: {
    library: {
      collectionEmpty: "This collection is empty. Add titles to it.",
      newCollectionDescription: "Name a collection for a reading list.",
      renameDescription: "The new name shows everywhere in your library.",
    },
    collectionMembership: {
      newCollectionDescription: "Name a collection; this title goes in it.",
    },
    settings: {
      installedSourcesDescription: "Where your manga comes from. Switch a source off to set it aside.",
    },
  },
  zh: {
    library: {
      collectionEmpty: "这个收藏还是空的，添加作品吧。",
      newCollectionDescription: "为一组想读的作品新建一个收藏。",
      renameDescription: "新名称会在整个书库中更新。",
    },
    collectionMembership: {
      newCollectionDescription: "新建收藏，并把这部作品放进去。",
    },
    settings: {
      installedSourcesDescription: "你的漫画来自这些源。关闭一个源即可暂时停用。",
    },
  },
  ja: {
    settings: {
      installedSourcesDescription: "漫画を読み込むソースです。オフにすると一時的に使わなくなります。",
    },
  },
};

/** `catalog` with the design-explore copy for `language` laid over it (a new object; the catalog is not changed). */
export function withMobileDesignExploreCopy(catalog: MobileStrings, language: AppLanguage): MobileStrings {
  const overrides = MOBILE_DESIGN_EXPLORE_COPY[language];
  if (!overrides) return catalog;
  const next: Record<string, unknown> = { ...catalog };
  for (const [section, values] of Object.entries(overrides)) {
    next[section] = { ...(catalog as unknown as Record<string, object>)[section], ...values };
  }
  return next as MobileStrings;
}
