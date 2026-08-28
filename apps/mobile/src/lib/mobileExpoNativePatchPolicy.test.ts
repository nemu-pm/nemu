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

const patchedPackages = ["expo", "expo-background-task", "expo-sqlite"];

describe("mobile Expo native patch policy", () => {
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
      const patchPath = `patches/${packageName}@${version}.patch`;

      expect(mobilePackage.dependencies?.[packageName]).toBe(`~${version}`);
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

    expect(source).toContain(
      "providedJsRuntimeFactory: JSRuntimeFactory? = null",
    );
    expect(source).toContain(
      "providedJsRuntimeFactory ?: HermesInstance()",
    );
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
  });
});
