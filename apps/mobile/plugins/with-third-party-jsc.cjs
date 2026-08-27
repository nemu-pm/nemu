const {
  withAppBuildGradle,
  withAppDelegate,
  withAndroidManifest,
  withDangerousMod,
  withFinalizedMod,
  withGradleProperties,
  withMainApplication,
  withSettingsGradle,
} = require("expo/config-plugins");
const fs = require("fs/promises");
const path = require("path");
const mobilePackageJson = require("../package.json");

/**
 * Every substitution below rewrites a generated native project file. A pattern
 * that silently stops matching (an Expo template change, a React Native or
 * Reanimated upgrade) would produce a project that still builds but is missing
 * the third-party JSC wiring, and the failure would only surface much later as
 * a runtime crash or a mis-linked engine. Fail the prebuild instead, with the
 * same discipline as `scripts/patch-aidoku-runtime.ts`.
 */
function countMatches(source, find) {
  if (typeof find === "string") {
    return source.split(find).length - 1;
  }
  const flags = find.flags.includes("g") ? find.flags : `${find.flags}g`;
  return (source.match(new RegExp(find.source, flags)) ?? []).length;
}

function describePattern(find) {
  const text = typeof find === "string" ? find : String(find);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

/** Applies a substitution that must match exactly once. */
function replaceOnceOrThrow(source, find, replace, label) {
  const matches = countMatches(source, find);
  if (matches !== 1) {
    throw new Error(
      `Nemu prebuild patch "${label}" ${
        matches === 0 ? "found no match" : `matched ${matches} times`
      }; expected exactly one.\nExpected snippet: ${describePattern(find)}`,
    );
  }
  // A rewrite that produces identical text is fine (re-running prebuild over an
  // already-migrated file); a pattern that no longer matches is not.
  return source.replace(find, replace);
}

/**
 * Applies a substitution that legitimately has nothing to match — normalizing
 * an older template spelling, or removing a block a previous prebuild wrote.
 * A non-global pattern still may not match more than once.
 */
function replaceOptional(source, find, replace, label) {
  const matches = countMatches(source, find);
  if (matches === 0) {
    return source;
  }
  const isGlobal = typeof find !== "string" && find.flags.includes("g");
  if (matches > 1 && !isGlobal) {
    throw new Error(
      `Nemu prebuild patch "${label}" matched ${matches} times; expected at most one.\nExpected snippet: ${describePattern(find)}`,
    );
  }
  return source.replace(find, replace);
}

/**
 * Native build flags must describe the versions actually installed. Read them
 * from the app manifest instead of duplicating literals that drift silently on
 * the next dependency bump.
 */
function exactDependencyVersion(name) {
  const range = mobilePackageJson.dependencies?.[name];
  if (typeof range !== "string") {
    throw new Error(
      `Nemu prebuild expects "${name}" to be a dependency of apps/mobile.`,
    );
  }
  const version = range.replace(/^[\s^~>=<]*/, "").trim();
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(
      `Nemu prebuild cannot derive a native build flag from the "${name}" version range "${range}".`,
    );
  }
  return version;
}

const REACT_NATIVE_MINOR = exactDependencyVersion("react-native").split(".")[1];
const WORKLETS_VERSION = exactDependencyVersion("react-native-worklets");
const REANIMATED_VERSION = exactDependencyVersion("react-native-reanimated");

const IMPORT_LINE = "import ReactJSC";
const FACTORY_METHOD = [
  "  override func createJSRuntimeFactory() -> JSRuntimeFactoryRef {",
  "    jsrt_create_jsc_factory()",
  "  }",
  "",
].join("\n");

const JSC_FILE_FLAGS = {
  "RCTAppSetupUtils.mm":
    "-DUSE_THIRD_PARTY_JSC=1 -DUSE_HERMES=0 -Wno-return-type",
  "RCTCxxBridge.mm": "-DUSE_THIRD_PARTY_JSC=1 -DUSE_HERMES=0",
  "RCTDefaultReactNativeFactoryDelegate.mm":
    "-DUSE_THIRD_PARTY_JSC=1 -DUSE_HERMES=0 -Wno-return-type",
  "RCTSwiftUIContainerViewWrapper.m":
    '-fmodule-map-file="${PODS_CONFIGURATION_BUILD_DIR}/RCTSwiftUI/RCTSwiftUI.modulemap"',
};

const RUBY_JSC_FILE_FLAGS = Object.entries(JSC_FILE_FLAGS)
  .map(([filename, flags]) => `'${filename}' => '${flags}'`)
  .join(", ");

const RN_MINOR_CPP_FLAGS = `-DREACT_NATIVE_MINOR_VERSION=${REACT_NATIVE_MINOR}`;
const WORKLETS_CPP_FLAGS =
  `-DWORKLETS_VERSION=${WORKLETS_VERSION} ${RN_MINOR_CPP_FLAGS} -DHERMES_V1_ENABLED`;
const RNSCREENS_CPP_FLAGS = "-DRNS_GAMMA_ENABLED=1 -DRCT_NEW_ARCH_ENABLED=1";
const REANIMATED_CPP_FLAGS =
  `${RN_MINOR_CPP_FLAGS} -DREANIMATED_VERSION=${REANIMATED_VERSION} -DRCT_NEW_ARCH_ENABLED=1`;
const GESTURE_HANDLER_CPP_FLAGS = `${RN_MINOR_CPP_FLAGS} -DRCT_NEW_ARCH_ENABLED=1`;
const THIRD_PARTY_JSC_CPP_FLAGS = "-DUSE_THIRD_PARTY_JSC=1 -DUSE_HERMES=0";
const IOS_ENV_LINES = [
  "ENV['USE_THIRD_PARTY_JSC'] ||= '1'",
  "ENV['USE_HERMES'] ||= '0'",
  "ENV['RNS_GAMMA_ENABLED'] ||= '1'",
];
const EXPO_OBJC_FLAGS = `${THIRD_PARTY_JSC_CPP_FLAGS} -fmodule-map-file="\${PODS_ROOT}/Headers/Public/React_RCTAppDelegate/React-RCTAppDelegate.modulemap"`;
const EXPO_SQLITE_C_FLAGS =
  "-DHAVE_USLEEP=1 -DSQLITE_ENABLE_LOCKING_STYLE=0 -DSQLITE_ENABLE_BYTECODE_VTAB=1 -DSQLITE_TEMP_STORE=2 -DSQLITE_ENABLE_SESSION=1 -DSQLITE_ENABLE_PREUPDATE_HOOK=1 -DSQLITE_ENABLE_MATH_FUNCTIONS=1 -DSQLITE_ENABLE_FTS4=1 -DSQLITE_ENABLE_FTS3_PARENTHESIS=1 -DSQLITE_ENABLE_FTS5=1";
const ANDROID_JSC_PROJECT = ":react-native-community_javascriptcore";
const ANDROID_JSC_INCLUDE_LINE = `include '${ANDROID_JSC_PROJECT}'`;
const ANDROID_JSC_PROJECT_DIR_LINE = [
  `project('${ANDROID_JSC_PROJECT}').projectDir = new File(`,
  "  new File(",
  "    providers.exec {",
  "      workingDir(rootDir)",
  '      commandLine("node", "--print", "require.resolve(\'@react-native-community/javascriptcore/package.json\', { paths: [require.resolve(\'react-native/package.json\')] })")',
  "    }.standardOutput.asText.get().trim()",
  "  ).getParentFile(),",
  "  'android'",
  ")",
].join("\n");
const ANDROID_JSC_APP_DEPENDENCY = `implementation project('${ANDROID_JSC_PROJECT}')`;
const WORKLETS_PICK_FIRST = "**/libworklets.so";
const ANDROID_GRADLE_JVM_ARGS = "-Xmx2048m -XX:MaxMetaspaceSize=1024m";
const ANDROID_CAMERA_FEATURE = "android.hardware.camera";
const ANDROID_CLEARTEXT_TRAFFIC_ATTRIBUTE = "android:usesCleartextTraffic";
const ANDROID_NETWORK_SECURITY_CONFIG_ATTRIBUTE = "android:networkSecurityConfig";
const ANDROID_NETWORK_SECURITY_CONFIG_NAME = "nemu_network_security_config";
const ANDROID_NETWORK_SECURITY_CONFIG_RESOURCE = `@xml/${ANDROID_NETWORK_SECURITY_CONFIG_NAME}`;
// Hosts Nemu itself owns or depends on for authentication and sync. `convex`
// entries cover the deployment (`*.convex.cloud`) and HTTP action
// (`*.convex.site`) domains via includeSubdomains.
const ANDROID_FIRST_PARTY_HTTPS_ONLY_DOMAINS = [
  "nemu.pm",
  "convex.cloud",
  "convex.site",
];
const ANDROID_NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Generated by plugins/with-third-party-jsc.cjs during prebuild. Do not edit.

  Aidoku source packages may legitimately target public legacy HTTP origins, so
  cleartext stays permitted by default; those requests are still confined by
  Nemu's direct-proxy, DNS-answer, and connected-peer SSRF checks. First-party
  authentication, sync, and API traffic must never be downgraded, so it is
  pinned to HTTPS here rather than relying on an app-wide opt-in.
-->
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="false">
${ANDROID_FIRST_PARTY_HTTPS_ONLY_DOMAINS.map(
  (domain) => `    <domain includeSubdomains="true">${domain}</domain>`,
).join("\n")}
  </domain-config>
</network-security-config>
`;
const ANDROID_HEADLESS_APP_LOADER_CLASS =
  "expo.modules.adapters.react.apploader.RNHeadlessAppLoader";
const ANDROID_HEADLESS_APP_LOADER_PROGUARD_MARKER =
  "nemuKeepExpoHeadlessAppLoader";
const ANDROID_HEADLESS_APP_LOADER_PROGUARD_BLOCK = `

# ${ANDROID_HEADLESS_APP_LOADER_PROGUARD_MARKER}: Expo TaskManager resolves
# this class from AndroidManifest metadata. R8 cannot see that reflective edge
# and otherwise removes the loader from release builds, so a background task
# can run only while the foreground React runtime happens to remain alive.
-keep class ${ANDROID_HEADLESS_APP_LOADER_CLASS} { *; }
`;
const ANDROID_SPLASH_STYLE_PATTERN =
  /^[ \t]*<style name="Theme\.App\.SplashScreen"[^>]*>[\s\S]*?^[ \t]*<\/style>/m;
const ANDROID_SPLASH_BEHAVIOR_PATTERN =
  /^[ \t]*<item name="android:windowSplashScreenBehavior">[^<]*<\/item>\r?\n?/m;
// AndroidX JavaScriptEngine 1.1.0 declares minSdk 26. Keep the app and every
// autolinked module on the same supported floor instead of bypassing manifest
// validation with tools:overrideLibrary (which could crash API 24/25 devices).
const ANDROID_MIN_SDK = "26";
const ANDROID_NATIVE_CLEAN_ORDER_MARKER = "nemuNativeCleanOrdering";
const ANDROID_NATIVE_CLEAN_ORDER_END_MARKER = "nemuNativeCleanOrderingEnd";

function isGradleCleanTaskRequest(taskName) {
  const leaf = String(taskName)
    .split(":")
    .filter(Boolean)
    .at(-1)
    ?.toLowerCase();
  return Boolean(leaf && "clean".startsWith(leaf));
}

function isCombinedAndroidCleanBuildRequest(taskNames) {
  return (
    taskNames.some(isGradleCleanTaskRequest) &&
    taskNames.some((taskName) => !isGradleCleanTaskRequest(taskName))
  );
}

const ANDROID_NATIVE_CLEAN_ORDER_BLOCK = `

// ${ANDROID_NATIVE_CLEAN_ORDER_MARKER}: native clean graphs reference codegen
// and Prefab outputs owned by other projects. Preserve producer outputs until
// every native clean finishes, then remove each project's persistent .cxx
// configuration so the next build cannot retain stale dependency hashes. A
// combined clean+assemble graph is different: project clean tasks delete the
// same codegen outputs assemble needs. Skip redundant native clean tasks there
// (the project clean and .cxx cleanup below cover them) and order every codegen
// producer after every project clean so Gradle cannot cache a deleted output.
gradle.projectsEvaluated {
    def requestedLeafTaskNames = gradle.startParameter.taskNames.collect { taskName ->
        taskName.tokenize(":").last().toLowerCase()
    }
    def isCleanTaskRequest = { taskName ->
        taskName.length() > 0 && "clean".startsWith(taskName)
    }
    def combinedCleanBuild =
        requestedLeafTaskNames.any { taskName -> isCleanTaskRequest(taskName) } &&
        requestedLeafTaskNames.any { taskName -> !isCleanTaskRequest(taskName) }
    def allNativeCleanTasks = rootProject.subprojects.collectMany { subproject ->
        subproject.tasks.findAll { task ->
            task.name.startsWith("externalNativeBuildClean")
        }
    }
    def allCodegenProducerTasks = rootProject.subprojects.collectMany { subproject ->
        subproject.tasks.findAll { task ->
            task.name.startsWith("generateCodegen")
        }
    }
    def allCodegenArtifactTasks = rootProject.subprojects.collectMany { subproject ->
        subproject.tasks.findAll { task ->
            task.name == "generateCodegenArtifactsFromSchema"
        }
    }
    def allProjectCleanTasks = rootProject.subprojects.collectMany { subproject ->
        subproject.tasks.findAll { task -> task.name == "clean" }
    }
    def appNativeCleanTasks = tasks.findAll { task ->
        task.name.startsWith("externalNativeBuildClean")
    }
    if (combinedCleanBuild) {
        allNativeCleanTasks.each { nativeClean ->
            nativeClean.enabled = false
        }
        allCodegenProducerTasks.each { codegenProducer ->
            allProjectCleanTasks.each { projectClean ->
                codegenProducer.mustRunAfter(projectClean)
            }
        }
    } else {
        appNativeCleanTasks.each { appNativeClean ->
            appNativeClean.dependsOn(allCodegenArtifactTasks)
        }
        def workletsProject = rootProject.findProject(":react-native-worklets")
        if (workletsProject != null) {
            def workletsClean = workletsProject.tasks.getByName("clean")
            allNativeCleanTasks.each { nativeClean ->
                workletsClean.mustRunAfter(nativeClean)
            }
        }
        allProjectCleanTasks.each { projectClean ->
            allNativeCleanTasks.each { nativeClean ->
                projectClean.mustRunAfter(nativeClean)
            }
        }
    }
    rootProject.subprojects.each { subproject ->
        subproject.tasks.findAll { task -> task.name == "clean" }.each { projectClean ->
            projectClean.doLast {
                def cxxDir = subproject.file(".cxx")
                if (cxxDir.exists()) {
                    subproject.delete(cxxDir)
                }
            }
        }
    }
}
// ${ANDROID_NATIVE_CLEAN_ORDER_END_MARKER}
`;

function upsertGradleProperty(properties, key, value) {
  const existing = properties.find(
    (item) => item.type === "property" && item.key === key,
  );
  if (existing) {
    existing.value = value;
    return properties;
  }
  return [...properties, { type: "property", key, value }];
}

function upsertGradleListProperty(properties, key, value) {
  const existing = properties.find(
    (item) => item.type === "property" && item.key === key,
  );
  if (!existing) {
    return [...properties, { type: "property", key, value }];
  }

  const values = existing.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.includes(value)) {
    values.push(value);
  }
  existing.value = values.join(",");
  return properties;
}

function ensureOptionalAndroidCameraFeature(androidManifest) {
  const manifest = androidManifest.manifest;
  const features = manifest["uses-feature"] ?? [];
  const cameraFeature = features.find(
    (feature) => feature.$?.["android:name"] === ANDROID_CAMERA_FEATURE,
  );

  if (cameraFeature) {
    cameraFeature.$ = {
      ...cameraFeature.$,
      "android:required": "false",
    };
  } else {
    features.push({
      $: {
        "android:name": ANDROID_CAMERA_FEATURE,
        "android:required": "false",
      },
    });
  }
  manifest["uses-feature"] = features;
  return androidManifest;
}

function ensureAndroidPublicSourceCleartextTraffic(androidManifest) {
  const application = androidManifest.manifest.application?.[0];
  if (!application) {
    throw new Error("Android manifest is missing its application element.");
  }

  // Aidoku packages may legitimately target public legacy HTTP origins. Expo's
  // debug overlay opts in to cleartext, but Android 9+ blocks OkHttp in release
  // unless the main manifest does too. Keep the behavior explicit here so a
  // debug device test cannot pass while the Play build fails. Source requests
  // remain behind Nemu's direct-proxy, DNS-answer, and connected-peer SSRF
  // checks; first-party auth and sync endpoints remain HTTPS-only.
  //
  // The generated network security config is what actually governs on the
  // supported API floor (26+): it permits cleartext in its base config and
  // denies it for first-party domains, and the platform ignores this attribute
  // whenever a config is present. The attribute stays for older tooling and
  // manifest readers that only understand the flag.
  application.$ = {
    ...application.$,
    [ANDROID_CLEARTEXT_TRAFFIC_ATTRIBUTE]: "true",
  };
  return androidManifest;
}

function ensureAndroidFirstPartyNetworkSecurityConfig(androidManifest) {
  const application = androidManifest.manifest.application?.[0];
  if (!application) {
    throw new Error("Android manifest is missing its application element.");
  }

  application.$ = {
    ...application.$,
    [ANDROID_NETWORK_SECURITY_CONFIG_ATTRIBUTE]:
      ANDROID_NETWORK_SECURITY_CONFIG_RESOURCE,
  };
  return androidManifest;
}

async function writeAndroidNetworkSecurityConfig(platformProjectRoot) {
  const resourceDir = path.join(platformProjectRoot, "app/src/main/res/xml");
  await fs.mkdir(resourceDir, { recursive: true });
  await fs.writeFile(
    path.join(resourceDir, `${ANDROID_NETWORK_SECURITY_CONFIG_NAME}.xml`),
    ANDROID_NETWORK_SECURITY_CONFIG_XML,
  );
}

function migrateAndroidSplashStyleContents(baseStyles, versionedStyles) {
  const splashStyle = baseStyles.match(ANDROID_SPLASH_STYLE_PATTERN)?.[0];
  if (!splashStyle || !ANDROID_SPLASH_BEHAVIOR_PATTERN.test(splashStyle)) {
    return { baseStyles, versionedStyles };
  }

  const nextBaseStyles = replaceOnceOrThrow(
    baseStyles,
    ANDROID_SPLASH_BEHAVIOR_PATTERN,
    "",
    "remove API 33 splash behavior from the base style",
  );
  let nextVersionedStyles = versionedStyles ?? "<resources>\n</resources>\n";
  if (ANDROID_SPLASH_STYLE_PATTERN.test(nextVersionedStyles)) {
    nextVersionedStyles = replaceOnceOrThrow(
      nextVersionedStyles,
      ANDROID_SPLASH_STYLE_PATTERN,
      splashStyle,
      "refresh the API 33 splash style clone",
    );
  } else {
    nextVersionedStyles = replaceOnceOrThrow(
      nextVersionedStyles,
      /\r?\n?<\/resources>/,
      `\n${splashStyle}\n</resources>`,
      "append the API 33 splash style clone",
    );
  }
  if (!nextVersionedStyles.endsWith("\n")) {
    nextVersionedStyles += "\n";
  }

  return {
    baseStyles: nextBaseStyles,
    versionedStyles: nextVersionedStyles,
  };
}

async function migrateAndroidSplashStyle(platformProjectRoot) {
  const baseStylesPath = path.join(
    platformProjectRoot,
    "app/src/main/res/values/styles.xml",
  );
  const versionedStylesDir = path.join(
    platformProjectRoot,
    "app/src/main/res/values-v33",
  );
  const versionedStylesPath = path.join(versionedStylesDir, "styles.xml");
  const baseStyles = await fs.readFile(baseStylesPath, "utf8");
  let versionedStyles;
  try {
    versionedStyles = await fs.readFile(versionedStylesPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const migrated = migrateAndroidSplashStyleContents(
    baseStyles,
    versionedStyles,
  );
  if (migrated.baseStyles !== baseStyles) {
    await fs.writeFile(baseStylesPath, migrated.baseStyles);
  }
  if (
    migrated.versionedStyles !== undefined &&
    migrated.versionedStyles !== versionedStyles
  ) {
    await fs.mkdir(versionedStylesDir, { recursive: true });
    await fs.writeFile(versionedStylesPath, migrated.versionedStyles);
  }
}

async function ensureAndroidHeadlessAppLoaderProguardRule(platformProjectRoot) {
  const proguardRulesPath = path.join(
    platformProjectRoot,
    "app/proguard-rules.pro",
  );
  const contents = await fs.readFile(proguardRulesPath, "utf8");
  if (contents.includes(ANDROID_HEADLESS_APP_LOADER_PROGUARD_MARKER)) {
    return;
  }
  await fs.writeFile(
    proguardRulesPath,
    `${contents.trimEnd()}${ANDROID_HEADLESS_APP_LOADER_PROGUARD_BLOCK}`,
  );
}

function patchSwiftAppDelegate(contents) {
  let next = contents;

  if (!next.includes(IMPORT_LINE)) {
    next = replaceOnceOrThrow(
      next,
      /import React\n/,
      `import React\n${IMPORT_LINE}\n`,
      "import ReactJSC into the Swift AppDelegate",
    );
  }

  if (!next.includes("createJSRuntimeFactory()")) {
    next = replaceOnceOrThrow(
      next,
      /(class ReactNativeDelegate: ExpoReactNativeFactoryDelegate \{\n)/,
      `$1${FACTORY_METHOD}`,
      "install the JSC runtime factory override",
    );
  }

  // Only present when the template still declares the pre-Ref return type.
  next = replaceOptional(
    next,
    /override func createJSRuntimeFactory\(\) -> JSRuntimeFactory\s*\{/,
    "override func createJSRuntimeFactory() -> JSRuntimeFactoryRef {",
    "normalize the JS runtime factory return type",
  );

  return next;
}

function patchPodfile(contents) {
  const helperName = "apply_third_party_jsc_build_settings";
  const staticEmbedHelperName = "remove_static_expo_modules_jsi_embed";

  let next = contents;
  for (const envLine of IOS_ENV_LINES) {
    if (!next.includes(envLine)) {
      next = replaceOnceOrThrow(
        next,
        /^platform :ios/m,
        `${envLine}\nplatform :ios`,
        `declare ${envLine.split(" ")[0]} above the iOS platform line`,
      );
    }
  }

  // Absent on a freshly generated Podfile; present when a previous prebuild
  // already wrote the helper and it has to be replaced with the current one.
  next = replaceOptional(
    next,
    new RegExp(
      `\\ndef ${helperName}\\(installer\\)[\\s\\S]*?\\nend\\n+(?=target 'Nemu' do)`,
    ),
    "\n",
    "drop a previously generated third-party JSC build-settings helper",
  );

  if (!next.includes(`def ${helperName}`)) {
    next = replaceOnceOrThrow(
      next,
      /(\nprepare_react_native_project!\n)/,
      `$1\n` +
        `def ${helperName}(installer)\n` +
        `  normalize_flags = ->(value) do\n` +
        `    if value.is_a?(String)\n` +
        `      value\n` +
        `        .gsub('-DRCT_NEW_ARCH_ENABLED=1-DUSE_HERMES=1', '-DRCT_NEW_ARCH_ENABLED=1 -DUSE_HERMES=1')\n` +
        `        .gsub('-DRCT_NEW_ARCH_ENABLED=1-DUSE_THIRD_PARTY_JSC=1', '-DRCT_NEW_ARCH_ENABLED=1 -DUSE_THIRD_PARTY_JSC=1')\n` +
        `    elsif value.is_a?(Array)\n` +
        `      value.map { |item| item.is_a?(String) ? normalize_flags.call(item) : item }\n` +
        `    else\n` +
        `      value\n` +
        `    end\n` +
        `  end\n` +
        `  jsc_file_flags = { ${RUBY_JSC_FILE_FLAGS} }\n` +
        `  worklets_cpp_flags = '${WORKLETS_CPP_FLAGS}'\n` +
        `  rn_minor_cpp_flags = '${RN_MINOR_CPP_FLAGS}'\n` +
        `  rnscreens_cpp_flags = '${RNSCREENS_CPP_FLAGS}'\n` +
        `  reanimated_cpp_flags = '${REANIMATED_CPP_FLAGS}'\n` +
        `  gesture_handler_cpp_flags = '${GESTURE_HANDLER_CPP_FLAGS}'\n` +
        `  expo_objc_flags = '${EXPO_OBJC_FLAGS}'\n` +
        `  expo_sqlite_c_flags = '${EXPO_SQLITE_C_FLAGS}'\n` +
        `  installer.pods_project.targets.each do |target|\n` +
        `    target.build_configurations.each do |config|\n` +
        `      ['OTHER_CFLAGS', 'OTHER_CPLUSPLUSFLAGS'].each do |key|\n` +
        `        config.build_settings[key] = normalize_flags.call(config.build_settings[key])\n` +
        `      end\n` +
        `      xcconfig = config.base_configuration_reference\n` +
        `      if xcconfig && xcconfig.real_path && File.exist?(xcconfig.real_path)\n` +
        `        contents = File.read(xcconfig.real_path)\n` +
        `        normalized = normalize_flags.call(contents)\n` +
        `        File.write(xcconfig.real_path, normalized) if normalized != contents\n` +
        `      end\n` +
        `    end\n` +
        `    if target.respond_to?(:source_build_phase) && target.source_build_phase\n` +
        `      target.source_build_phase.files.each do |file|\n` +
        `        file.settings ||= {}\n` +
        `        file.settings['COMPILER_FLAGS'] = normalize_flags.call(file.settings['COMPILER_FLAGS'])\n` +
        `        filename = file.file_ref && file.file_ref.path\n` +
        `        flags = jsc_file_flags[filename]\n` +
        `        if target.name == 'RNWorklets' && filename && filename.match?(/\\.(cpp|mm|cc|cxx)$/)\n` +
        `          flags = [flags, worklets_cpp_flags].compact.join(' ')\n` +
        `        end\n` +
        `        if target.name == 'RNSVG' && filename && filename.match?(/\\.(cpp|mm|cc|cxx)$/)\n` +
        `          flags = [flags, rn_minor_cpp_flags].compact.join(' ')\n` +
        `        end\n` +
        `        if target.name == 'RNScreens' && filename && filename.match?(/\\.(cpp|mm|cc|cxx)$/)\n` +
        `          flags = [flags, rnscreens_cpp_flags].compact.join(' ')\n` +
        `        end\n` +
        `        if target.name == 'RNReanimated' && filename && filename.match?(/\\.(cpp|mm|cc|cxx)$/)\n` +
        `          flags = [flags, reanimated_cpp_flags].compact.join(' ')\n` +
        `        end\n` +
        `        if target.name == 'RNGestureHandler' && filename && filename.match?(/\\.(cpp|mm|cc|cxx)$/)\n` +
        `          flags = [flags, gesture_handler_cpp_flags].compact.join(' ')\n` +
        `        end\n` +
        `        if target.name == 'Expo' && filename && filename.match?(/\\.(m|mm|cpp|cc|cxx)$/)\n` +
        `          flags = [flags, expo_objc_flags].compact.join(' ')\n` +
        `        end\n` +
        `        if target.name == 'ExpoSQLite' && filename && filename.end_with?('sqlite3.c')\n` +
        `          flags = [flags, expo_sqlite_c_flags].compact.join(' ')\n` +
        `        end\n` +
        `        next unless flags\n` +
        `        compiler_flags = file.settings['COMPILER_FLAGS'].to_s\n` +
        // Dedupe per flag, not on the joined string. A file can pick up flags
        // from two rules (a JSC file map plus a per-pod C++ set), so a prebuild
        // that already applied one of them would never match the joined string
        // and would append the whole set again on every run.
        `        existing_flags = compiler_flags.split(/\\s+/).reject(&:empty?)\n` +
        `        added_flags = flags.split(/\\s+/).reject(&:empty?).reject do |flag|\n` +
        `          existing_flags.include?(flag)\n` +
        `        end\n` +
        `        next if added_flags.empty?\n` +
        `        file.settings['COMPILER_FLAGS'] = (existing_flags + added_flags).join(' ')\n` +
        `      end\n` +
        `    end\n` +
        `  end\n` +
        `end\n\n` +
        `def ${staticEmbedHelperName}(installer)\n` +
        `  marker = 'ExpoModulesJSI'\n` +
        `  installer.aggregate_targets.each do |aggregate_target|\n` +
        `    support_dir = installer.sandbox.root + 'Target Support Files' + aggregate_target.label\n` +
        `    Dir.glob(File.join(support_dir.to_s, "#{aggregate_target.label}-frameworks*")).each do |path|\n` +
        `      next unless File.file?(path)\n` +
        `      lines = File.readlines(path)\n` +
        `      filtered = lines.reject { |line| line.include?(marker) }\n` +
        `      File.write(path, filtered.join) if filtered != lines\n` +
        `    end\n` +
        `    project = aggregate_target.user_project\n` +
        `    next unless project\n` +
        `    changed = false\n` +
        `    project.targets.each do |target|\n` +
        `      target.shell_script_build_phases.each do |phase|\n` +
        `        next unless phase.name == '[CP] Embed Pods Frameworks'\n` +
        `        [phase.input_paths, phase.output_paths].each do |paths|\n` +
        `          filtered = paths.reject { |entry| entry.include?(marker) }\n` +
        `          next if filtered == paths\n` +
        `          paths.replace(filtered)\n` +
        `          changed = true\n` +
        `        end\n` +
        `      end\n` +
        `    end\n` +
        `    project.save if changed\n` +
        `  end\n` +
        `end\n`,
    );
  }

  // The patched ExpoModulesJSI standalone runtime uses React-jsc. Remove the
  // old direct Hermes pod so two JSI engines cannot interpose each other's C++
  // symbols in the same process. Already gone once a previous prebuild removed
  // it from a Podfile that is not regenerated.
  next = replaceOptional(
    next,
    /\n  pod 'hermes-engine', :podspec => "#\{config\[:reactNativePath\]\}\/sdks\/hermes-engine\/hermes-engine\.podspec"\n/g,
    "\n",
    "remove the direct hermes-engine pod",
  );

  const helperCall = `    ${helperName}(installer)`;
  if (!next.includes(helperCall)) {
    next = replaceOnceOrThrow(
      next,
      /(  post_install do \|installer\|[\s\S]*?react_native_post_install\([\s\S]*?\n    \)\n)(  end\nend)/,
      `$1\n${helperCall}\n$2`,
      "call the third-party JSC build-settings helper from post_install",
    );
  }

  const staticEmbedHelperCall = `  ${staticEmbedHelperName}(installer)`;
  if (!next.includes(staticEmbedHelperCall)) {
    next = `${next.trimEnd()}\n\npost_integrate do |installer|\n${staticEmbedHelperCall}\nend\n`;
  }

  return next;
}

async function patchPodfileProperties(platformProjectRoot) {
  const propertiesPath = path.join(
    platformProjectRoot,
    "Podfile.properties.json",
  );
  const contents = await fs.readFile(propertiesPath, "utf8");
  const properties = JSON.parse(contents);
  properties["expo.jsEngine"] = "jsc";
  properties["ios.buildReactNativeFromSource"] = "true";
  await fs.writeFile(
    propertiesPath,
    `${JSON.stringify(properties, null, 2)}\n`,
  );
}

function patchKotlinMainApplication(contents) {
  let next = contents;

  if (
    !next.includes(
      "io.github.reactnativecommunity.javascriptcore.JSCRuntimeFactory",
    )
  ) {
    next = replaceOnceOrThrow(
      next,
      /(import expo\.modules\.ExpoReactHostFactory\n)/,
      `$1import io.github.reactnativecommunity.javascriptcore.JSCRuntimeFactory\n`,
      "import JSCRuntimeFactory into MainApplication",
    );
  }

  // Absent on a freshly generated MainApplication; present when a previous
  // prebuild already inserted the argument that is re-added below.
  next = replaceOptional(
    next,
    /,?\s*\n\s*jsRuntimeFactory = JSCRuntimeFactory\(\)\s*/g,
    "\n",
    "drop a previously inserted jsRuntimeFactory argument",
  );
  next = replaceOnceOrThrow(
    next,
    /(packageList =\s*\n\s*PackageList\(this\)\.packages\.apply \{[\s\S]*?\n\s*\})(\s*\n\s*\))/m,
    `$1,\n      jsRuntimeFactory = JSCRuntimeFactory()\n    )`,
    "pass JSCRuntimeFactory to the Expo React host",
  );

  return next;
}

function patchAndroidSettingsGradle(contents) {
  let next = contents;

  if (!next.includes(ANDROID_JSC_INCLUDE_LINE)) {
    next = replaceOnceOrThrow(
      next,
      /(include ':app'\n)/,
      `$1${ANDROID_JSC_INCLUDE_LINE}\n`,
      "include the JavaScriptCore Gradle project",
    );
  }

  if (!next.includes(ANDROID_JSC_PROJECT_DIR_LINE)) {
    next = replaceOnceOrThrow(
      next,
      new RegExp(
        `(${ANDROID_JSC_INCLUDE_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n)`,
      ),
      `$1${ANDROID_JSC_PROJECT_DIR_LINE}\n`,
      "resolve the JavaScriptCore Gradle project directory",
    );
  }

  return next;
}

function patchAndroidAppBuildGradle(contents) {
  let next = contents;
  if (!next.includes(ANDROID_JSC_APP_DEPENDENCY)) {
    next = replaceOnceOrThrow(
      next,
      /(implementation\("com\.facebook\.react:react-android"\)\n)/,
      `$1    ${ANDROID_JSC_APP_DEPENDENCY}\n`,
      "add the JavaScriptCore project dependency to the app module",
    );
  }

  const cleanOrderMarker = `\n// ${ANDROID_NATIVE_CLEAN_ORDER_MARKER}`;
  const cleanOrderEndMarker = `\n// ${ANDROID_NATIVE_CLEAN_ORDER_END_MARKER}`;
  const existingCleanOrderBlock = next.indexOf(cleanOrderMarker);
  if (existingCleanOrderBlock >= 0) {
    const existingCleanOrderEnd = next.indexOf(
      cleanOrderEndMarker,
      existingCleanOrderBlock,
    );
    if (existingCleanOrderEnd >= 0) {
      next =
        next.slice(0, existingCleanOrderBlock) +
        next.slice(existingCleanOrderEnd + cleanOrderEndMarker.length);
    } else {
      // One-time migration from the original end-of-file marker block.
      next = next.slice(0, existingCleanOrderBlock);
    }
  }
  next = `${next.trimEnd()}${ANDROID_NATIVE_CLEAN_ORDER_BLOCK}`;

  return next;
}

function withThirdPartyJsc(config) {
  config = withAppDelegate(config, (appDelegateConfig) => {
    if (appDelegateConfig.modResults.language === "swift") {
      appDelegateConfig.modResults.contents = patchSwiftAppDelegate(
        appDelegateConfig.modResults.contents,
      );
    }
    return appDelegateConfig;
  });

  config = withDangerousMod(config, [
    "ios",
    async (dangerousConfig) => {
      const podfilePath = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        "Podfile",
      );
      const contents = await fs.readFile(podfilePath, "utf8");
      await fs.writeFile(podfilePath, patchPodfile(contents));
      await patchPodfileProperties(
        dangerousConfig.modRequest.platformProjectRoot,
      );
      return dangerousConfig;
    },
  ]);

  config = withGradleProperties(config, (gradleConfig) => {
    let properties = upsertGradleProperty(
      gradleConfig.modResults,
      "org.gradle.jvmargs",
      ANDROID_GRADLE_JVM_ARGS,
    );
    properties = upsertGradleProperty(properties, "hermesEnabled", "false");
    properties = upsertGradleProperty(properties, "useThirdPartyJSC", "true");
    properties = upsertGradleProperty(
      properties,
      "android.minSdkVersion",
      ANDROID_MIN_SDK,
    );
    // Expo's template leaves both disabled. Production builds pay a large DEX
    // and startup penalty without R8/resource shrinking, so make the release
    // behavior explicit and reproducible after every clean prebuild.
    properties = upsertGradleProperty(
      properties,
      "android.enableMinifyInReleaseBuilds",
      "true",
    );
    properties = upsertGradleProperty(
      properties,
      "android.enableShrinkResourcesInReleaseBuilds",
      "true",
    );
    properties = upsertGradleListProperty(
      properties,
      "android.packagingOptions.pickFirsts",
      WORKLETS_PICK_FIRST,
    );
    gradleConfig.modResults = properties;
    return gradleConfig;
  });

  config = withSettingsGradle(config, (settingsGradleConfig) => {
    settingsGradleConfig.modResults.contents = patchAndroidSettingsGradle(
      settingsGradleConfig.modResults.contents,
    );
    return settingsGradleConfig;
  });

  config = withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults = ensureOptionalAndroidCameraFeature(
      manifestConfig.modResults,
    );
    manifestConfig.modResults = ensureAndroidPublicSourceCleartextTraffic(
      manifestConfig.modResults,
    );
    manifestConfig.modResults = ensureAndroidFirstPartyNetworkSecurityConfig(
      manifestConfig.modResults,
    );
    return manifestConfig;
  });

  config = withAppBuildGradle(config, (appBuildGradleConfig) => {
    appBuildGradleConfig.modResults.contents = patchAndroidAppBuildGradle(
      appBuildGradleConfig.modResults.contents,
    );
    return appBuildGradleConfig;
  });

  config = withMainApplication(config, (mainApplicationConfig) => {
    if (mainApplicationConfig.modResults.language === "kt") {
      mainApplicationConfig.modResults.contents = patchKotlinMainApplication(
        mainApplicationConfig.modResults.contents,
      );
    }
    return mainApplicationConfig;
  });

  // SplashScreenBehavior was added in API 33. Run after the regular Android
  // resource mods so the API-gated clone includes Expo's final splash style.
  config = withFinalizedMod(config, [
    "android",
    async (finalizedConfig) => {
      await ensureAndroidHeadlessAppLoaderProguardRule(
        finalizedConfig.modRequest.platformProjectRoot,
      );
      await writeAndroidNetworkSecurityConfig(
        finalizedConfig.modRequest.platformProjectRoot,
      );
      await migrateAndroidSplashStyle(
        finalizedConfig.modRequest.platformProjectRoot,
      );
      return finalizedConfig;
    },
  ]);

  return config;
}

module.exports = withThirdPartyJsc;
module.exports.isCombinedAndroidCleanBuildRequest =
  isCombinedAndroidCleanBuildRequest;
module.exports.ensureAndroidPublicSourceCleartextTraffic =
  ensureAndroidPublicSourceCleartextTraffic;
module.exports.ensureAndroidFirstPartyNetworkSecurityConfig =
  ensureAndroidFirstPartyNetworkSecurityConfig;
module.exports.androidNetworkSecurityConfigXml =
  ANDROID_NETWORK_SECURITY_CONFIG_XML;
module.exports.migrateAndroidSplashStyleContents =
  migrateAndroidSplashStyleContents;
module.exports.replaceOnceOrThrow = replaceOnceOrThrow;
module.exports.replaceOptional = replaceOptional;
module.exports.patchSwiftAppDelegate = patchSwiftAppDelegate;
module.exports.patchPodfile = patchPodfile;
module.exports.patchKotlinMainApplication = patchKotlinMainApplication;
module.exports.patchAndroidSettingsGradle = patchAndroidSettingsGradle;
module.exports.patchAndroidAppBuildGradle = patchAndroidAppBuildGradle;
