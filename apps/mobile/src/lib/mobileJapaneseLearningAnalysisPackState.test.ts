import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
  NemuAnalysisStatus,
  NemuJapaneseLearningNativeModule,
} from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import { getMobileStrings } from "./mobileI18n";
import {
  describeMobileJapaneseLearningPackLoading,
  describeMobileJapaneseLearningPackRow,
  formatMobileJapaneseLearningPackMegabytes,
  MOBILE_JAPANESE_LEARNING_PACK_INITIAL_STATE,
  mobileJapaneseLearningPackProgressFraction,
  reduceMobileJapaneseLearningPackState,
  shouldStartMobileJapaneseLearningPackInstall,
  type MobileJapaneseLearningPackEvent,
  type MobileJapaneseLearningPackState,
} from "./mobileJapaneseLearningAnalysisPackState";
import {
  getMobileJapaneseLearningAnalysisPackState,
  installMobileJapaneseLearningAnalysisPackNow,
  refreshMobileJapaneseLearningAnalysisPackStatus,
  removeMobileJapaneseLearningAnalysisPackNow,
  resetMobileJapaneseLearningAnalysisPackStoreForTesting,
  subscribeMobileJapaneseLearningAnalysisPackState,
} from "./mobileJapaneseLearningAnalysisPackStore";
import {
  setMobileJapaneseLearningEnginePreference,
  setMobileJapaneseLearningNativeModuleForTesting,
} from "./mobileJapaneseLearningEngine";
import { runMobileJapaneseLearningGrammar } from "./mobileJapaneseLearningGrammar";
import { MOBILE_ICHIRAN_PACK_RELEASE } from "./mobileJapaneseLearningOnDeviceAnalysis";
import { setMobileJapaneseLearningAuthCookieReaderForTesting } from "./mobileJapaneseLearningAuth";

// Cloud paths are server features: these tests run signed in.
beforeAll(() => setMobileJapaneseLearningAuthCookieReaderForTesting(() => "nemu.session_token=test"));
afterAll(() => setMobileJapaneseLearningAuthCookieReaderForTesting(undefined));

const en = getMobileStrings("en");

function status(overrides: Partial<NemuAnalysisStatus> = {}): NemuAnalysisStatus {
  return {
    kernelLinked: true,
    abiVersion: 5,
    installed: false,
    installing: false,
    ...overrides,
  };
}

const installedStatus = status({
  installed: true,
  packVersion: MOBILE_ICHIRAN_PACK_RELEASE.packVersion,
  manifestSha256: MOBILE_ICHIRAN_PACK_RELEASE.manifestSha256,
  installedBytes: 38_413_162,
});

function fold(
  events: MobileJapaneseLearningPackEvent[],
  from: MobileJapaneseLearningPackState = MOBILE_JAPANESE_LEARNING_PACK_INITIAL_STATE,
): MobileJapaneseLearningPackState {
  return events.reduce(reduceMobileJapaneseLearningPackState, from);
}

describe("pack state reducer", () => {
  test("maps native status reads", () => {
    expect(fold([{ type: "status", status: status({ kernelLinked: false }) }])).toEqual({
      kind: "unavailable",
    });
    expect(fold([{ type: "status", status: status() }])).toEqual({ kind: "notInstalled" });
    expect(fold([{ type: "status", status: installedStatus }])).toEqual({
      kind: "installed",
      installedBytes: 38_413_162,
      packVersion: MOBILE_ICHIRAN_PACK_RELEASE.packVersion,
    });
    // A pack of another pinned version needs the new download.
    expect(
      fold([
        {
          type: "status",
          status: { ...installedStatus, manifestSha256: "0".repeat(64) },
        },
      ]),
    ).toEqual({ kind: "notInstalled" });
    expect(fold([{ type: "status", status: status({ installing: true }) }]).kind).toBe(
      "installing",
    );
  });

  test("tracks download progress monotonically across network and hashing events", () => {
    const total = MOBILE_ICHIRAN_PACK_RELEASE.downloadBytes;
    const state = fold([
      { type: "status", status: status() },
      { type: "install-started" },
      { type: "progress", progress: { phase: "downloading", completedBytes: 6_000_000, totalBytes: total } },
      // The store re-reads the downloaded hot asset from 0 while hashing it.
      { type: "progress", progress: { phase: "downloading", completedBytes: 1_048_576, totalBytes: total } },
      { type: "progress", progress: { phase: "downloading", completedBytes: 12_300_000, totalBytes: total } },
    ]);
    expect(state).toEqual({
      kind: "installing",
      phase: "downloading",
      completedBytes: 12_300_000,
      totalBytes: total,
    });
    expect(mobileJapaneseLearningPackProgressFraction(state)).toBeCloseTo(12_300_000 / total);
  });

  test("starts from the pinned download size before the first byte arrives", () => {
    const state = fold([{ type: "install-started" }]);
    expect(state).toEqual({
      kind: "installing",
      phase: "starting",
      completedBytes: 0,
      totalBytes: MOBILE_ICHIRAN_PACK_RELEASE.downloadBytes,
    });
  });

  test("keeps a failure visible across status refreshes until a retry starts", () => {
    const failed = fold([
      { type: "install-started" },
      { type: "install-failed", message: "offline" },
      { type: "status", status: status() },
    ]);
    expect(failed).toEqual({ kind: "failed", message: "offline" });
    expect(fold([{ type: "install-started" }], failed).kind).toBe("installing");
    // …or the pack turns out to be installed after all.
    expect(fold([{ type: "status", status: installedStatus }], failed).kind).toBe("installed");
  });

  test("an install finishes installed and a removal returns to not installed", () => {
    const installed = fold([
      { type: "install-started" },
      { type: "install-succeeded", status: installedStatus },
    ]);
    expect(installed.kind).toBe("installed");
    const removing = fold([{ type: "remove-started" }], installed);
    expect(removing).toEqual({ kind: "removing" });
    expect(fold([{ type: "status", status: status() }], removing)).toEqual({
      kind: "notInstalled",
    });
  });

  test("a status read during an install does not reset its progress", () => {
    const installing = fold([
      { type: "install-started" },
      { type: "progress", progress: { phase: "downloading", completedBytes: 5, totalBytes: 10 } },
    ]);
    expect(fold([{ type: "status", status: status() }], installing)).toBe(installing);
    expect(fold([{ type: "remove-started" }], installing)).toBe(installing);
  });
});

describe("pack copy", () => {
  test("formats decimal megabytes like iOS storage", () => {
    expect(formatMobileJapaneseLearningPackMegabytes(12_300_000)).toBe("12.3");
    expect(formatMobileJapaneseLearningPackMegabytes(MOBILE_ICHIRAN_PACK_RELEASE.downloadBytes)).toBe(
      "25.0",
    );
    expect(formatMobileJapaneseLearningPackMegabytes(-1)).toBe("0.0");
  });

  test("the analysis loading state shows bytes, then installing", () => {
    const total = MOBILE_ICHIRAN_PACK_RELEASE.downloadBytes;
    expect(
      describeMobileJapaneseLearningPackLoading(
        { kind: "installing", phase: "downloading", completedBytes: 12_300_000, totalBytes: total },
        en,
      ),
    ).toEqual({
      label: "Downloading Japanese dictionary… 12.3 / 25.0 MB",
      progress: 12_300_000 / total,
    });
    expect(
      describeMobileJapaneseLearningPackLoading(
        { kind: "installing", phase: "opening", completedBytes: total, totalBytes: total },
        en,
      ),
    ).toEqual({ label: "Installing Japanese dictionary…", progress: null });
    expect(
      describeMobileJapaneseLearningPackLoading(
        { kind: "installed", installedBytes: 1, packVersion: null },
        en,
      ),
    ).toBeNull();
    expect(describeMobileJapaneseLearningPackLoading({ kind: "notInstalled" }, en)).toBeNull();
  });

  test("the settings row offers the action that fits each state", () => {
    const row = (state: MobileJapaneseLearningPackState, preference: "auto" | "onDevice" | "cloud" = "auto") =>
      describeMobileJapaneseLearningPackRow(state, en, preference);
    expect(row({ kind: "unavailable" })).toBeNull();
    expect(row({ kind: "notInstalled" })).toEqual({
      status: "Not downloaded · 25.0 MB",
      progress: undefined,
      action: "download",
      busy: false,
    });
    expect(row({ kind: "installed", installedBytes: 38_413_162, packVersion: "x" })).toEqual({
      status: "Downloaded · 38.4 MB",
      progress: undefined,
      action: "remove",
      busy: false,
    });
    expect(
      row({ kind: "installing", phase: "downloading", completedBytes: 0, totalBytes: 25_000_000 }),
    ).toEqual({
      status: "Downloading Japanese dictionary… 0.0 / 25.0 MB",
      progress: 0,
      action: null,
      busy: true,
    });
    expect(row({ kind: "failed", message: "offline" })?.status).toBe(
      "Download failed · using cloud analysis for now",
    );
    expect(row({ kind: "failed", message: "offline" }, "onDevice")).toEqual({
      status: "Download failed",
      progress: undefined,
      action: "retry",
      busy: false,
    });
    expect(row({ kind: "removing" })?.action).toBeNull();
  });

  test("every locale has the dictionary and license copy", () => {
    for (const language of ["en", "ja", "zh"] as const) {
      const strings = getMobileStrings(language);
      for (const value of Object.values(strings.japaneseLearningDictionary)) {
        expect(value.length).toBeGreaterThan(0);
      }
      for (const value of Object.values(strings.openSourceLicenses)) {
        expect(value.length).toBeGreaterThan(0);
      }
      expect(strings.japaneseLearningDictionary.downloadingProgress).toContain("{{completed}}");
      expect(strings.japaneseLearningDictionary.downloadingProgress).toContain("{{total}}");
    }
  });
});

describe("settings engine switch", () => {
  test("choosing On Device or Automatic starts a missing download", () => {
    const notInstalled: MobileJapaneseLearningPackState = { kind: "notInstalled" };
    expect(
      shouldStartMobileJapaneseLearningPackInstall({ previous: "cloud", next: "onDevice", state: notInstalled }),
    ).toBe(true);
    expect(
      shouldStartMobileJapaneseLearningPackInstall({ previous: "cloud", next: "auto", state: { kind: "failed", message: "x" } }),
    ).toBe(true);
    // Opening the settings (first value) or picking Cloud never downloads.
    expect(
      shouldStartMobileJapaneseLearningPackInstall({ previous: null, next: "auto", state: notInstalled }),
    ).toBe(false);
    expect(
      shouldStartMobileJapaneseLearningPackInstall({ previous: "auto", next: "cloud", state: notInstalled }),
    ).toBe(false);
    expect(
      shouldStartMobileJapaneseLearningPackInstall({
        previous: "cloud",
        next: "onDevice",
        state: { kind: "installed", installedBytes: null, packVersion: null },
      }),
    ).toBe(false);
  });
});

function fakePackModule(options: { failInstall?: boolean } = {}) {
  let installed = false;
  const calls = { install: 0, remove: 0 };
  const read = (): NemuAnalysisStatus =>
    installed ? { ...installedStatus } : status();
  const module = {
    getCapabilities: () => ({
      platform: "ios",
      osVersion: "27.1.0",
      ocr: { available: true, engine: "apple-vision", engineRevision: "r3", textDirection: true },
      analysis: { kernelLinked: true, engine: "ichiran-rust", abiVersion: 5 },
    }),
    getAnalysisStatus: async () => read(),
    installAnalysisPack: async () => {
      calls.install += 1;
      if (options.failInstall) throw new Error("Could not download hot.bin.gz: offline");
      installed = true;
      return read();
    },
    removeAnalysisPack: async () => {
      calls.remove += 1;
      installed = false;
    },
    addListener: () => ({ remove() {} }),
  } as unknown as NemuJapaneseLearningNativeModule;
  return { module, calls };
}

afterEach(() => {
  resetMobileJapaneseLearningAnalysisPackStoreForTesting(undefined);
  setMobileJapaneseLearningNativeModuleForTesting(undefined);
  setMobileJapaneseLearningEnginePreference("auto");
});

describe("pack store", () => {
  test("download now, then remove, as the settings row drives it", async () => {
    const { module, calls } = fakePackModule();
    resetMobileJapaneseLearningAnalysisPackStoreForTesting(module);
    const seen: string[] = [];
    subscribeMobileJapaneseLearningAnalysisPackState(() => {
      seen.push(getMobileJapaneseLearningAnalysisPackState().kind);
    });
    await refreshMobileJapaneseLearningAnalysisPackStatus();
    expect(getMobileJapaneseLearningAnalysisPackState().kind).toBe("notInstalled");

    expect(await installMobileJapaneseLearningAnalysisPackNow()).toBe(true);
    expect(calls.install).toBe(1);
    expect(getMobileJapaneseLearningAnalysisPackState().kind).toBe("installed");
    expect(seen).toContain("installing");

    expect(await removeMobileJapaneseLearningAnalysisPackNow()).toBe(true);
    expect(calls.remove).toBe(1);
    expect(getMobileJapaneseLearningAnalysisPackState().kind).toBe("notInstalled");
    expect(seen).toContain("removing");
  });

  test("a failed download surfaces as failed with a retry", async () => {
    const { module } = fakePackModule({ failInstall: true });
    resetMobileJapaneseLearningAnalysisPackStoreForTesting(module);
    subscribeMobileJapaneseLearningAnalysisPackState(() => undefined);
    expect(await installMobileJapaneseLearningAnalysisPackNow()).toBe(false);
    const state = getMobileJapaneseLearningAnalysisPackState();
    expect(state).toEqual({ kind: "failed", message: "Could not download hot.bin.gz: offline" });
    expect(describeMobileJapaneseLearningPackRow(state, en, "onDevice")?.action).toBe("retry");
    // Automatic falls back to the cloud only when signed in.
    expect(describeMobileJapaneseLearningPackRow(state, en, "auto")?.status).toBe(
      en.japaneseLearningDictionary.failedUsingCloud,
    );
    expect(describeMobileJapaneseLearningPackRow(state, en, "auto", false)?.status).toBe(
      en.japaneseLearningDictionary.failed,
    );
  });
});

describe("automatic engine fallback", () => {
  const cloudSegments = [[[[["ねこ", { type: "KANA", text: "ねこ", kana: "ねこ", gloss: [] }, []]], 1]]];
  const cloudFetch = (async () =>
    new Response(JSON.stringify({ segments: cloudSegments }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

  test("Automatic analyzes in the cloud when the dictionary cannot be downloaded", async () => {
    const { module, calls } = fakePackModule({ failInstall: true });
    setMobileJapaneseLearningNativeModuleForTesting(module);
    setMobileJapaneseLearningEnginePreference("auto");
    const result = await runMobileJapaneseLearningGrammar("ねこ", {
      fetchImpl: cloudFetch,
      normalizeText: async (text) => ({ normalized: text, properNouns: [] }),
    });
    expect(calls.install).toBe(1);
    expect(result.engine).toBe("cloud");
    expect(result.tokens.map((token) => token.word)).toEqual(["ねこ"]);
  });

  test("On Device never falls back: the download failure is the error", async () => {
    const { module } = fakePackModule({ failInstall: true });
    setMobileJapaneseLearningNativeModuleForTesting(module);
    setMobileJapaneseLearningEnginePreference("onDevice");
    let fetched = 0;
    await expect(
      runMobileJapaneseLearningGrammar("ねこ", {
        fetchImpl: (async () => {
          fetched += 1;
          return new Response("{}");
        }) as unknown as typeof fetch,
        normalizeText: async (text) => ({ normalized: text, properNouns: [] }),
      }),
    ).rejects.toThrow("offline");
    expect(fetched).toBe(0);
  });

  test("Automatic signed out never falls back to the cloud: the download failure is the error", async () => {
    const { module, calls } = fakePackModule({ failInstall: true });
    setMobileJapaneseLearningNativeModuleForTesting(module);
    setMobileJapaneseLearningEnginePreference("auto");
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => "");
    let fetched = 0;
    let normalized = 0;
    try {
      await expect(
        runMobileJapaneseLearningGrammar("ねこ", {
          fetchImpl: (async () => {
            fetched += 1;
            return new Response("{}");
          }) as unknown as typeof fetch,
          normalizeText: async (text) => {
            normalized += 1;
            return { normalized: text, properNouns: [] };
          },
        }),
      ).rejects.toThrow("offline");
    } finally {
      setMobileJapaneseLearningAuthCookieReaderForTesting(() => "nemu.session_token=test");
    }
    expect(calls.install).toBe(1);
    expect(fetched).toBe(0);
    expect(normalized).toBe(0);
  });

  test("Cloud signed out asks for sign-in before any request", async () => {
    setMobileJapaneseLearningEnginePreference("cloud");
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => "");
    let requests = 0;
    try {
      await expect(
        runMobileJapaneseLearningGrammar("ねこ", {
          fetchImpl: (async () => {
            requests += 1;
            return new Response("{}");
          }) as unknown as typeof fetch,
          normalizeText: async (text) => {
            requests += 1;
            return { normalized: text, properNouns: [] };
          },
        }),
      ).rejects.toThrow("auth_required");
    } finally {
      setMobileJapaneseLearningAuthCookieReaderForTesting(() => "nemu.session_token=test");
    }
    expect(requests).toBe(0);
  });
});
