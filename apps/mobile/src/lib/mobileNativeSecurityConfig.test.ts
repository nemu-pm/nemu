import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const mobileRoot = path.resolve(import.meta.dir, "../..");

describe("mobile native security configuration", () => {
  test("uses scene-compatible native-stack status bar control", () => {
    const config = JSON.parse(
      readFileSync(path.join(mobileRoot, "app.json"), "utf8"),
    ) as {
      expo: {
        ios?: {
          infoPlist?: { UIViewControllerBasedStatusBarAppearance?: boolean };
        };
      };
    };
    const reader = readFileSync(
      path.join(mobileRoot, "src/screens/ReaderScreen.tsx"),
      "utf8",
    );
    const rootLayout = readFileSync(
      path.join(mobileRoot, "app/_layout.tsx"),
      "utf8",
    );

    expect(
      config.expo.ios?.infoPlist?.UIViewControllerBasedStatusBarAppearance,
    ).toBe(true);
    expect(reader).toContain("<Stack.Screen options={readerScreenOptions} />");
    expect(reader).not.toContain('from "expo-status-bar"');
    expect(rootLayout).toContain("statusBarStyle:");
    expect(rootLayout).not.toContain('from "expo-status-bar"');
  });

  test("declares the app-owned UserDefaults privacy reason", () => {
    const config = JSON.parse(
      readFileSync(path.join(mobileRoot, "app.json"), "utf8"),
    ) as {
      expo: {
        ios?: {
          privacyManifests?: {
            NSPrivacyAccessedAPITypes?: Array<{
              NSPrivacyAccessedAPIType?: string;
              NSPrivacyAccessedAPITypeReasons?: string[];
            }>;
          };
        };
      };
    };
    expect(config.expo.ios?.privacyManifests?.NSPrivacyAccessedAPITypes).toContainEqual({
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
      NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
    });
  });

  test("does not request unused storage, notification, recording, or background privileges", () => {
    const config = JSON.parse(
      readFileSync(path.join(mobileRoot, "app.json"), "utf8"),
    ) as {
      expo: {
        android?: { permissions?: string[]; blockedPermissions?: string[] };
        ios?: { infoPlist?: { UIBackgroundModes?: string[] } };
        plugins?: Array<string | [string, Record<string, unknown>]>;
      };
    };
    const audioPlugin = config.expo.plugins?.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === "expo-audio",
    );
    expect(config.expo.android?.permissions ?? []).not.toContain(
      "android.permission.POST_NOTIFICATIONS",
    );
    expect(config.expo.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.RECORD_AUDIO",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ]),
    );
    expect(config.expo.ios?.infoPlist?.UIBackgroundModes).toBeUndefined();
    expect(audioPlugin?.[1]).toMatchObject({
      microphonePermission: false,
      recordAudioAndroid: false,
      enableBackgroundPlayback: false,
    });
    const metadataEditor = readFileSync(
      path.join(mobileRoot, "src/components/MobileMetadataEditorSheet.tsx"),
      "utf8",
    );
    expect(metadataEditor).toContain("ImagePicker.launchImageLibraryAsync");
    expect(metadataEditor).not.toContain(
      "ImagePicker.requestMediaLibraryPermissionsAsync",
    );
  });

  test("encrypts native sandbox settings and migrates legacy plaintext", () => {
    const android = readFileSync(
      path.join(
        mobileRoot,
        "modules/nemu-aidoku/runtime/kotlin/AidokuSandboxManager.kt",
      ),
      "utf8",
    );
    const ios = readFileSync(
      path.join(
        mobileRoot,
        "modules/nemu-aidoku/ios/NemuAidokuIOSandboxManager.swift",
      ),
      "utf8",
    );
    expect(android).toContain('KeyStore.getInstance("AndroidKeyStore")');
    expect(android).toContain('Cipher.getInstance("AES/GCM/NoPadding")');
    expect(android).toContain("cipher.updateAAD(sourceKey.toByteArray");
    expect(android).toContain('"nemu-aidoku-secure-v1:"');
    expect(android).toContain("utf8Size(serialized)");
    expect(android).toContain("storeEncrypted(sourceKey, plaintext)");
    expect(android).not.toContain("putString(sourceKey, serialized)");
    expect(ios).toContain("SecItemAdd");
    expect(ios).toContain("kSecAttrAccessibleWhenUnlockedThisDeviceOnly");
    expect(ios).toContain("serialized.utf8.count <= maxSourceBytes");
    expect(ios).toContain("try setKeychainValue(legacy, sourceKey: sourceKey)");
    expect(ios).toContain("removeLegacy(keys: [sourceKey])");
    const secureRead = ios.slice(
      ios.indexOf("if let value = try keychainValue"),
      ios.indexOf("// One-time migration from the original UserDefaults"),
    );
    expect(secureRead).toContain("removeLegacy(keys: [sourceKey])");
    expect(secureRead.indexOf("removeLegacy(keys: [sourceKey])")).toBeLessThan(
      secureRead.indexOf("return value"),
    );
  });
});
