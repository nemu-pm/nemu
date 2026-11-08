import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  "expo-modules-jsi", "@expo/cli", "@expo/ui",
];

describe("mobile Expo native patch policy", () => {
  test("forwards system-bar ownership past auxiliary child controllers", () => {
    const source = readFileSync(path.join(repositoryRoot,
      "node_modules/react-native-screens/ios/UIViewController+RNScreens.mm"), "utf8");
    const lookup = source.slice(source.indexOf("- (UIViewController *)findChildRNSScreensViewController"));
    expect(lookup).toContain("reverseObjectEnumerator");
    expect(lookup).toContain("conformsToProtocol:@protocol(RNSViewControllerDelegate)");
    expect(lookup).not.toContain("lastObject");
  });

  test("lets touches through the title-only navigation bar beside a vertical bar", () => {
    // iPhone Duo inner landscape: the bar's items are in the vertical bar, but
    // the transparent bar still spans the top 58pt, where the detail columns
    // start (the chapter column's source pill could not be tapped).
    const source = readFileSync(path.join(repositoryRoot,
      "node_modules/react-native-screens/ios/RNSNavigationBar.mm"), "utf8");
    const hitTest = source.slice(source.indexOf("- (UIView *)hitTest:"));
    expect(hitTest).toContain("self.traitCollection.verticalBarEdge != UIVerticalBarEdgeUnspecified");
    expect(hitTest).toContain("hit == self || hit.superview == self");
    expect(hitTest).toContain("[hit isDescendantOfView:titleView] || [titleView isDescendantOfView:hit]");
    const patch = readFileSync(
      path.join(repositoryRoot, "patches/react-native-screens@4.30.0.patch"), "utf8");
    expect(patch).toContain("diff --git a/ios/RNSNavigationBar.mm b/ios/RNSNavigationBar.mm");
  });

  test("a new Picker shows its selection from its first body", () => {
    // Reader settings: rows the mode switch brought back kept 55–91pt cells
    // around 32pt content. The Picker's state stayed empty until onAppear, so
    // its button was placed at the chevron's width, and the List self-sized
    // the row with the value wrapped in that width and never asked again.
    const source = readFileSync(path.join(repositoryRoot,
      "node_modules/@expo/ui/ios/Picker/PickerView.swift"), "utf8");
    expect(source).toContain("get: { selection ?? Self.getHashableFromEither(props.selection) }");
    expect(source).not.toContain("selection: $selection");
    const patch = readFileSync(
      path.join(repositoryRoot, "patches/@expo%2Fui@58.0.24.patch"), "utf8");
    expect(patch).toContain("diff --git a/ios/Picker/PickerView.swift b/ios/Picker/PickerView.swift");
  });

  test("does not start a queued layout animation after its parent is destroyed", () => {
    const source = readFileSync(path.join(repositoryRoot,
      "node_modules/react-native-reanimated/Common/cpp/reanimated/LayoutAnimations/LayoutAnimationsProxy.cpp"), "utf8");
    const start = source.slice(source.indexOf("void LayoutAnimationsProxy::startLayoutAnimation("),
      source.indexOf("void LayoutAnimationsProxy::startSharedTransition("));
    // The 13:59 Duo crash dereferenced parent->current.tag at address 0x104.
    // Guard before resolving props/queuing work and retain the locked parent.
    expect(start).toMatch(/const auto parent = node->parent.lock\(\);\s*if \(!parent\) \{\s*return;/);
    expect(start.indexOf("if (!parent)")).toBeLessThan(start.indexOf("resolveLightNodeProps(node)"));
    expect(start.indexOf("if (!parent)")).toBeLessThan(start.indexOf("parent->current.tag"));
    expect(rootPackage.patchedDependencies?.["react-native-reanimated@4.7.1"])
      .toBe("patches/react-native-reanimated@4.7.1.patch");
  });

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
    // 58.0.24 stretches the host vertically so `removeClippedSubviews` keeps it attached.
    expect(bottomSheet).toContain("<Host style={{ position: 'absolute', top: 0, bottom: 0, width }}");
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
      expect(bottomSheet).toMatch(/: windowWidth\)\s*\*\s*presentation\.scale;/);
    }
  });
  test("sizes a content-sized iOS sheet from the sheet's own reported width and safe-area insets", () => {
    // A probe sized by the sheet (`containerRelativeFrame`) sees only its safe
    // region: on the iPhone Duo outer display the 76pt bar column inside a
    // spanning sheet left the content 374pt wide, centred in a 450pt sheet
    // (~54pt side margins). The host reports the sheet's hosting view width
    // and insets (unscaled), and the content drops only the insets it does
    // not extend into.
    const hostView = readFileSync(path.join(repositoryRoot,
      "node_modules/@expo/ui/ios/RNHostView.swift"), "utf8");
    expect(hostView).toContain("metrics.sheetWidth = sheetView.bounds.width");
    expect(hostView).toContain("metrics.safeAreaRight = sheetView.safeAreaInsets.right");
    expect(hostView).toContain('"sheetWidth": metrics.sheetWidth');
    for (const file of [
      "src/community/bottom-sheet/BottomSheet.ios.tsx",
      "build/community/bottom-sheet/BottomSheet.ios.js",
    ]) {
      const bottomSheet = readFileSync(
        path.join(repositoryRoot, "node_modules/@expo/ui", file), "utf8");
      expect(bottomSheet).toMatch(/presentation\.sheetWidth -\s*\(ignoresLeft \? 0 : presentation\.safeAreaLeft\)/);
      expect(bottomSheet).not.toContain("containerRelativeFrame");
      // Flush with the sheet's edges by an offset, which keeps the host's
      // frame (negative padding shrank it and the content lost its touches).
      expect(bottomSheet).toMatch(/offset\(\{\s*x: sheetSafeAreaInsets/);
    }
    // A fresh install reproduces it: the hunks are in the repository patch.
    const patch = readFileSync(
      path.join(repositoryRoot, "patches/@expo%2Fui@58.0.24.patch"), "utf8");
    expect(patch).toContain("+      metrics.sheetWidth = sheetView.bounds.width");
    expect(patch).toContain("diff --git a/ios/Modifiers/OnGeometryChangeModifier.swift");
  });
  test("presents a regular-width iPad sheet as a centred form sheet of an explicit size", () => {
    // `.fitted` and the system `.form` sizing both opened the content-sized
    // onboarding sheet page-sized on iPad (a hosted React Native root reports
    // no ideal size), so the native view takes the form's width from JS and
    // the measured (or given) height, and later heights reach the presented
    // controller as its `preferredContentSize` (the sizing is read once).
    const sheetView = readFileSync(path.join(repositoryRoot,
      "node_modules/@expo/ui/ios/BottomSheetView.swift"), "utf8");
    expect(sheetView).toContain("@Field var formSheetWidth: Double = 0");
    expect(sheetView).toContain("@Field var formSheetHeight: Double = 0");
    expect(sheetView).toContain("private struct FormSheetSizing: PresentationSizing");
    expect(sheetView).toContain("controller.preferredContentSize = contentSize");
    expect(sheetView).toContain(
      ".presentationSizing(FormSheetSizing(width: props.formSheetWidth, height: childrenSize.height))",
    );
    for (const [file, pattern] of [
      ["src/community/bottom-sheet/BottomSheet.ios.tsx", /formSheetWidth=\{fitToContents \? formSheetWidth : 0\}/],
      ["build/community/bottom-sheet/BottomSheet.ios.js", /formSheetWidth: fitToContents \? formSheetWidth : 0,/],
    ] as const) {
      const bottomSheet = readFileSync(
        path.join(repositoryRoot, "node_modules/@expo/ui", file), "utf8");
      expect(bottomSheet).toMatch(pattern);
    }
    const patch = readFileSync(
      path.join(repositoryRoot, "patches/@expo%2Fui@58.0.24.patch"), "utf8");
    expect(patch).toContain("+private struct FormSheetSizing: PresentationSizing {");
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

  test("calls expo-modules-jsi's typed-array check by its patched name everywhere", () => {
    // The patch renames `expo::isTypedArray` so it does not collide with
    // ExpoModulesCore's in the final link; a caller left on the old name (58.0.15
    // added JavaScriptUnownedValue.swift) fails the Swift build.
    const sourcesRoot = path.join(repositoryRoot, "node_modules/expo-modules-jsi/apple/Sources");
    const swiftFiles = readdirSync(sourcesRoot, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".swift"));
    const callers = swiftFiles.filter((file) =>
      readFileSync(path.join(sourcesRoot, file), "utf8").includes("expo.isExpoModulesJSITypedArray("));
    expect(callers.length).toBeGreaterThan(0);
    for (const file of swiftFiles) {
      expect(readFileSync(path.join(sourcesRoot, file), "utf8")).not.toContain("expo.isTypedArray(");
    }
  });

  test("selects active background work instead of a historical predecessor, unpatched", () => {
    // 58.0.11 picks the RUNNING/ENQUEUED run itself (`selectCurrentWorkInfo`),
    // which replaced the repository patch that did the same.
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
    expect(source).toContain("return selectCurrentWorkInfo(workInfos)");
    expect(Object.keys(rootPackage.patchedDependencies ?? {})
      .some((dependency) => dependency.startsWith("expo-background-task@"))).toBe(false);
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
