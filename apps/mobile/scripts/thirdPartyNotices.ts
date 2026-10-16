/**
 * Collects the third-party components the app ships and renders
 * THIRD_PARTY_NOTICES.txt. Sources:
 *
 *   js        npm packages whose modules are in the release Metro bundles
 *             (iOS and Android source maps) or the Aidoku sandbox bundle
 *   native    npm packages linked through a CocoaPods external source
 *   pod       third-party pods in ios/Podfile.lock
 *   vendored  the on-device analyzer, dictionary data and OCR models
 *   font      the bundled font files
 *
 * Everything is read from the installed packages: names, versions, homepages,
 * SPDX identifiers, copyright lines and license texts are not hand-written
 * (the vendored and font entries carry their texts as committed files).
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NOTICE_TEXT_ISC_PERMISSION, NOTICE_TEXT_MIT_PERMISSION } from "./thirdPartyNoticeTexts";

export type NoticeSource = "js" | "native" | "pod" | "vendored" | "font";

export type NoticeComponent = {
  name: string;
  /** Empty when the component has no version of its own (fonts, data). */
  version: string;
  url: string;
  /** SPDX identifier or expression. */
  license: string;
  /** Copyright lines, license text and NOTICE text, verbatim. */
  text: string;
  source: NoticeSource;
};

export const repoRoot = path.resolve(import.meta.dir, "../../..");
export const mobileRoot = path.resolve(import.meta.dir, "..");

const RULE = "=".repeat(80);

type PackageJson = {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: Array<{ type?: string }>;
  homepage?: string;
  repository?: string | { url?: string };
  author?: string | { name?: string };
};

export function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\n+|\n+$/g, "");
}

function readText(file: string): string {
  return normalizeText(readFileSync(file, "utf8"));
}

/** `node_modules/<pkg>` directories (repo-relative) that a module path lives in. */
export function packageDirOf(modulePath: string): string | null {
  const normalized = modulePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const marker = normalized.lastIndexOf("node_modules/");
  if (marker < 0) return null;
  const rest = normalized.slice(marker + "node_modules/".length).split("/");
  const name = rest[0]?.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  if (!name) return null;
  return `${normalized.slice(0, marker)}node_modules/${name}`;
}

/** Package directories behind the modules of Metro `--sourcemap-output` files. */
export function packageDirsFromSourceMap(sourceMapJson: string): Set<string> {
  const map = JSON.parse(sourceMapJson) as {
    sources?: string[];
    sections?: Array<{ map: { sources: string[] } }>;
  };
  const sources = map.sections ? map.sections.flatMap((section) => section.map.sources) : (map.sources ?? []);
  const dirs = new Set<string>();
  for (const source of sources) {
    const dir = packageDirOf(source);
    if (dir) dirs.add(dir);
  }
  return dirs;
}

/**
 * Packages inlined into the Aidoku sandbox bundle, from the metafile of the
 * esbuild run scripts/build-mobile-aidoku-sandbox.ts makes.
 */
export function sandboxPackageDirs(): Set<string> {
  const directory = mkdtempSync(path.join(tmpdir(), "nemu-notices-sandbox-"));
  const metafile = path.join(directory, "meta.json");
  try {
    const result = Bun.spawnSync({
      cmd: [
        path.join(repoRoot, "node_modules/.bin/esbuild"),
        path.join(mobileRoot, "modules/nemu-aidoku/runtime/aidokuSandboxRuntime.ts"),
        "--bundle",
        "--platform=browser",
        "--format=iife",
        "--target=chrome120",
        "--log-level=silent",
        `--metafile=${metafile}`,
        `--outfile=${path.join(directory, "sandbox.js")}`,
      ],
      cwd: mobileRoot,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
    if (!result.success) throw new Error(`esbuild failed for the Aidoku sandbox bundle\n${result.stderr.toString()}`);
    const meta = JSON.parse(readFileSync(metafile, "utf8")) as { inputs: Record<string, unknown> };
    const dirs = new Set<string>();
    for (const input of Object.keys(meta.inputs)) {
      const dir = packageDirOf(path.resolve(mobileRoot, input).slice(repoRoot.length));
      if (dir) dirs.add(dir);
    }
    return dirs;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function readPackageJson(dir: string): PackageJson {
  return JSON.parse(readFileSync(path.join(repoRoot, dir, "package.json"), "utf8")) as PackageJson;
}

function declaredLicense(pkg: PackageJson): string {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  const first = pkg.licenses?.[0]?.type;
  if (first) return first;
  throw new Error(`${pkg.name}: package.json declares no license`);
}

/** SPDX form of the license strings packages write in the old npm style. */
function toSpdx(license: string): string {
  return license.replace(/\s+or\s+/gi, " OR ");
}

function repositoryUrl(pkg: PackageJson): string | null {
  const raw = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (!raw) return null;
  const github = raw.match(/^(?:github:)?([\w.-]+\/[\w.-]+)$/);
  if (github) return `https://github.com/${github[1]}`;
  return raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/\.git$/, "");
}

function homepageOf(pkg: PackageJson): string {
  return pkg.homepage?.replace(/#readme$/, "") ?? repositoryUrl(pkg) ?? `https://www.npmjs.com/package/${pkg.name}`;
}

const LICENSE_FILE = /^(licen[cs]e|copying|unlicen[cs]e)(?![a-z])/i;
const NOTICE_FILE = /^notice(?![a-z])/i;

function filesMatching(dir: string, pattern: RegExp): string[] {
  const full = path.join(repoRoot, dir);
  return readdirSync(full)
    .filter((file) => pattern.test(file) && statSync(path.join(full, file)).isFile())
    .sort();
}

/**
 * Packages published from a monorepo without their own license file: the
 * license of the package that is published from the same repository.
 */
const LICENSE_FROM: Array<{ match: RegExp; from: string }> = [
  { match: /^@react-native\//, from: "node_modules/react-native" },
  { match: /^metro-runtime$/, from: "node_modules/react-native" },
  { match: /^(expo-router|@expo\/ui)$/, from: "node_modules/expo" },
  { match: /^@better-auth\/utils$/, from: "node_modules/better-auth" },
];

/** License files a package keeps outside its root (vendored upstream trees). */
const EXTRA_LICENSE_FILES: Record<string, string[]> = {
  "@expo/vector-icons": ["build/vendor/react-native-vector-icons/LICENSE"],
};

/** A README section (`## License`, `#### LICENSE`) up to the next heading. */
function readmeLicenseSection(dir: string): string | null {
  const readme = readdirSync(path.join(repoRoot, dir)).find((file) => /^readme(\.md)?$/i.test(file));
  if (!readme) return null;
  const lines = readText(path.join(repoRoot, dir, readme)).split("\n");
  const start = lines.findIndex((line) => /^#{1,6}\s*licen[cs]e\s*$/i.test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6}\s/.test(line));
  const body = normalizeText((end < 0 ? rest : rest.slice(0, end)).join("\n"));
  return body || null;
}

const PERMISSION_NOTICES: Record<string, string> = {
  MIT: NOTICE_TEXT_MIT_PERMISSION,
  ISC: NOTICE_TEXT_ISC_PERMISSION,
};

function licenseTextFor(dir: string, pkg: PackageJson): string {
  const own = filesMatching(dir, LICENSE_FILE);
  const notices = filesMatching(dir, NOTICE_FILE);
  const parts: string[] = [];
  let licenseDir = dir;
  let licenseFiles = own;
  if (!own.length) {
    const borrowed = LICENSE_FROM.find((entry) => entry.match.test(pkg.name ?? ""));
    if (borrowed) {
      licenseDir = borrowed.from;
      licenseFiles = filesMatching(borrowed.from, LICENSE_FILE);
    }
  }
  for (const file of licenseFiles) parts.push(readText(path.join(repoRoot, licenseDir, file)));
  if (!parts.length) {
    const section = readmeLicenseSection(dir);
    const author = typeof pkg.author === "string" ? pkg.author.replace(/\s*<[^>]*>/, "") : pkg.author?.name;
    if (section) parts.push(section);
    // MIT and ISC packages that ship no license text at all: the SPDX
    // permission notice under the author named in package.json.
    else if (author && declaredLicense(pkg) in PERMISSION_NOTICES) {
      parts.push(`Copyright (c) ${author}\n\n${PERMISSION_NOTICES[declaredLicense(pkg)]}`);
    }
    else throw new Error(`${pkg.name}: no license text found in ${dir}`);
  }
  for (const extra of EXTRA_LICENSE_FILES[pkg.name ?? ""] ?? []) {
    parts.push(readText(path.join(repoRoot, dir, extra)));
  }
  for (const file of notices) parts.push(readText(path.join(repoRoot, dir, file)));
  return parts.join("\n\n");
}

export function componentFromPackageDir(dir: string, source: NoticeSource): NoticeComponent {
  const pkg = readPackageJson(dir);
  if (!pkg.name || !pkg.version) throw new Error(`${dir}: package.json has no name or version`);
  return {
    name: pkg.name,
    version: pkg.version,
    url: homepageOf(pkg),
    license: toSpdx(declaredLicense(pkg)),
    text: licenseTextFor(dir, pkg),
    source,
  };
}

/** Workspace packages and nemu's own modules are not third-party. */
function isFirstParty(pkg: PackageJson): boolean {
  return pkg.name === "nemu" || pkg.name?.startsWith("@nemu/") === true;
}

export function componentsFromPackageDirs(dirs: Iterable<string>, source: NoticeSource): NoticeComponent[] {
  const components: NoticeComponent[] = [];
  for (const dir of dirs) {
    if (isFirstParty(readPackageJson(dir))) continue;
    components.push(componentFromPackageDir(dir, source));
  }
  return components;
}

export type PodfileLock = {
  pods: Array<{ name: string; version: string }>;
  /** External sources by pod name: the `:path` or `:podspec` value. */
  external: Map<string, string>;
  /** Pods fetched from the CocoaPods trunk. */
  trunk: Set<string>;
};

export function parsePodfileLock(lock: string): PodfileLock {
  const section = (title: string): string[] => {
    const lines = lock.split("\n");
    const start = lines.findIndex((line) => line === `${title}:`);
    if (start < 0) return [];
    const end = lines.findIndex((line, index) => index > start && /^\S/.test(line));
    return lines.slice(start + 1, end < 0 ? undefined : end);
  };
  const pods = new Map<string, string>();
  for (const line of section("PODS")) {
    const match = line.match(/^ {2}- "?([^ "(/]+)(?:\/[^ "(]+)? \(([^)]+)\)/);
    if (match && !pods.has(match[1])) pods.set(match[1], match[2]);
  }
  const external = new Map<string, string>();
  let current = "";
  for (const line of section("EXTERNAL SOURCES")) {
    const name = line.match(/^ {2}"?([^":]+)"?:$/);
    if (name) current = name[1];
    const value = line.match(/^ {4}:(?:path|podspec): "?([^"]+)"?$/);
    if (value && current) external.set(current, value[1]);
  }
  const trunk = new Set<string>();
  let inTrunk = false;
  for (const line of section("SPEC REPOS")) {
    if (/^ {2}\S/.test(line)) inTrunk = line.trim() === "trunk:";
    else if (inTrunk) {
      const name = line.match(/^ {4}- (\S+)/);
      if (name) trunk.add(name[1]);
    }
  }
  return {
    pods: [...pods].map(([name, version]) => ({ name, version })),
    external,
    trunk,
  };
}

/**
 * Third-party pods. The pods' own source trees carry the license files; the
 * homepage and SPDX identifier below come from each pod's license file and
 * upstream repository (the podspecs name them inconsistently).
 */
export const THIRD_PARTY_PODS: Record<string, { url: string; license: string; files: string[] }> = {
  boost: { url: "https://www.boost.org", license: "BSL-1.0", files: ["LICENSE_1_0.txt"] },
  DoubleConversion: { url: "https://github.com/google/double-conversion", license: "BSD-3-Clause", files: ["LICENSE"] },
  fast_float: { url: "https://github.com/fastfloat/fast_float", license: "Apache-2.0", files: ["LICENSE-APACHE"] },
  fmt: { url: "https://github.com/fmtlib/fmt", license: "MIT", files: ["LICENSE"] },
  glog: { url: "https://github.com/google/glog", license: "BSD-3-Clause", files: ["COPYING"] },
  "hermes-engine": { url: "https://github.com/facebook/hermes", license: "MIT", files: ["LICENSE"] },
  "RCT-Folly": { url: "https://github.com/facebook/folly", license: "Apache-2.0", files: ["LICENSE"] },
  SocketRocket: { url: "https://github.com/facebookincubator/SocketRocket", license: "BSD-3-Clause", files: ["LICENSE"] },
};

/** The npm package a pod's `:path` / `:podspec` external source lives in, if any. */
export function npmPackageOfExternalSource(value: string): string | null {
  const dir = packageDirOf(value);
  return dir ? dir.slice(dir.lastIndexOf("node_modules/") + "node_modules/".length) : null;
}

export type PodComponents = { pods: NoticeComponent[]; nativePackageDirs: string[] };

export function componentsFromPodfileLock(lockText: string, podsDir: string): PodComponents {
  const lock = parsePodfileLock(lockText);
  const pods: NoticeComponent[] = [];
  const nativePackageDirs = new Set<string>();
  for (const { name, version } of lock.pods) {
    const external = lock.external.get(name);
    const npmPackage = external ? npmPackageOfExternalSource(external) : null;
    if (external && npmPackage && !external.includes("third-party-podspecs") && name !== "hermes-engine") {
      nativePackageDirs.add(`node_modules/${npmPackage}`);
      continue;
    }
    if (external && !external.includes("node_modules")) continue; // nemu's own modules
    const known = THIRD_PARTY_PODS[name];
    if (!known) {
      throw new Error(
        `Podfile.lock lists the pod "${name}" with no license metadata: add it to THIRD_PARTY_PODS in scripts/thirdPartyNotices.ts`,
      );
    }
    const text = known.files
      .map((file) => {
        const source = path.join(podsDir, name, file);
        if (!existsSync(source)) throw new Error(`${source} is missing: run pod install in apps/mobile/ios`);
        return readText(source);
      })
      .join("\n\n");
    pods.push({ name, version, url: known.url, license: known.license, text, source: "pod" });
  }
  return { pods, nativePackageDirs: [...nativePackageDirs] };
}

function compareComponents(a: NoticeComponent, b: NoticeComponent): number {
  const left = a.name.toLowerCase();
  const right = b.name.toLowerCase();
  if (left !== right) return left < right ? -1 : 1;
  return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
}

/** One entry per name and version, alphabetical. */
export function sortAndDedupe(components: NoticeComponent[]): NoticeComponent[] {
  const byKey = new Map<string, NoticeComponent>();
  for (const component of components) {
    const key = `${component.name}\u0000${component.version}`;
    if (!byKey.has(key)) byKey.set(key, component);
  }
  return [...byKey.values()].sort(compareComponents);
}

export function renderNotices(product: { name: string; version: string }, components: NoticeComponent[]): string {
  const blocks = components.map((component) =>
    [
      RULE,
      component.version ? `${component.name} ${component.version}` : component.name,
      component.url,
      `License: ${component.license}`,
      RULE,
      component.text,
    ].join("\n"),
  );
  return `THIRD-PARTY SOFTWARE NOTICES - ${product.name} ${product.version}\n\n${blocks.join("\n\n")}\n`;
}

/** Component headers of a rendered file: `name version` lines in order. */
export function parseNoticeHeaders(rendered: string): Array<{ name: string; version: string; license: string }> {
  const headers: Array<{ name: string; version: string; license: string }> = [];
  const lines = rendered.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== RULE || lines[index + 4] !== RULE) continue;
    const title = lines[index + 1];
    const split = title.lastIndexOf(" ");
    const hasVersion = split > 0 && /^\d/.test(title.slice(split + 1));
    headers.push({
      name: hasVersion ? title.slice(0, split) : title,
      version: hasVersion ? title.slice(split + 1) : "",
      license: lines[index + 3].replace(/^License: /, ""),
    });
    index += 4;
  }
  return headers;
}
