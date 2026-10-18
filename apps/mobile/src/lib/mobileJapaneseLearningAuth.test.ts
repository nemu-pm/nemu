import { afterEach, describe, expect, test } from "bun:test";
import type { NemuJapaneseLearningCapabilities } from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import {
  hasMobileAuthSessionCookie,
  isMobileJapaneseLearningSignedIn,
  isMobileJapaneseLearningSignInRequiredError,
  MobileJapaneseLearningSignInRequiredError,
  setMobileJapaneseLearningAuthCookieReaderForTesting,
} from "./mobileJapaneseLearningAuth";
import {
  MobileJapaneseLearningEngineUnavailableError,
  resolveMobileJapaneseLearningAnalysisEngine,
  resolveMobileJapaneseLearningOcrEngine,
  setMobileJapaneseLearningEnginePreference,
  setMobileJapaneseLearningNativeModuleForTesting,
} from "./mobileJapaneseLearningEngine";
import { runMobileJapaneseLearningChat } from "./mobileJapaneseLearningChat";
import { getMobileStrings } from "./mobileI18n";
import {
  describeJapaneseLearningOcrError,
  runMobileJapaneseLearningOcr,
} from "./mobileJapaneseLearningOcr";
import { mobileJapaneseLearningAnalysisErrorText } from "./mobileJapaneseLearningReaderHelpers";
import { generateMobileJapaneseLearningTts } from "./mobileJapaneseLearningTts";
import {
  applyMobileReaderPluginSignInState,
  getMobileReaderPluginStates,
} from "./mobileReaderPlugins";
import type { SourcePackageSetting } from "@/data/schema";

const en = getMobileStrings("en");
const SIGNED_IN = "nemu.session_token=abc.def";

function capabilities(options: { ocr?: boolean; kernel?: boolean } = {}): NemuJapaneseLearningCapabilities {
  return {
    platform: "ios",
    osVersion: "27.1.0",
    ocr: { available: options.ocr ?? true, engine: "apple-vision", engineRevision: "r3", textDirection: true },
    analysis: { kernelLinked: options.kernel ?? true, engine: "ichiran-rust", abiVersion: 5 },
  };
}

function countingFetch() {
  const state = { calls: 0 };
  const fetchImpl = (async () => {
    state.calls += 1;
    return new Response("{}");
  }) as unknown as typeof fetch;
  return { state, fetchImpl };
}

afterEach(() => {
  setMobileJapaneseLearningAuthCookieReaderForTesting(undefined);
  setMobileJapaneseLearningNativeModuleForTesting(undefined);
  setMobileJapaneseLearningEnginePreference("auto");
});

describe("session cookie", () => {
  test("only a non-empty session token counts as signed in", () => {
    expect(hasMobileAuthSessionCookie("nemu.session_token=abc")).toBe(true);
    expect(hasMobileAuthSessionCookie("__Secure-nemu.session_token=abc; nemu.convex_jwt=x")).toBe(true);
    expect(hasMobileAuthSessionCookie("; better-auth.session_token=token")).toBe(true);
    expect(hasMobileAuthSessionCookie("")).toBe(false);
    expect(hasMobileAuthSessionCookie(null)).toBe(false);
    expect(hasMobileAuthSessionCookie("nemu.session_token=")).toBe(false);
    expect(hasMobileAuthSessionCookie("nemu.oauth_state=xyz")).toBe(false);
    expect(hasMobileAuthSessionCookie("nemu.session_token_backup=abc")).toBe(false);
  });

  test("reads the injected cookie jar", () => {
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => SIGNED_IN);
    expect(isMobileJapaneseLearningSignedIn()).toBe(true);
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => "");
    expect(isMobileJapaneseLearningSignedIn()).toBe(false);
  });

  test("the sign-in error keeps the server's 401 message", () => {
    const error = new MobileJapaneseLearningSignInRequiredError();
    expect(error.message).toBe("auth_required");
    expect(isMobileJapaneseLearningSignInRequiredError(error)).toBe(true);
    expect(isMobileJapaneseLearningSignInRequiredError(new Error("auth_required"))).toBe(true);
    expect(isMobileJapaneseLearningSignInRequiredError(new Error("offline"))).toBe(false);
  });
});

describe("engine selection signed out", () => {
  test("Automatic stays on-device when the device can do it", () => {
    expect(resolveMobileJapaneseLearningOcrEngine("auto", capabilities(), false)).toBe("on-device");
    expect(resolveMobileJapaneseLearningAnalysisEngine("auto", capabilities(), false)).toBe("on-device");
    expect(resolveMobileJapaneseLearningOcrEngine("onDevice", capabilities(), false)).toBe("on-device");
  });

  test("a run only the cloud can serve asks for sign-in", () => {
    expect(() => resolveMobileJapaneseLearningOcrEngine("cloud", capabilities(), false)).toThrow("auth_required");
    expect(() => resolveMobileJapaneseLearningOcrEngine("auto", capabilities({ ocr: false }), false)).toThrow(
      MobileJapaneseLearningSignInRequiredError,
    );
    expect(() => resolveMobileJapaneseLearningAnalysisEngine("cloud", capabilities(), false)).toThrow(
      "auth_required",
    );
    expect(() =>
      resolveMobileJapaneseLearningAnalysisEngine("auto", capabilities({ kernel: false }), false),
    ).toThrow(MobileJapaneseLearningSignInRequiredError);
    // On Device keeps its own error: sign-in would not help.
    expect(() => resolveMobileJapaneseLearningOcrEngine("onDevice", null, false)).toThrow(
      MobileJapaneseLearningEngineUnavailableError,
    );
  });

  test("signed in, the cloud stays available", () => {
    expect(resolveMobileJapaneseLearningOcrEngine("cloud", capabilities(), true)).toBe("cloud");
    expect(resolveMobileJapaneseLearningOcrEngine("auto", null, true)).toBe("cloud");
  });
});

describe("server features send nothing signed out", () => {
  test("cloud OCR never uploads the page", async () => {
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => "");
    setMobileJapaneseLearningNativeModuleForTesting(null);
    const { state, fetchImpl } = countingFetch();
    for (const engine of ["cloud", "auto"] as const) {
      await expect(
        runMobileJapaneseLearningOcr(
          { imageUri: "data:image/png;base64,iVBORw0KGgo=" },
          { engine, fetchImpl },
        ),
      ).rejects.toThrow("auth_required");
    }
    expect(state.calls).toBe(0);
  });

  test("source text needs no service and works signed out", async () => {
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => "");
    const result = await runMobileJapaneseLearningOcr({ text: "ねこ" }, { engine: "cloud" });
    expect(result).toMatchObject({ source: "source-text", text: "ねこ" });
  });

  test("Listen asks for sign-in; an already cached clip still plays", async () => {
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => "");
    const { state, fetchImpl } = countingFetch();
    await expect(
      generateMobileJapaneseLearningTts("ねこ", {
        fetchImpl,
        readCachedWavFile: async () => null,
        writeWavFile: async () => "file:///never.wav",
      }),
    ).rejects.toThrow("auth_required");
    expect(state.calls).toBe(0);
    const cached = await generateMobileJapaneseLearningTts("ねこ", {
      fetchImpl,
      readCachedWavFile: async () => "file:///cached.wav",
    });
    expect(cached.uri).toBe("file:///cached.wav");
    expect(state.calls).toBe(0);
  });

  test("Nemu Chat asks for sign-in with the shared cookie jar", async () => {
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => "nemu.oauth_state=stale");
    const { state, fetchImpl } = countingFetch();
    await expect(
      runMobileJapaneseLearningChat({
        appLanguage: "en",
        chapter: { id: "c1", title: "Chapter 1" } as never,
        fetchImpl,
        mangaTitle: "Example",
        pageCount: 1,
        pageNumber: 1,
        siteUrl: "https://convex.example.site/",
      }),
    ).rejects.toThrow("auth_required");
    expect(state.calls).toBe(0);
  });
});

describe("sign-in prompts", () => {
  test("cloud OCR signed out reads as a sign-in prompt, not a failure", () => {
    for (const detail of ["auth_required", en.reader.pluginJapaneseLearningSignInRequired]) {
      expect(describeJapaneseLearningOcrError(detail, en)).toEqual({
        kind: "signIn",
        title: en.reader.pluginJapaneseLearningSignInRequiredTitle,
        description: en.reader.pluginJapaneseLearningSignInRequiredDescription,
        diagnostic: null,
      });
    }
    expect(describeJapaneseLearningOcrError("OCR /ocr failed: 521", en).kind).toBe("unavailable");
  });

  test("the sentence view's analysis error", () => {
    const base = { detail: "x", packFailed: true, strings: en };
    expect(
      mobileJapaneseLearningAnalysisErrorText({
        ...base,
        detail: en.reader.pluginJapaneseLearningSignInRequired,
        preference: "cloud",
        signedIn: false,
      }),
    ).toBe(en.reader.pluginJapaneseLearningSignInRequired);
    // Automatic signed out has no cloud fallback: a pack failure is the pack's.
    expect(mobileJapaneseLearningAnalysisErrorText({ ...base, preference: "auto", signedIn: false })).toBe(
      en.japaneseLearningDictionary.analysisDownloadFailed,
    );
    expect(mobileJapaneseLearningAnalysisErrorText({ ...base, preference: "auto", signedIn: true })).toBe(
      en.reader.pluginJapaneseLearningGrammarFailed,
    );
    expect(mobileJapaneseLearningAnalysisErrorText({ ...base, preference: "onDevice", signedIn: true })).toBe(
      en.japaneseLearningDictionary.analysisDownloadFailed,
    );
  });
});

describe("plugin settings signed out", () => {
  const plugin = getMobileReaderPluginStates(
    {
      readerPlugins: {
        "japanese-learning": { enabled: true, values: { onlineOcrAssist: true, autoDetect: true } },
      },
    } as never,
    en,
  ).find((item) => item.id === "japanese-learning")!;

  // The rows the shared settings card (`MobileReaderPluginSettingsCard`)
  // draws, groups flattened.
  function leafSettings(settings: SourcePackageSetting[]): SourcePackageSetting[] {
    return settings.flatMap((setting) =>
      Array.isArray(setting.items) ? leafSettings(setting.items) : [setting],
    );
  }

  function assistRow(signedIn: boolean) {
    const state = applyMobileReaderPluginSignInState(plugin, signedIn, en);
    const row = leafSettings(state.settings).find((item) => item.key === "onlineOcrAssist")!;
    return { state, row };
  }

  test("the online assist switch stays visible, disabled and off, with the hint", () => {
    const { state, row } = assistRow(false);
    expect(row.type).toBe("switch");
    expect(row.disabled).toBe(true);
    expect(state.values.onlineOcrAssist).toBe(false);
    expect(row.subtitle?.startsWith(en.reader.pluginJapaneseLearningSignInToUse)).toBe(true);
    // Only the server feature is locked; the stored choice is kept.
    expect(state.values.autoDetect).toBe(true);
    expect(plugin.values.onlineOcrAssist).toBe(true);
    const others = leafSettings(state.settings).filter((item) => item.key !== "onlineOcrAssist");
    expect(others.some((item) => item.disabled)).toBe(false);
  });

  test("signed in, nothing changes", () => {
    const { state, row } = assistRow(true);
    expect(state).toBe(plugin);
    expect(row.disabled).toBeUndefined();
    expect(state.values.onlineOcrAssist).toBe(true);
  });

  test("hint is localized", () => {
    expect(getMobileStrings("ja").reader.pluginJapaneseLearningSignInToUse).not.toBe(
      en.reader.pluginJapaneseLearningSignInToUse,
    );
    expect(getMobileStrings("zh").reader.pluginJapaneseLearningSignInToUse).not.toBe(
      en.reader.pluginJapaneseLearningSignInToUse,
    );
  });
});
