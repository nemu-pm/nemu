#!/usr/bin/env bun
/**
 * Regenerates apps/mobile/THIRD_PARTY_NOTICES.txt from what the app ships:
 *
 *   - the modules of the release Metro bundles (iOS and Android, built with
 *     `expo export:embed` in production mode) and of the Aidoku sandbox bundle
 *   - the pods in ios/Podfile.lock (run `pod install` first)
 *   - the vendored analyzer, dictionary data, OCR models and Skia
 *   - the bundled fonts
 *
 * Usage: bun run notices [--maps <dir>] [--check]
 *   --maps <dir>  reuse <dir>/{ios,android}.map instead of bundling (the
 *                 maps `expo export:embed --sourcemap-output` writes)
 *   --check       write nothing; exit 1 when the committed file differs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  componentsFromPackageDirs,
  componentsFromPodfileLock,
  mobileRoot,
  packageDirsFromSourceMap,
  renderNotices,
  repoRoot,
  sandboxPackageDirs,
  sortAndDedupe,
  type NoticeComponent,
} from "./thirdPartyNotices";
import { fontComponents, vendoredComponents } from "./thirdPartyNoticeVendored";

export const NOTICES_PATH = path.join(mobileRoot, "THIRD_PARTY_NOTICES.txt");

function bundle(platform: "ios" | "android", outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // metro.config.js refuses a production bundle without a production
    // backend URL; the modules are the same whatever it is, so a placeholder
    // stands in when none is configured.
    const env = {
      EXPO_PUBLIC_CONVEX_URL: "https://notices.convex.cloud",
      EXPO_PUBLIC_CONVEX_SITE_URL: "https://notices.convex.site",
      ...process.env,
      NODE_ENV: "production",
    };
    const child = spawn(
      path.join(repoRoot, "node_modules/.bin/expo"),
      [
        "export:embed",
        "--platform", platform,
        "--dev", "false",
        "--minify", "false",
        "--entry-file", "index.ts",
        "--bundle-output", path.join(outDir, `${platform}.jsbundle`),
        "--sourcemap-output", path.join(outDir, `${platform}.map`),
        "--assets-dest", path.join(outDir, `assets-${platform}`),
      ],
      { cwd: mobileRoot, env, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`expo export:embed (${platform}) exited ${code}\n${stderr.slice(-2000)}`)),
    );
  });
}

async function metroPackageDirs(mapsDir: string | null): Promise<Set<string>> {
  let dir = mapsDir;
  const temporary = !dir;
  if (!dir) {
    dir = mkdtempSync(path.join(tmpdir(), "nemu-notices-"));
    mkdirSync(dir, { recursive: true });
    await Promise.all([bundle("ios", dir), bundle("android", dir)]);
  }
  try {
    const dirs = new Set<string>();
    for (const platform of ["ios", "android"]) {
      const file = path.join(dir, `${platform}.map`);
      if (!existsSync(file)) throw new Error(`${file} is missing`);
      for (const packageDir of packageDirsFromSourceMap(readFileSync(file, "utf8"))) dirs.add(packageDir);
    }
    return dirs;
  } finally {
    if (temporary) rmSync(dir, { recursive: true, force: true });
  }
}

export async function collectComponents(mapsDir: string | null): Promise<NoticeComponent[]> {
  const jsDirs = await metroPackageDirs(mapsDir);
  for (const dir of sandboxPackageDirs()) jsDirs.add(dir);

  const lockFile = path.join(mobileRoot, "ios/Podfile.lock");
  if (!existsSync(lockFile)) throw new Error("ios/Podfile.lock is missing: run `expo prebuild --platform ios` and `pod install`");
  const { pods, nativePackageDirs } = componentsFromPodfileLock(
    readFileSync(lockFile, "utf8"),
    path.join(mobileRoot, "ios/Pods"),
  );
  const nativeOnly = nativePackageDirs.filter((dir) => !jsDirs.has(dir));

  return sortAndDedupe([
    ...componentsFromPackageDirs(jsDirs, "js"),
    ...componentsFromPackageDirs(nativeOnly, "native"),
    ...pods,
    ...vendoredComponents(),
    ...fontComponents(),
  ]);
}

export function productOf(): { name: string; version: string } {
  const app = JSON.parse(readFileSync(path.join(mobileRoot, "app.json"), "utf8")) as {
    expo: { name: string; version: string };
  };
  return { name: app.expo.name, version: app.expo.version };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const mapsIndex = args.indexOf("--maps");
  const mapsDir = mapsIndex >= 0 ? path.resolve(args[mapsIndex + 1] ?? "") : null;
  const components = await collectComponents(mapsDir);
  const rendered = renderNotices(productOf(), components);
  if (args.includes("--check")) {
    const current = existsSync(NOTICES_PATH) ? readFileSync(NOTICES_PATH, "utf8") : "";
    if (current !== rendered) {
      console.error("THIRD_PARTY_NOTICES.txt is out of date: run `bun run notices` in apps/mobile.");
      process.exit(1);
    }
  } else {
    writeFileSync(NOTICES_PATH, rendered);
    const bySource = new Map<string, number>();
    for (const component of components) bySource.set(component.source, (bySource.get(component.source) ?? 0) + 1);
    console.log(`${components.length} components`, Object.fromEntries(bySource));
  }
}
