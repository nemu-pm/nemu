import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  componentsFromPodfileLock,
  mobileRoot,
  npmPackageOfExternalSource,
  packageDirOf,
  packageDirsFromSourceMap,
  parseNoticeHeaders,
  parsePodfileLock,
  renderNotices,
  repoRoot,
  sandboxPackageDirs,
  sortAndDedupe,
  THIRD_PARTY_PODS,
  type NoticeComponent,
} from "./thirdPartyNotices";
import { NOTICE_TEXT_FSL_1_1_MIT } from "./thirdPartyNoticeTexts";

const notices = readFileSync(path.join(mobileRoot, "THIRD_PARTY_NOTICES.txt"), "utf8");
const listed = parseNoticeHeaders(notices);
const listedNames = new Set(listed.map((entry) => entry.name));

function installedVersion(name: string): string | null {
  for (const base of [path.join(mobileRoot, "node_modules"), path.join(repoRoot, "node_modules")]) {
    const file = path.join(base, name, "package.json");
    if (existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
  }
  return null;
}

function isListed(name: string, version: string | null): boolean {
  return listed.some((entry) => entry.name === name && (version === null || entry.version === version));
}

describe("THIRD_PARTY_NOTICES.txt format", () => {
  test("opens with the title, then one block per component in alphabetical order", () => {
    const [title] = notices.split("\n");
    expect(title).toMatch(/^THIRD-PARTY SOFTWARE NOTICES - nemu \d+\.\d+\.\d+$/);
    const names = listed.map((entry) => `${entry.name.toLowerCase()} ${entry.version}`);
    expect(names).toEqual([...names].sort((a, b) => (a.split(" ")[0] === b.split(" ")[0] ? (a < b ? -1 : 1) : a.split(" ")[0]! < b.split(" ")[0]! ? -1 : 1)));
    expect(new Set(names).size).toBe(names.length);
  });

  test("every block has a URL, an SPDX license and a license text", () => {
    const rule = "=".repeat(80);
    const lines = notices.split("\n");
    let blocks = 0;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index] !== rule || lines[index + 4] !== rule) continue;
      blocks += 1;
      expect(lines[index + 2]).toMatch(/^https?:\/\/\S+$/);
      expect(lines[index + 3]).toMatch(/^License: [A-Za-z0-9.+-]+( (AND|OR) [A-Za-z0-9.+-]+)*$/);
      expect(lines[index + 5]!.trim().length).toBeGreaterThan(0);
      index += 4;
    }
    expect(blocks).toBe(listed.length);
    expect(blocks).toBeGreaterThan(100);
  });

  test("ends with a single newline and holds no CR or trailing spaces", () => {
    expect(notices.endsWith("\n")).toBe(true);
    expect(notices.endsWith("\n\n")).toBe(false);
    expect(notices).not.toContain("\r");
    expect(notices).not.toMatch(/[ \t]+$/m);
  });

  test("renderNotices prints the layout of the spec", () => {
    const component: NoticeComponent = {
      name: "left-pad",
      version: "1.3.0",
      url: "https://example.com/left-pad",
      license: "MIT",
      text: "Copyright (c) A\n\nPermission is hereby granted",
      source: "js",
    };
    const unversioned: NoticeComponent = { ...component, name: "Alpha", version: "", source: "font" };
    const rendered = renderNotices({ name: "nemu", version: "0.1.0" }, sortAndDedupe([component, unversioned, component]));
    const rule = "=".repeat(80);
    expect(rendered).toBe(
      [
        "THIRD-PARTY SOFTWARE NOTICES - nemu 0.1.0",
        "",
        [rule, "Alpha", "https://example.com/left-pad", "License: MIT", rule, component.text].join("\n"),
        "",
        [rule, "left-pad 1.3.0", "https://example.com/left-pad", "License: MIT", rule, component.text].join("\n"),
        "",
      ].join("\n"),
    );
    expect(parseNoticeHeaders(rendered)).toEqual([
      { name: "Alpha", version: "", license: "MIT" },
      { name: "left-pad", version: "1.3.0", license: "MIT" },
    ]);
  });
});

describe("what ships is listed", () => {
  test("every package the app source imports is listed at its installed version", () => {
    const specifiers = new Set<string>();
    const roots = ["app", "src", "modules", "index.ts"].map((entry) => path.join(mobileRoot, entry));
    const visit = (entry: string) => {
      const stat = statSync(entry);
      if (stat.isDirectory()) {
        const base = path.basename(entry);
        if (["node_modules", "ios", "android", "iosTest", "androidTest", "kotlinTest"].includes(base)) return;
        for (const child of readdirSync(entry)) visit(path.join(entry, child));
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) {
        const source = readFileSync(entry, "utf8").replace(/\bimport\s+type\s[^;]*?from\s+["'][^"']+["']/gs, "");
        for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"'./][^"']*)["']/g)) {
          specifiers.add(match[1]!);
        }
      }
    };
    for (const root of roots) if (existsSync(root)) visit(root);
    const packages = new Set<string>();
    for (const specifier of specifiers) {
      if (specifier.startsWith("node:") || specifier.startsWith("bun") || specifier.startsWith("@/") || specifier.startsWith("@nemu/")) continue;
      const parts = specifier.split("/");
      packages.add(specifier.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]!);
    }
    const missing: string[] = [];
    for (const name of packages) {
      const version = installedVersion(name);
      if (version === null) continue; // not a package (alias, builtin, platform module)
      if (!isListed(name, version)) missing.push(`${name} ${version}`);
    }
    expect(missing).toEqual([]);
  });

  test("every package in the Aidoku sandbox bundle is listed", () => {
    const missing: string[] = [];
    for (const dir of sandboxPackageDirs()) {
      const pkg = JSON.parse(readFileSync(path.join(repoRoot, dir, "package.json"), "utf8")) as { name: string; version: string };
      if (!pkg.name.startsWith("@nemu/") && !isListed(pkg.name, pkg.version)) missing.push(`${pkg.name} ${pkg.version}`);
    }
    expect(missing).toEqual([]);
  });

  test("the vendored analyzer, models, Skia and the bundled fonts are listed", () => {
    for (const name of ["ichiran-node", "ichiran-kernel", "Ichiran", "JMdict/EDICT", "KANJIDIC2", "JMdictDB conjugation tables", "Skia milestone"]) {
      expect(listedNames.has(name)).toBe(true);
    }
    expect(listedNames.has("manga-ocr-base and comic-text-and-bubble-detector Core ML conversions")).toBe(true);
    for (const file of readdirSync(path.join(mobileRoot, "assets/fonts")).filter((name) => name.endsWith("-LICENSE.txt"))) {
      const text = readFileSync(path.join(mobileRoot, "assets/fonts", file), "utf8").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
      expect(notices).toContain(text);
    }
    const ocrNotices = readFileSync(path.join(mobileRoot, "modules/nemu-japanese-learning/OCR-NOTICES.txt"), "utf8").replace(/[ \t]+$/gm, "").trim();
    expect(notices).toContain(ocrNotices);
  });

  test("ichiran-node's license is the vendored LICENSE, verbatim", () => {
    // ios/Vendor is generated by scripts/vendor-ichiran.sh (gitignored).
    const vendored = path.join(mobileRoot, "modules/nemu-japanese-learning/ios/Vendor/LICENSE-ichiran-node.md");
    if (existsSync(vendored)) {
      expect(NOTICE_TEXT_FSL_1_1_MIT).toBe(readFileSync(vendored, "utf8").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/^\n+|\n+$/g, ""));
    }
    expect(NOTICE_TEXT_FSL_1_1_MIT).toStartWith("# Functional Source License, Version 1.1, MIT Future License");
    expect(notices).toContain(NOTICE_TEXT_FSL_1_1_MIT);
  });

  const podfileLock = path.join(mobileRoot, "ios/Podfile.lock");
  // ios/ is generated by `expo prebuild` (gitignored): checked where it exists.
  test.skipIf(!existsSync(podfileLock))("every third-party pod and pod-linked package in Podfile.lock is listed", () => {
    const { pods, nativePackageDirs } = componentsFromPodfileLock(
      readFileSync(podfileLock, "utf8"),
      path.join(mobileRoot, "ios/Pods"),
    );
    expect(pods.length).toBeGreaterThan(0);
    for (const pod of pods) expect(isListed(pod.name, pod.version)).toBe(true);
    for (const dir of nativePackageDirs) {
      const pkg = JSON.parse(readFileSync(path.join(repoRoot, dir, "package.json"), "utf8")) as { name: string; version: string };
      expect(isListed(pkg.name, pkg.version)).toBe(true);
    }
  });
});

describe("collection helpers", () => {
  test("packageDirOf keeps the innermost package", () => {
    expect(packageDirOf("/node_modules/react-native/Libraries/x.js")).toBe("node_modules/react-native");
    expect(packageDirOf("/node_modules/@expo/ui/build/a.js")).toBe("node_modules/@expo/ui");
    expect(packageDirOf("/node_modules/better-auth/node_modules/zod/index.js")).toBe(
      "node_modules/better-auth/node_modules/zod",
    );
    expect(packageDirOf("/apps/mobile/src/index.ts")).toBeNull();
  });

  test("packageDirsFromSourceMap reads indexed source maps", () => {
    const map = JSON.stringify({
      version: 3,
      sections: [
        { map: { sources: ["__prelude__", "/node_modules/react/index.js", "/packages/core/src/index.ts"] } },
        { map: { sources: ["/node_modules/@expo/ui/a.js", "/node_modules/react/cjs/react.js"] } },
      ],
    });
    expect([...packageDirsFromSourceMap(map)].sort()).toEqual(["node_modules/@expo/ui", "node_modules/react"]);
  });

  test("parsePodfileLock separates trunk pods, third-party podspecs and npm packages", () => {
    const lock = [
      "PODS:",
      "  - boost (1.84.0)",
      "  - Expo (58.0.7):",
      "    - ExpoModulesCore",
      "  - React-Core/Default (0.88.0)",
      '  - "ExpoUI (58.0.15)"',
      "  - SocketRocket (0.7.1)",
      "",
      "DEPENDENCIES:",
      "  - boost",
      "",
      "SPEC REPOS:",
      "  trunk:",
      "    - SocketRocket",
      "",
      "EXTERNAL SOURCES:",
      "  boost:",
      '    :podspec: "../../../node_modules/react-native/third-party-podspecs/boost.podspec"',
      "  Expo:",
      '    :path: "../../../node_modules/expo"',
      "  ExpoUI:",
      '    :path: "../../../node_modules/@expo/ui/ios"',
      "",
      "SPEC CHECKSUMS:",
      "  boost: abc",
    ].join("\n");
    const parsed = parsePodfileLock(lock);
    expect(parsed.pods.map((pod) => `${pod.name} ${pod.version}`)).toEqual([
      "boost 1.84.0",
      "Expo 58.0.7",
      "React-Core 0.88.0",
      "ExpoUI 58.0.15",
      "SocketRocket 0.7.1",
    ]);
    expect([...parsed.trunk]).toEqual(["SocketRocket"]);
    expect(npmPackageOfExternalSource(parsed.external.get("ExpoUI")!)).toBe("@expo/ui");
    expect(npmPackageOfExternalSource(parsed.external.get("Expo")!)).toBe("expo");
    expect(Object.keys(THIRD_PARTY_PODS)).toContain("boost");
  });
});
