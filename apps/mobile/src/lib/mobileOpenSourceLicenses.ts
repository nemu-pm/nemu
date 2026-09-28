/**
 * Third-party notices shown in Settings → About nemu → Open-source licenses.
 *
 * Scope: what the app binary and the on-device dictionary pack redistribute —
 * the on-device Japanese analyzer and its dictionary data, the bundled brand
 * font, and the app's direct runtime dependencies (web-only packages and
 * nemu's own packages are left out). Names, license identifiers, copyright
 * lines and license texts are legal text and stay untranslated; only the
 * section headings are localized.
 */
import {
  MOBILE_LICENSE_TEXT_APACHE_2_0,
  MOBILE_LICENSE_TEXT_FSL_1_1_MIT,
  MOBILE_LICENSE_TEXT_GPL_2_0,
  MOBILE_LICENSE_TEXT_MIT_PERMISSION,
  MOBILE_LICENSE_TEXT_OFL_1_1,
} from "./mobileOpenSourceLicenseTexts";

export type MobileOpenSourceNoticeSection =
  | "japaneseAnalysis"
  | "fonts"
  | "software";

export type MobileOpenSourceNoticeLink = { label: string; url: string };

export type MobileOpenSourceNotice = {
  id: string;
  section: MobileOpenSourceNoticeSection;
  name: string;
  /** SPDX expression. */
  license: string;
  /** Attribution / copyright lines, shown verbatim above the license. */
  notice: string;
  links: MobileOpenSourceNoticeLink[];
  /** Full license text behind "Show license"; omitted when a link is the notice. */
  licenseText?: string;
  /** Only shown on this platform (a component bundled by one platform's build). */
  platform?: "ios" | "android";
};

/** Direct runtime dependencies under MIT: package → its LICENSE copyright line. */
export const MOBILE_OPEN_SOURCE_MIT_PACKAGES: ReadonlyArray<{
  name: string;
  copyright: string;
}> = [
  { name: "react", copyright: "Copyright (c) Meta Platforms, Inc. and affiliates." },
  { name: "react-native", copyright: "Copyright (c) Meta Platforms, Inc. and affiliates." },
  { name: "expo (and expo-* modules, expo-router, @expo/ui, @expo/material-symbols)", copyright: "Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)" },
  { name: "@expo/vector-icons", copyright: "Copyright (c) 2015 Joel Arvidsson" },
  { name: "react-native-gesture-handler", copyright: "Copyright (c) 2016 Software Mansion <swmansion.com>" },
  { name: "react-native-reanimated", copyright: "Copyright (c) 2016 Software Mansion <swmansion.com>" },
  { name: "react-native-screens", copyright: "Copyright (c) 2018 Software Mansion <swmansion.com>" },
  { name: "react-native-worklets", copyright: "Copyright (c) 2024 nobody" },
  { name: "react-native-safe-area-context", copyright: "Copyright (c) 2019 Th3rd Wave" },
  { name: "react-native-svg", copyright: "Copyright (c) [2015-2016] [Horcrux]" },
  { name: "@shopify/react-native-skia", copyright: "Copyright 2021-present, Shopify Inc." },
  { name: "@react-native-community/javascriptcore", copyright: "Copyright (c) 2018 react-native-community" },
  { name: "better-auth, @better-auth/expo", copyright: "Copyright (c) 2024 - present, Bereket Engida" },
  { name: "fflate", copyright: "Copyright (c) 2026 Arjun Barrett" },
  { name: "unorm", copyright: "Copyright (c) 2008-2013 Matsuza <matsuza@gmail.com>, Bjarke Walling <bwp@bwp.dk>" },
  { name: "whatwg-url-minimum", copyright: "Copyright (c) Phil Pluckthun, Copyright (c) 650 Industries, Inc. (aka Expo)" },
];

/** Direct runtime dependencies under Apache-2.0. */
export const MOBILE_OPEN_SOURCE_APACHE_PACKAGES: ReadonlyArray<{
  name: string;
  copyright: string;
}> = [
  { name: "convex", copyright: "Copyright 2025 Convex, Inc." },
  { name: "@convex-dev/better-auth", copyright: "Copyright 2025 Convex, Inc." },
];

const EDRDG_LICENCE_URL = "https://www.edrdg.org/edrdg/licence.html";
const CC_BY_SA_4_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

export const MOBILE_OPEN_SOURCE_NOTICES: readonly MobileOpenSourceNotice[] = [
  // Licensing of the vendored analyzer for redistribution in nemu is pending
  // confirmation with the author (Tiger Tang): the repository root is
  // FSL-1.1-MIT while packages/rust-kernel/Cargo.toml declares MIT. Both are
  // shown as published at ichiran-node@35dcfdc until that is confirmed.
  {
    id: "ichiran-node",
    section: "japaneseAnalysis",
    name: "ichiran-node (on-device analyzer, IchiranSwift)",
    license: "FSL-1.1-MIT",
    notice: "Copyright 2025 Tiger Tang",
    links: [{ label: "github.com/TigerHix/ichiran-node", url: "https://github.com/TigerHix/ichiran-node" }],
    licenseText: MOBILE_LICENSE_TEXT_FSL_1_1_MIT,
  },
  {
    id: "ichiran-kernel",
    section: "japaneseAnalysis",
    name: "ichiran-kernel (Rust analyzer kernel)",
    license: "MIT",
    notice: "Copyright 2025 Tiger Tang",
    links: [
      {
        label: "ichiran-node/packages/rust-kernel",
        url: "https://github.com/TigerHix/ichiran-node/tree/35dcfdccdb153b3c2528f75816dd2436809087cb/packages/rust-kernel",
      },
    ],
    licenseText: `Copyright 2025 Tiger Tang\n\n${MOBILE_LICENSE_TEXT_MIT_PERMISSION}`,
  },
  {
    id: "ichiran",
    section: "japaneseAnalysis",
    name: "Ichiran",
    license: "MIT",
    notice: "Copyright (c) 2014 Timofei Shatrov",
    links: [{ label: "github.com/tshatrov/ichiran", url: "https://github.com/tshatrov/ichiran" }],
    licenseText: `Copyright (c) 2014 Timofei Shatrov\n\n${MOBILE_LICENSE_TEXT_MIT_PERMISSION}`,
  },
  // EDRDG licence (www.edrdg.org/edrdg/licence.html, checked 2026-09-28):
  // JMdict/EDICT and KANJIDIC2 are CC BY-SA 4.0; software must acknowledge
  // the files' usage and source and link the licence and project pages.
  {
    id: "jmdict",
    section: "japaneseAnalysis",
    name: "JMdict/EDICT",
    license: "CC-BY-SA-4.0",
    notice:
      "This application uses the JMdict/EDICT and KANJIDIC dictionary files. These files are the property of the Electronic Dictionary Research and Development Group, and are used in conformance with the Group's licence.\n\nThe on-device dictionary is derived from JMdict and is available under the Creative Commons Attribution-ShareAlike 4.0 International licence.",
    links: [
      { label: "EDRDG licence", url: EDRDG_LICENCE_URL },
      { label: "JMdict/EDICT project", url: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project" },
      { label: "CC BY-SA 4.0", url: CC_BY_SA_4_URL },
    ],
  },
  {
    id: "kanjidic2",
    section: "japaneseAnalysis",
    name: "KANJIDIC2",
    license: "CC-BY-SA-4.0",
    notice:
      "Kanji readings from KANJIDIC2, the property of the Electronic Dictionary Research and Development Group, are used in conformance with the Group's licence to build the on-device dictionary.",
    links: [
      { label: "EDRDG licence", url: EDRDG_LICENCE_URL },
      { label: "KANJIDIC project", url: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" },
      { label: "CC BY-SA 4.0", url: CC_BY_SA_4_URL },
    ],
  },
  // Ichiran's conjugation tables (data/conj.csv, conjo.csv, kwpos.csv in
  // ichiran-node) come from JMdictDB, whose README states GPL-2.0-or-later
  // (not GPL-3.0) — verified against gitlab.com/yamagoya/jmdictdb.
  {
    id: "jmdictdb",
    section: "japaneseAnalysis",
    name: "JMdictDB conjugation tables",
    license: "GPL-2.0-or-later",
    notice:
      "Conjugation and part-of-speech tables from JMdictDB.\nCopyright Stuart McGraw. Licensed under the GNU General Public License version 2 or later.",
    links: [{ label: "gitlab.com/yamagoya/jmdictdb", url: "https://gitlab.com/yamagoya/jmdictdb" }],
    licenseText: MOBILE_LICENSE_TEXT_GPL_2_0,
  },
  {
    id: "noto-serif-jp",
    section: "fonts",
    name: "Noto Serif JP (nemu wordmark)",
    license: "OFL-1.1",
    notice: "Google Inc.",
    links: [{ label: "fonts.google.com/noto", url: "https://fonts.google.com/noto/specimen/Noto+Serif+JP" }],
    licenseText: MOBILE_LICENSE_TEXT_OFL_1_1,
  },
  {
    id: "mit-packages",
    section: "software",
    name: "React Native, Expo and other MIT-licensed packages",
    license: "MIT",
    notice: MOBILE_OPEN_SOURCE_MIT_PACKAGES.map(
      (item) => `${item.name}\n${item.copyright}`,
    ).join("\n\n"),
    links: [],
    licenseText: MOBILE_LICENSE_TEXT_MIT_PERMISSION,
  },
  {
    id: "apache-packages",
    section: "software",
    name: "Convex",
    license: "Apache-2.0",
    notice: MOBILE_OPEN_SOURCE_APACHE_PACKAGES.map(
      (item) => `${item.name}\n${item.copyright}`,
    ).join("\n\n"),
    links: [{ label: "github.com/get-convex/convex-js", url: "https://github.com/get-convex/convex-js" }],
    licenseText: MOBILE_LICENSE_TEXT_APACHE_2_0,
  },
  // Android builds bundle WebKit's JavaScriptCore through jsc-android.
  {
    id: "jsc-android",
    section: "software",
    name: "JavaScriptCore (WebKit, jsc-android)",
    license: "LGPL-2.0-or-later AND BSD-2-Clause",
    notice:
      "WebKit's JavaScriptCore is open source software with portions licensed under the LGPL and BSD licenses.",
    links: [
      { label: "WebKit licensing", url: "https://webkit.org/licensing-webkit/" },
      { label: "jsc-android-buildscripts", url: "https://github.com/react-native-community/jsc-android-buildscripts" },
    ],
    platform: "android",
  },
];

export const MOBILE_OPEN_SOURCE_NOTICE_SECTIONS: readonly MobileOpenSourceNoticeSection[] = [
  "japaneseAnalysis",
  "fonts",
  "software",
];

/** The notices a platform's build ships, grouped in display order. */
export function groupMobileOpenSourceNotices(
  platform: string,
  notices: readonly MobileOpenSourceNotice[] = MOBILE_OPEN_SOURCE_NOTICES,
): Array<{ section: MobileOpenSourceNoticeSection; notices: MobileOpenSourceNotice[] }> {
  return MOBILE_OPEN_SOURCE_NOTICE_SECTIONS.map((section) => ({
    section,
    notices: notices.filter(
      (notice) =>
        notice.section === section &&
        (!notice.platform || notice.platform === platform),
    ),
  })).filter((group) => group.notices.length > 0);
}
