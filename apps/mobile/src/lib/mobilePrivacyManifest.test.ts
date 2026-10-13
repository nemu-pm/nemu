import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const mobileRoot = path.resolve(import.meta.dir, "../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(mobileRoot, relativePath), "utf8")) as T;
}

type AppConfig = {
  expo: {
    ios: {
      infoPlist: Record<string, unknown>;
      privacyManifests: {
        NSPrivacyTracking: boolean;
        NSPrivacyTrackingDomains: string[];
        NSPrivacyCollectedDataTypes: Array<{
          NSPrivacyCollectedDataType: string;
          NSPrivacyCollectedDataTypeLinked: boolean;
          NSPrivacyCollectedDataTypeTracking: boolean;
          NSPrivacyCollectedDataTypePurposes: string[];
        }>;
        NSPrivacyAccessedAPITypes: Array<{
          NSPrivacyAccessedAPIType: string;
          NSPrivacyAccessedAPITypeReasons: string[];
        }>;
      };
    };
  };
};

const ios = readJson<AppConfig>("app.json").expo.ios;

// Mirrors docs/app-store/privacy-labels.md; change both together.
const COLLECTED = [
  "NSPrivacyCollectedDataTypeEmailAddress",
  "NSPrivacyCollectedDataTypeName",
  "NSPrivacyCollectedDataTypeOtherDataTypes",
  "NSPrivacyCollectedDataTypeOtherUserContent",
  "NSPrivacyCollectedDataTypePhotosorVideos",
  "NSPrivacyCollectedDataTypeProductInteraction",
  "NSPrivacyCollectedDataTypeUserID",
];

describe("iOS privacy manifest (app.json expo.ios.privacyManifests)", () => {
  test("does not track and declares no tracking domains", () => {
    expect(ios.privacyManifests.NSPrivacyTracking).toBe(false);
    expect(ios.privacyManifests.NSPrivacyTrackingDomains).toEqual([]);
  });

  test("declares exactly the data types in the App Store privacy label", () => {
    const declared = ios.privacyManifests.NSPrivacyCollectedDataTypes;
    expect(declared.map((entry) => entry.NSPrivacyCollectedDataType).sort()).toEqual(
      COLLECTED,
    );
    for (const entry of declared) {
      expect(entry.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(entry.NSPrivacyCollectedDataTypePurposes).toEqual([
        "NSPrivacyCollectedDataTypePurposeAppFunctionality",
      ]);
    }
  });

  test("declares the required-reason APIs the app's own code and modules use", () => {
    const reasons = Object.fromEntries(
      ios.privacyManifests.NSPrivacyAccessedAPITypes.map((entry) => [
        entry.NSPrivacyAccessedAPIType,
        entry.NSPrivacyAccessedAPITypeReasons,
      ]),
    );
    // UserDefaults: modules/nemu-window-layout, modules/nemu-aidoku.
    expect(reasons.NSPrivacyAccessedAPICategoryUserDefaults).toContain("CA92.1");
    // File timestamps of files in the app container: nativeCache, cover cache.
    expect(reasons.NSPrivacyAccessedAPICategoryFileTimestamp).toContain("C617.1");
    // ProcessInfo.systemUptime: modules/nemu-aidoku NemuCloudflareChallengePolicy.
    expect(reasons.NSPrivacyAccessedAPICategorySystemBootTime).toContain("35F9.1");
  });
});

describe("iOS Info.plist hygiene", () => {
  const USAGE_KEYS = [
    "NSMicrophoneUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "NSSpeechRecognitionUsageDescription",
  ];

  test("declares non-exempt encryption false (standard TLS/OS crypto only)", () => {
    expect(ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  test("has usage strings only for photos, microphone and speech, localized", () => {
    const keys = Object.keys(ios.infoPlist)
      .filter((key) => key.endsWith("UsageDescription"))
      .sort();
    expect(keys).toEqual(USAGE_KEYS);
    for (const locale of ["en", "zh", "ja"]) {
      const strings = readJson<{ ios: Record<string, string> }>(
        `locales/${locale}.json`,
      ).ios;
      expect(Object.keys(strings).sort()).toEqual(USAGE_KEYS);
    }
  });

  test("requests no camera, location, contacts, tracking or Face ID access", () => {
    for (const key of Object.keys(ios.infoPlist)) {
      expect(key).not.toMatch(
        /Camera|Location|Contacts|Calendars|Tracking|FaceID|Bluetooth|Motion|Health/,
      );
    }
  });
});
