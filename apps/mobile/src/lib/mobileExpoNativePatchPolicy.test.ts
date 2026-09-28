import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "../../../..");
const rootPackage = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
) as { patchedDependencies?: Record<string, string> };
const mobilePackage = JSON.parse(
  readFileSync(
    path.join(repositoryRoot, "apps/mobile/package.json"),
    "utf8",
  ),
) as { dependencies?: Record<string, string> };

const patchedPackages = [
  "expo-background-task", "expo-sqlite", "expo-modules-jsi", "@expo/cli", "@expo/ui",
];

describe("mobile Expo native patch policy", () => {
  test("bounds the direct Android RNHost child to Material's sheet width", () => {
    const bottomSheet = readFileSync(path.join(repositoryRoot,
      "node_modules/@expo/ui/src/community/bottom-sheet/BottomSheet.android.tsx"), "utf8");
    // Bounding only the scaffold grandchild leaves a window-wide host centered
    // outside Material's 640dp sheet. The directly hosted Yoga root must match.
    expect(bottomSheet).toContain("const sheetWidth = Math.min(width, placementWidth, 640);");
    // Foldables: the sheet surface itself is narrowed and moved into one pane.
    expect(bottomSheet).toContain("modifiers={sheetModifiers}");
    expect(bottomSheet).toMatch(
      /<RNHostView matchContents=\{fitToContents\}>[\s\S]*?<View style=\{fitToContents \? \{ width: sheetWidth \}/,
    );
    expect(bottomSheet).toContain("<Host style={{ position: 'absolute', width }}");
    expect(bottomSheet).not.toContain("fitToContents ? { width } :");
    // The published conditional export defaults to build/, while expo-source
    // consumers use src/. Both entry paths must carry the same correction.
    const publishedBottomSheet = readFileSync(path.join(repositoryRoot,
      "node_modules/@expo/ui/build/community/bottom-sheet/BottomSheet.android.js"), "utf8");
    expect(publishedBottomSheet).toContain("const sheetWidth = Math.min(width, placementWidth, 640);");
    expect(publishedBottomSheet).toContain("modifiers: sheetModifiers,");
    expect(publishedBottomSheet).toMatch(
      /matchContents: fitToContents,[\s\S]*?style: fitToContents \? \{\s*width: sheetWidth/,
    );
  });
  test("keeps every version-exact repository patch attached", () => {
    for (const [dependency, patchPath] of Object.entries(
      rootPackage.patchedDependencies ?? {},
    )) {
      const match = dependency.match(/^(@[^/]+\/[^@]+|[^@]+)@(.+)$/);
      expect(match).not.toBeNull();
      const [, packageName, patchedVersion] = match!;
      const { version: installedVersion } = JSON.parse(
        readFileSync(
          path.join(
            repositoryRoot,
            "node_modules",
            packageName,
            "package.json",
          ),
          "utf8",
        ),
      ) as { version: string };

      expect(installedVersion).toBe(patchedVersion);
      expect(existsSync(path.join(repositoryRoot, patchPath))).toBe(true);
    }
  });

  test("keeps every critical patch attached to its installed Expo version", () => {
    for (const packageName of patchedPackages) {
      const packageRoot = path.join(repositoryRoot, "node_modules", packageName);
      const { version } = JSON.parse(
        readFileSync(path.join(packageRoot, "package.json"), "utf8"),
      ) as { version: string };
      const patchPath = `patches/${packageName.replace("/", "%2F")}@${version}.patch`;

      if (mobilePackage.dependencies?.[packageName] !== undefined) {
        expect(mobilePackage.dependencies[packageName]).toBe(`~${version}`);
      }
      expect(
        rootPackage.patchedDependencies?.[`${packageName}@${version}`],
      ).toBe(patchPath);
      expect(existsSync(path.join(repositoryRoot, patchPath))).toBe(true);
    }
  });

  test("preserves the supplied Android JSC runtime", () => {
    const source = readFileSync(
      path.join(
        repositoryRoot,
        "node_modules/expo/android/src/main/java/expo/modules/ExpoReactHostFactory.kt",
      ),
      "utf8",
    );

    // SDK 58 now exposes the supplied factory directly on its delegate.
    expect(source).toContain(
      "override val jsRuntimeFactory: JSRuntimeFactory = HermesInstance()",
    );
    expect(source).toContain(
      "jsRuntimeFactory = jsRuntimeFactory ?: HermesInstance()",
    );
    const pods = readFileSync(path.join(repositoryRoot,
      "node_modules/react-native/scripts/react_native_pods.rb"), "utf8");
    expect(pods).toMatch(/hermes_enabled\s*=\s*!use_third_party_jsc\(\)/);
  });

  test("keeps Expo export and standalone native execution on JSC", () => {
    const exportHermes = readFileSync(
      path.join(
        repositoryRoot,
        "node_modules/@expo/cli/build/src/export/exportHermes.js",
      ),
      "utf8",
    );
    const runtime = readFileSync(
      path.join(
        repositoryRoot,
        "node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/JSIUtils.cpp",
      ),
      "utf8",
    );

    expect(exportHermes).toContain("expoConfig.extra");
    expect(exportHermes).toContain("nemuJsEngine");
    expect(runtime).toContain("facebook::jsc::makeJSCRuntime()");
    expect(runtime).not.toContain("facebook::hermes::makeHermesRuntime()");
  });

  test("selects active background work instead of a historical predecessor", () => {
    const source = readFileSync(
      path.join(
        repositoryRoot,
        "node_modules/expo-background-task/android/src/main/java/expo/modules/backgroundtask/BackgroundTaskScheduler.kt",
      ),
      "utf8",
    );

    expect(source).toContain(
      "it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED",
    );
  });

  test("builds the patched SQLite sources with deferred native lifetimes", () => {
    const sqliteRoot = path.join(repositoryRoot, "node_modules/expo-sqlite");
    const publicationPolicy = readFileSync(
      path.join(sqliteRoot, "android/shouldUsePublication.groovy"),
      "utf8",
    );
    const databaseBinding = readFileSync(
      path.join(
        sqliteRoot,
        "android/src/main/cpp/NativeDatabaseBinding.cpp",
      ),
      "utf8",
    );
    const statementBinding = readFileSync(
      path.join(sqliteRoot, "android/src/main/cpp/NativeStatementBinding.h"),
      "utf8",
    );

    expect(publicationPolicy.trim().endsWith("false")).toBe(true);
    expect(databaseBinding).toContain("::exsqlite3_close_v2(db)");
    expect(statementBinding).toContain("std::mutex mutex_");
    const sqliteModule = readFileSync(path.join(sqliteRoot,
      "android/src/main/java/expo/modules/sqlite/SQLiteModule.kt"), "utf8");
    const closeDatabase = sqliteModule.slice(sqliteModule.indexOf("private fun closeDatabase("),
      sqliteModule.indexOf("private fun deleteDatabase("));
    // Keep SDK 58's concurrent-close guard when rebasing lifecycle fixes.
    expect(closeDatabase).toContain("database.closeLock.lock()");
    expect(closeDatabase).toContain("database.closeLock.unlock()");
    expect(closeDatabase).not.toContain("maybeFinalizeAllStatements(database)");
  });
});
