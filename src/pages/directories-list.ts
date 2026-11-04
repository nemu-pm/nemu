/**
 * Source directories listed on the public /directories page. Edit this list
 * to add or remove one; the page needs no other change.
 *
 * Inclusion rule: the publisher offers an Aidoku add link for the directory
 * themselves (or asked to be listed). Remove an entry on the publisher's or a
 * rights holder's request. Descriptions stay neutral: who publishes it and in
 * which languages, never what the sources contain.
 *
 * Before adding an entry, check that `indexUrl` serves an Aidoku
 * `index.min.json` (an object with `sources`, or the older bare array) over
 * HTTPS.
 */

export type DirectoryLanguage = "en" | "zh";

export interface ListedSourceDirectory {
  /** Stable key for React and tests. */
  id: string;
  name: string;
  /** The name where it differs by language (as the app shows it). */
  localizedName?: Partial<Record<DirectoryLanguage, string>>;
  publisher: string;
  /** The publisher's own page (repository or site), never a content page. */
  publisherUrl: string;
  /** Source languages as ISO 639-1 codes, or `multi` for many. */
  languages: string[];
  description: Record<DirectoryLanguage, string>;
  /** HTTPS address of the directory's `index.min.json`. */
  indexUrl: string;
  /** Shipped inside nemu already: shown without an Add button. */
  builtIn?: boolean;
}

export const LISTED_SOURCE_DIRECTORIES: readonly ListedSourceDirectory[] = [
  {
    id: "nemu-recommended",
    name: "nemu recommended",
    localizedName: { zh: "nemu 推荐" },
    publisher: "nemu",
    publisherUrl: "https://github.com/nemu-pm/source-registry",
    languages: ["multi"],
    description: {
      en: "Works their rights holders publish under a free licence, and sources that connect to a server you run.",
      zh: "仅含权利人以自由许可发布的作品，以及连接到你自己服务器的来源。",
    },
    indexUrl: "https://nemu-pm.github.io/source-registry/index.min.json",
    builtIn: true,
  },
  {
    id: "aidoku-community",
    name: "Aidoku Community Sources",
    publisher: "Aidoku Community",
    publisherUrl: "https://github.com/Aidoku-Community/sources",
    languages: ["multi"],
    description: {
      en: "Community-maintained sources for Aidoku, in many languages.",
      zh: "由社区维护的 Aidoku 来源，涵盖多种语言。",
    },
    indexUrl: "https://aidoku-community.github.io/sources/index.min.json",
  },
  {
    id: "aidoku-new-zh-sources",
    name: "Aidoku ZH Sources",
    publisher: "0BlueYan0",
    publisherUrl: "https://github.com/0BlueYan0/aidoku-new-zh-sources",
    languages: ["zh"],
    description: {
      en: "Chinese-language sources, built for current versions of Aidoku.",
      zh: "中文来源，适用于新版 Aidoku。",
    },
    indexUrl: "https://cdn.jsdelivr.net/gh/0BlueYan0/aidoku-new-zh-sources@gh-pages/index.min.json",
  },
  {
    id: "aidoku-zh-sources",
    name: "Aidoku ZH",
    publisher: "suiyuran",
    publisherUrl: "https://github.com/suiyuran/aidoku-zh-sources",
    languages: ["zh"],
    description: {
      en: "Chinese-language sources, in Aidoku's earlier list format.",
      zh: "中文来源，采用 Aidoku 早期的列表格式。",
    },
    indexUrl: "https://raw.githubusercontent.com/suiyuran/aidoku-zh-sources/main/public/index.min.json",
  },
];

/** The one-tap link nemu handles: `nemu://addSourceList?url=<encoded address>`. */
export function nemuAddDirectoryLink(indexUrl: string): string {
  return `nemu://addSourceList?url=${encodeURIComponent(indexUrl)}`;
}
