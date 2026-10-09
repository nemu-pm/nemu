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
  "expo-background-task", "expo-modules-jsi", "@expo/cli", "@expo/ui",
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
  test("renders iOS sheet content 1:1 inside the floating sheet's scale", () => {
    // iOS 26+ floats a partial-detent sheet by drawing it scaled (~0.96 on a
    // 402pt iPhone); the host lays the content out at the shown size and
    // undoes that scale, for detent and content-sized sheets alike.
    const hostView = readFileSync(path.join(repositoryRoot,
      "node_modules/@expo/ui/ios/RNHostView.swift"), "utf8");
    expect(hostView).toContain("@Field var compensatesPresentationScale: Bool = false");
    expect(hostView).toContain("var onPresentationScaleChange = EventDispatcher()");
    expect(hostView).toContain(".scaleEffect(1 / scale, anchor: .topLeading)");
    expect(hostView).toContain("convert(bounds, to: window).width / bounds.width");
    for (const [file, pattern] of [
      ["src/community/bottom-sheet/BottomSheet.ios.tsx", /compensatesPresentationScale\s*\n\s*onPresentationScaleChange=\{handlePresentationScaleChange\}/],
      ["build/community/bottom-sheet/BottomSheet.ios.js", /compensatesPresentationScale: true,\s*\n\s*onPresentationScaleChange: handlePresentationScaleChange,/],
    ] as const) {
      const bottomSheet = readFileSync(
        path.join(repositoryRoot, "node_modules/@expo/ui", file), "utf8");
      expect(bottomSheet).toMatch(pattern);
      // A content-sized sheet's Yoga width is the shown width too.
      expect(bottomSheet).toMatch(/: windowWidth\)\s*\*\s*presentationScale;/);
    }
  });
  test("sizes a content-sized iOS sheet from the probe's local width, not its scaled global frame", () => {
    // The width probe's global frame already carries the floating scale once
    // SwiftUI re-evaluates geometry (404 instead of 420 on a 420pt iPhone);
    // multiplied by the presentation scale again it left the content 388.7pt
    // wide, centred in a 404pt sheet, with the bare sheet showing either
    // side of the veil. The probe's own layout size has no transform in it.
    const modifier = readFileSync(path.join(repositoryRoot,
      "node_modules/@expo/ui/ios/Modifiers/OnGeometryChangeModifier.swift"), "utf8");
    expect(modifier).toContain("Geometry(frame: proxy.frame(in: .global), localSize: proxy.size)");
    expect(modifier).toContain('"localWidth": geometry.localSize.width');
    expect(modifier).toContain('"localHeight": geometry.localSize.height');
    // The global fields keep their meaning for the modifier's other users.
    expect(modifier).toContain('"width": geometry.frame.size.width');
    for (const file of [
      "src/community/bottom-sheet/BottomSheet.ios.tsx",
      "build/community/bottom-sheet/BottomSheet.ios.js",
    ]) {
      const bottomSheet = readFileSync(
        path.join(repositoryRoot, "node_modules/@expo/ui", file), "utf8");
      expect(bottomSheet).toContain("const nextWidth = probeFrame.localWidth ?? probeFrame.width;");
      expect(bottomSheet).not.toContain("const nextWidth = probeFrame.width;");
    }
    // A fresh install reproduces it: the hunks are in the repository patch.
    const patch = readFileSync(
      path.join(repositoryRoot, "patches/@expo%2Fui@58.0.15.patch"), "utf8");
    expect(patch).toContain("diff --git a/ios/Modifiers/OnGeometryChangeModifier.swift");
    expect(patch).toContain("+      of: { proxy in Geometry(frame: proxy.frame(in: .global), localSize: proxy.size) },");
    expect(patch.match(/^\+\s+const nextWidth = probeFrame\.localWidth \?\? probeFrame\.width;$/gm)?.length).toBe(2);
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

  test("relies on expo-sqlite's own Android connection lifecycle, unpatched", () => {
    // 58.0.11 reference-counts each connection across JS objects, locks every
    // native call against close, and closes still-open databases on reload;
    // that replaced the repository patch that deferred native lifetimes.
    const sqliteRoot = path.join(repositoryRoot, "node_modules/expo-sqlite");
    const connection = readFileSync(path.join(sqliteRoot,
      "android/src/main/java/expo/modules/sqlite/DatabaseConnection.kt"), "utf8");
    expect(connection).toContain("fun removeHolder()");
    expect(connection).toContain("releaseBindingIfUnused");
    expect(existsSync(path.join(sqliteRoot, "android/src/main/cpp/SQLiteError.h"))).toBe(true);
    expect(rootPackage.patchedDependencies?.["expo-sqlite@58.0.11"]).toBeUndefined();
  });
});
