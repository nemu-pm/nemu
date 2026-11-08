/**
 * Components the app ships that no package manager lists: the on-device
 * Japanese analyzer and its dictionary data (modules/nemu-japanese-learning/
 * scripts/vendor-ichiran.sh), the OCR models, the prebuilt Skia libraries
 * and the bundled fonts. Copyright lines are as the upstream files state them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot, mobileRoot, normalizeText, type NoticeComponent } from "./thirdPartyNotices";
import {
  NOTICE_TEXT_CC_BY_SA_4_0,
  NOTICE_TEXT_FSL_1_1_MIT,
  NOTICE_TEXT_GPL_2_0,
  NOTICE_TEXT_MIT_PERMISSION,
} from "./thirdPartyNoticeTexts";

const ICHIRAN_NODE_COMMIT = "35dcfdc";
const EDRDG_LICENCE_URL = "https://www.edrdg.org/edrdg/licence.html";

function readFile(file: string): string {
  return normalizeText(readFileSync(file, "utf8"));
}

function vendored(component: Omit<NoticeComponent, "source">): NoticeComponent {
  return { ...component, source: "vendored" };
}

/** Skia's license ships with canvaskit-wasm as `//` comment lines. */
function skiaLicense(): string {
  const text = readFile(path.join(repoRoot, "node_modules/canvaskit-wasm/LICENSE"));
  return text
    .split("\n")
    .map((line) => line.replace(/^\/\/ ?/, ""))
    .join("\n");
}

function skiaMilestone(): string {
  const header = readFileSync(
    path.join(repoRoot, "node_modules/@shopify/react-native-skia/cpp/skia/include/core/SkMilestone.h"),
    "utf8",
  );
  const milestone = header.match(/#define SK_MILESTONE (\d+)/)?.[1];
  if (!milestone) throw new Error("SkMilestone.h has no SK_MILESTONE");
  return milestone;
}

function jscAndroidVersion(): string {
  const gradle = readFileSync(
    path.join(repoRoot, "node_modules/@react-native-community/javascriptcore/android/build.gradle.kts"),
    "utf8",
  );
  const version = gradle.match(/io\.github\.react-native-community:jsc-android:([^"]+)"/)?.[1];
  if (!version) throw new Error("javascriptcore build.gradle.kts names no jsc-android version");
  return version;
}

export function vendoredComponents(): NoticeComponent[] {
  return [
    vendored({
      name: "ichiran-node",
      version: ICHIRAN_NODE_COMMIT,
      url: "https://github.com/TigerHix/ichiran-node",
      license: "FSL-1.1-MIT",
      text: NOTICE_TEXT_FSL_1_1_MIT,
    }),
    vendored({
      name: "ichiran-kernel",
      version: ICHIRAN_NODE_COMMIT,
      url: "https://github.com/TigerHix/ichiran-node/tree/35dcfdccdb153b3c2528f75816dd2436809087cb/packages/rust-kernel",
      license: "MIT",
      text: `Copyright 2025 Tiger Tang\n\n${NOTICE_TEXT_MIT_PERMISSION}`,
    }),
    vendored({
      name: "Ichiran",
      version: "",
      url: "https://github.com/tshatrov/ichiran",
      license: "MIT",
      text: `Copyright (c) 2014 Timofei Shatrov\n\n${NOTICE_TEXT_MIT_PERMISSION}`,
    }),
    vendored({
      name: "JMdict/EDICT",
      version: "",
      url: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
      license: "CC-BY-SA-4.0",
      text: [
        "This application uses the JMdict/EDICT and KANJIDIC dictionary files. These files are the property of the Electronic Dictionary Research and Development Group, and are used in conformance with the Group's licence.",
        EDRDG_LICENCE_URL,
        NOTICE_TEXT_CC_BY_SA_4_0,
      ].join("\n\n"),
    }),
    vendored({
      name: "JMdictDB conjugation tables",
      version: "",
      url: "https://gitlab.com/yamagoya/jmdictdb",
      license: "GPL-2.0-or-later",
      text: `Copyright Stuart McGraw.\n\n${normalizeText(NOTICE_TEXT_GPL_2_0)}`,
    }),
    vendored({
      name: "KANJIDIC2",
      version: "",
      url: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project",
      license: "CC-BY-SA-4.0",
      text: [
        "Kanji readings from KANJIDIC2, the property of the Electronic Dictionary Research and Development Group, are used in conformance with the Group's licence.",
        EDRDG_LICENCE_URL,
        NOTICE_TEXT_CC_BY_SA_4_0,
      ].join("\n\n"),
    }),
    vendored({
      name: "manga-ocr-base and comic-text-and-bubble-detector Core ML conversions",
      version: "",
      url: "https://huggingface.co/nemu-pm/nemu-ocr-coreml",
      license: "Apache-2.0",
      text: readFile(path.join(mobileRoot, "modules/nemu-japanese-learning/OCR-NOTICES.txt")),
    }),
    vendored({
      name: "Skia milestone",
      version: skiaMilestone(),
      url: "https://skia.org",
      license: "BSD-3-Clause",
      text: skiaLicense(),
    }),
    // Linked by the Android build only (Gradle dependency of
    // @react-native-community/javascriptcore).
    vendored({
      name: "jsc-android",
      version: jscAndroidVersion(),
      url: "https://github.com/react-native-community/jsc-android-buildscripts",
      license: "LGPL-2.0-or-later AND BSD-2-Clause",
      text: "WebKit's JavaScriptCore is open source software with portions licensed under the LGPL and BSD licenses.\nhttps://webkit.org/licensing-webkit/",
    }),
  ];
}

const FONT_GROUPS: Array<{ name: string; url: string; license: string; licenseFile: string }> = [
  { name: "NemuBrand (Noto Serif JP)", url: "https://fonts.google.com/noto/specimen/Noto+Serif+JP", license: "OFL-1.1", licenseFile: "NemuBrand-LICENSE.txt" },
  { name: "NemuInter (Inter)", url: "https://github.com/rsms/inter", license: "OFL-1.1", licenseFile: "NemuInter-LICENSE.txt" },
  { name: "NemuSerifJP (Noto Serif JP)", url: "https://fonts.google.com/noto/specimen/Noto+Serif+JP", license: "OFL-1.1", licenseFile: "NemuSerifJP-LICENSE.txt" },
];

/** The bundled fonts: one component per assets/fonts/*-LICENSE.txt. */
export function fontComponents(): NoticeComponent[] {
  return FONT_GROUPS.map((font) => ({
    name: font.name,
    version: "",
    url: font.url,
    license: font.license,
    text: readFile(path.join(mobileRoot, "assets/fonts", font.licenseFile)),
    source: "font" as const,
  }));
}
