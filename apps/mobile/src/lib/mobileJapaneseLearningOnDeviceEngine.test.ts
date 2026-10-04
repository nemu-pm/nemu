import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/japanese-learning-ichiran/segment-contract.json";
import type {
  NemuAnalysisStatus,
  NemuJapaneseLearningCapabilities,
  NemuJapaneseLearningNativeModule,
  NemuRecognizeImageResult,
} from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import {
  MobileJapaneseLearningEngineUnavailableError,
  getMobileJapaneseLearningEngineRuns,
  normalizeMobileJapaneseLearningEnginePreference,
  resolveMobileJapaneseLearningAnalysisEngine,
  resolveMobileJapaneseLearningOcrEngine,
  setMobileJapaneseLearningEnginePreference,
  setMobileJapaneseLearningNativeModuleForTesting,
} from "./mobileJapaneseLearningEngine";
import {
  convertMobileIchiranSegments,
  runMobileJapaneseLearningGrammar,
  type MobileGrammarToken,
} from "./mobileJapaneseLearningGrammar";
import { runMobileJapaneseLearningOcr } from "./mobileJapaneseLearningOcr";
import {
  MOBILE_ICHIRAN_PACK_RELEASE,
  chunkMobileIchiranInput,
} from "./mobileJapaneseLearningOnDeviceAnalysis";
import {
  clearMobileOnDeviceOcrCache,
  makeMobileOnDeviceOcrCacheKey,
  runMobileOnDeviceOcr,
} from "./mobileJapaneseLearningOnDeviceOcr";
import { setMobileJapaneseLearningAuthCookieReaderForTesting } from "./mobileJapaneseLearningAuth";

// Cloud paths are server features: these tests run signed in.
beforeAll(() => setMobileJapaneseLearningAuthCookieReaderForTesting(() => "nemu.session_token=test"));
afterAll(() => setMobileJapaneseLearningAuthCookieReaderForTesting(undefined));

type Sample = {
  text: string;
  cloudSegments: unknown[];
  onDeviceSegments: unknown[];
};
const samples = (fixture as { samples: Sample[] }).samples;

function capabilities(
  overrides: { ocr?: boolean; kernel?: boolean } = {},
): NemuJapaneseLearningCapabilities {
  return {
    platform: "ios",
    osVersion: "27.1.0",
    ocr: {
      available: overrides.ocr ?? true,
      engine: "apple-vision",
      engineRevision: "RecognizeTextRequest.revision3",
      textDirection: true,
    },
    analysis: {
      kernelLinked: overrides.kernel ?? true,
      engine: "ichiran-rust",
      abiVersion: 5,
    },
  };
}

type FakeCalls = {
  recognize: string[];
  cancelRecognition: string[];
  analyze: string[];
  install: Array<[string, string]>;
};

function fakeModule(
  options: {
    installed?: boolean;
    recognize?: (uri: string) => NemuRecognizeImageResult;
    segmentsFor?: (text: string) => unknown[];
    caps?: NemuJapaneseLearningCapabilities;
  } = {},
): { module: NemuJapaneseLearningNativeModule; calls: FakeCalls } {
  const calls: FakeCalls = { recognize: [], cancelRecognition: [], analyze: [], install: [] };
  let installed = options.installed ?? true;
  const status = (): NemuAnalysisStatus => ({
    kernelLinked: true,
    abiVersion: 5,
    installed,
    installing: false,
    ...(installed
      ? {
          packVersion: MOBILE_ICHIRAN_PACK_RELEASE.packVersion,
          manifestSha256: MOBILE_ICHIRAN_PACK_RELEASE.manifestSha256,
        }
      : {}),
  });
  const module: NemuJapaneseLearningNativeModule = {
    getCapabilities: () => options.caps ?? capabilities(),
    recognizeImage: async (uri) => {
      calls.recognize.push(uri);
      return options.recognize!(uri);
    },
    cancelRecognition: async (id) => {
      calls.cancelRecognition.push(id);
      return true;
    },
    getAnalysisStatus: async () => status(),
    installAnalysisPack: async (url, sha) => {
      calls.install.push([url, sha]);
      installed = true;
      return status();
    },
    removeAnalysisPack: async () => {
      installed = false;
    },
    analyzeText: async (text) => {
      calls.analyze.push(text);
      return {
        segmentsJson: JSON.stringify(options.segmentsFor!(text)),
        packVersion: MOBILE_ICHIRAN_PACK_RELEASE.packVersion,
        engine: "ichiran-rust",
        abiVersion: 5,
        openMs: 1,
        elapsedMs: 2,
      };
    },
    cancelAnalysis: async () => true,
    romanizeText: async (text) => text,
    addListener: () => ({ remove() {} }),
  };
  return { module, calls };
}

afterEach(() => {
  setMobileJapaneseLearningNativeModuleForTesting(undefined);
  setMobileJapaneseLearningEnginePreference("auto");
  clearMobileOnDeviceOcrCache();
});

/** Everything the grammar UI renders except dictionary gloss wording. */
function shape(token: MobileGrammarToken): unknown {
  return {
    word: token.word,
    reading: token.reading,
    partOfSpeech: token.partOfSpeech,
    conjugationTypes: token.conjugationTypes ?? [],
    hasMeanings: token.meanings.length > 0,
    conjugations: token.conjugations.map(shape),
    alternatives: token.alternatives.map(shape),
    components: token.components.map(shape),
  };
}

describe("engine selection", () => {
  test("normalizes unknown setting values to auto", () => {
    expect(normalizeMobileJapaneseLearningEnginePreference(undefined)).toBe("auto");
    expect(normalizeMobileJapaneseLearningEnginePreference("cloud")).toBe("cloud");
    expect(normalizeMobileJapaneseLearningEnginePreference("gpu")).toBe("auto");
  });

  test("auto prefers on-device and falls back to cloud only when unsupported", () => {
    expect(resolveMobileJapaneseLearningOcrEngine("auto", capabilities())).toBe("on-device");
    expect(resolveMobileJapaneseLearningOcrEngine("auto", capabilities({ ocr: false }))).toBe("cloud");
    expect(resolveMobileJapaneseLearningOcrEngine("auto", null)).toBe("cloud");
    expect(resolveMobileJapaneseLearningAnalysisEngine("auto", capabilities())).toBe("on-device");
    expect(
      resolveMobileJapaneseLearningAnalysisEngine("auto", capabilities({ kernel: false })),
    ).toBe("cloud");
  });

  test("cloud is an explicit choice and on-device never silently uploads", () => {
    expect(resolveMobileJapaneseLearningOcrEngine("cloud", capabilities())).toBe("cloud");
    expect(() => resolveMobileJapaneseLearningOcrEngine("onDevice", null)).toThrow(
      MobileJapaneseLearningEngineUnavailableError,
    );
    expect(() =>
      resolveMobileJapaneseLearningAnalysisEngine("onDevice", capabilities({ kernel: false })),
    ).toThrow(MobileJapaneseLearningEngineUnavailableError);
  });
});

describe("on-device analysis contract (recorded cloud vs Rust outputs)", () => {
  test("fixture covers the recorded sample set", () => {
    expect(samples.length).toBeGreaterThanOrEqual(12);
  });

  for (const sample of samples) {
    test(`maps「${sample.text}」to the same grammar token shape as the cloud`, () => {
      const cloud = convertMobileIchiranSegments(sample.cloudSegments as never);
      const onDevice = convertMobileIchiranSegments(sample.onDeviceSegments as never);
      expect(onDevice.length).toBeGreaterThan(0);
      expect(onDevice.map(shape)).toEqual(cloud.map(shape));
    });
  }

  test("runs the on-device analyzer without normalize, installing the pack on first use", async () => {
    const sample = samples.find((item) => item.text === "先生、お願いします。")!;
    const { module, calls } = fakeModule({
      installed: false,
      segmentsFor: () => sample.onDeviceSegments,
    });
    setMobileJapaneseLearningNativeModuleForTesting(module);
    const stages: string[] = [];
    let normalized = 0;
    let fetched = 0;
    const result = await runMobileJapaneseLearningGrammar(sample.text, {
      onStage: (stage) => stages.push(stage),
      normalizeText: async (text) => {
        normalized += 1;
        return { normalized: text, properNouns: [] };
      },
      fetchImpl: (async () => {
        fetched += 1;
        throw new Error("no network in on-device mode");
      }) as unknown as typeof fetch,
    });
    expect(result.engine).toBe("on-device");
    expect(result.normalizedText).toBe(sample.text);
    expect(result.tokens).toEqual(convertMobileIchiranSegments(sample.onDeviceSegments as never));
    expect(stages).toEqual(["tokenizing"]);
    expect(normalized).toBe(0);
    expect(fetched).toBe(0);
    expect(calls.install).toEqual([
      [MOBILE_ICHIRAN_PACK_RELEASE.manifestUrl, MOBILE_ICHIRAN_PACK_RELEASE.manifestSha256],
    ]);
    expect(calls.analyze).toEqual([sample.text]);
    expect(
      getMobileJapaneseLearningEngineRuns().some(
        (run) => run.stage === "analysis" && run.engine === "on-device" && run.ok,
      ),
    ).toBe(true);
  });

  test("online enhance opts back into the normalize step", async () => {
    const sample = samples[0]!;
    const { module } = fakeModule({ segmentsFor: () => sample.onDeviceSegments });
    setMobileJapaneseLearningNativeModuleForTesting(module);
    const stages: string[] = [];
    await runMobileJapaneseLearningGrammar(sample.text, {
      onlineEnhance: true,
      onStage: (stage) => stages.push(stage),
      normalizeText: async (text) => ({ normalized: text, properNouns: [] }),
    });
    expect(stages).toEqual(["normalizing", "tokenizing"]);
  });

  test("chunks long input at sentence boundaries without losing text", () => {
    const text = "あ".repeat(3000) + "。" + "い".repeat(3000) + "\n" + "う".repeat(100);
    const chunks = chunkMobileIchiranInput(text, 3800);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= 3800)).toBe(true);
    expect(chunks[0]!.endsWith("。")).toBe(true);
  });
});

function nativePage(
  width: number,
  height: number,
  lines: NemuRecognizeImageResult["lines"],
): NemuRecognizeImageResult {
  return {
    engine: "apple-vision",
    engineRevision: "RecognizeTextRequest.revision3",
    osVersion: "27.1.0",
    width,
    height,
    orientation: 1,
    languages: ["ja-Jpan-JP"],
    textDirectionSupported: true,
    recognizeMs: 12,
    elapsedMs: 15,
    lines,
  };
}

function nativeColumn(text: string, x: number, y: number, glyph = 30) {
  return {
    text,
    confidence: 1,
    box: { x1: x, y1: y, x2: x + glyph, y2: y + glyph * text.length },
    quad: [],
    direction: "topToBottom" as const,
    characterBoxes: Array.from(text).map(
      (_, index) =>
        [x, y + index * glyph, x + glyph, y + (index + 1) * glyph] as [
          number,
          number,
          number,
          number,
        ],
    ),
  };
}

describe("on-device OCR", () => {
  test("recognizes the reader's local file and emits the cloud detection contract", async () => {
    const { module, calls } = fakeModule({
      recognize: () =>
        nativePage(1000, 1400, [nativeColumn("かり", 140, 110), nativeColumn("わ", 180, 100), nativeColumn("本当", 800, 150)]),
    });
    setMobileJapaneseLearningNativeModuleForTesting(module);
    let fetched = 0;
    const result = await runMobileJapaneseLearningOcr(
      { imageUri: "file:///cache/page-1.jpg", headers: undefined, text: undefined },
      {
        fetchImpl: (async () => {
          fetched += 1;
          throw new Error("must not upload");
        }) as unknown as typeof fetch,
      },
    );
    expect(fetched).toBe(0);
    expect(calls.recognize).toEqual(["file:///cache/page-1.jpg"]);
    expect(result.source).toBe("ocr");
    expect(result.engine?.kind).toBe("on-device");
    expect(result.detections.map((detection) => [detection.order, detection.text])).toEqual([
      [0, "本当"],
      [1, "わかり"],
    ]);
    expect(result.text).toBe("本当\nわかり");
  });

  test("re-reads Japanese blocks on upscaled crops and keeps boxes and order", async () => {
    const { module } = fakeModule({
      recognize: () =>
        nativePage(1000, 1400, [
          { ...nativeColumn("雄かに俺は男だよ", 800, 150), confidence: 0.42 },
          { ...nativeColumn("本当", 140, 110), confidence: 0.5 },
          // Already read with full confidence: not re-read.
          nativeColumn("はい", 400, 900),
        ]),
    });
    const regionCalls: Array<Array<[number, number, number, number]>> = [];
    module.recognizeRegions = async (_uri, regions) => {
      regionCalls.push(regions);
      return {
        ...nativePage(1000, 1400, []),
        regions: regions.map((region, index) => ({
          scale: 3,
          lines: index === 0 ? [nativeColumn("確かに俺は男だよ", region[0], region[1])] : [],
        })),
      };
    };
    setMobileJapaneseLearningNativeModuleForTesting(module);
    const result = await runMobileJapaneseLearningOcr(
      { imageUri: "file:///cache/page-2.jpg", headers: undefined, text: undefined },
    );
    expect(regionCalls).toHaveLength(1);
    expect(regionCalls[0]).toHaveLength(2);
    expect(result.detections.map((detection) => [detection.order, detection.text])).toEqual([
      [0, "確かに俺は男だよ"],
      // An empty second read keeps the first pass.
      [1, "本当"],
      [2, "はい"],
    ]);
    expect(result.detections[0]).toMatchObject({ x1: 800, y1: 150 });
  });

  test("keeps the first pass when the region pass fails", async () => {
    const { module } = fakeModule({
      recognize: () => nativePage(1000, 1400, [nativeColumn("本当", 140, 110)]),
    });
    module.recognizeRegions = async () => {
      throw new Error("vision busy");
    };
    setMobileJapaneseLearningNativeModuleForTesting(module);
    const result = await runMobileJapaneseLearningOcr(
      { imageUri: "file:///cache/page-3.jpg", headers: undefined, text: undefined },
    );
    expect(result.detections.map((detection) => detection.text)).toEqual(["本当"]);
  });

  test("stitches long-strip tiles into page coordinates", async () => {
    const { module } = fakeModule({
      recognize: (uri) =>
        uri.endsWith("0.png")
          ? nativePage(800, 1000, [nativeColumn("上", 400, 100)])
          : nativePage(800, 1000, [nativeColumn("下", 400, 100)]),
    });
    const result = await runMobileOnDeviceOcr(
      { imageUri: "https://example.test/strip.jpg" },
      {
        signal: new AbortController().signal,
        module,
        resolveImage: async () => ({
          identity: "strip",
          tiles: [
            { fileUri: "file:///tiles/0.png", offsetX: 0, offsetY: 0 },
            { fileUri: "file:///tiles/1.png", offsetX: 0, offsetY: 1000 },
          ],
        }),
      },
    );
    expect(result.detections.map((detection) => [detection.text, detection.y1])).toEqual([
      ["上", 100],
      ["下", 1100],
    ]);
  });

  test("caches by engine, OS version and image identity", async () => {
    const { module, calls } = fakeModule({
      recognize: () => nativePage(100, 100, [nativeColumn("字", 10, 10)]),
    });
    const options = {
      signal: new AbortController().signal,
      module,
      resolveImage: async () => ({
        identity: "page-a",
        tiles: [{ fileUri: "file:///a.jpg", offsetX: 0, offsetY: 0 }],
      }),
    };
    const first = await runMobileOnDeviceOcr({ imageUri: "file:///a.jpg" }, options);
    const second = await runMobileOnDeviceOcr({ imageUri: "file:///a.jpg" }, options);
    expect(calls.recognize).toHaveLength(1);
    expect(first.engine.cached).toBe(false);
    expect(second.engine.cached).toBe(true);
    expect(
      makeMobileOnDeviceOcrCacheKey(
        { engine: "apple-vision", engineRevision: "r3", osVersion: "27.1.0" },
        "page-a",
      ),
    ).not.toBe(
      makeMobileOnDeviceOcrCacheKey(
        { engine: "apple-vision", engineRevision: "r3", osVersion: "27.2.0" },
        "page-a",
      ),
    );
  });

  test("cancels the native request when the reader aborts", async () => {
    let release: (() => void) | null = null;
    const { module, calls } = fakeModule({});
    module.recognizeImage = (uri, options) => {
      calls.recognize.push(`${uri}#${options?.requestId}`);
      return new Promise((resolve) => {
        release = () => resolve(nativePage(10, 10, []));
      });
    };
    const controller = new AbortController();
    const pending = runMobileOnDeviceOcr(
      { imageUri: "file:///slow.jpg" },
      {
        signal: controller.signal,
        module,
        resolveImage: async () => ({
          identity: "slow",
          tiles: [{ fileUri: "file:///slow.jpg", offsetX: 0, offsetY: 0 }],
        }),
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(new Error("page changed"));
    await expect(pending).rejects.toThrow();
    expect(calls.cancelRecognition).toHaveLength(1);
    expect(calls.recognize[0]).toContain(calls.cancelRecognition[0]!);
    (release as (() => void) | null)?.();
  });

  test("an explicit cloud preference keeps the cloud OCR service", async () => {
    const { module, calls } = fakeModule({ recognize: () => nativePage(1, 1, []) });
    setMobileJapaneseLearningNativeModuleForTesting(module);
    setMobileJapaneseLearningEnginePreference("cloud");
    const body = `data: ${JSON.stringify({ type: "result", detections: [] })}\n\n`;
    const result = await runMobileJapaneseLearningOcr(
      { imageUri: "data:image/png;base64,iVBORw0KGgo=", headers: undefined, text: undefined },
      {
        fetchImpl: (async () => new Response(body, { status: 200 })) as unknown as typeof fetch,
      },
    );
    expect(calls.recognize).toHaveLength(0);
    expect(result.engine?.kind).toBe("cloud");
  });
});

describe("engine setting", () => {
  test("the plugin schema exposes the engine select and feeds the engine layer", async () => {
    const { getMobileReaderPlugin } = await import("./mobileReaderPlugins");
    const { syncMobileJapaneseLearningEnginePreference } = await import(
      "./mobileJapaneseLearningEngineSettings"
    );
    const { getMobileJapaneseLearningEnginePreference } = await import(
      "./mobileJapaneseLearningEngine"
    );
    const plugin = getMobileReaderPlugin("japanese-learning")!;
    const item = plugin.settings
      .flatMap((setting) => ("items" in setting ? setting.items ?? [] : []))
      .find((setting) => setting.key === "recognitionEngine") as
      | { values?: string[]; default?: unknown }
      | undefined;
    expect(item?.values).toEqual(["auto", "onDevice", "cloud"]);
    expect(item?.default).toBe("auto");
    syncMobileJapaneseLearningEnginePreference([
      { id: "japanese-learning", values: { recognitionEngine: "cloud" } },
    ]);
    expect(getMobileJapaneseLearningEnginePreference()).toBe("cloud");
    syncMobileJapaneseLearningEnginePreference([]);
    expect(getMobileJapaneseLearningEnginePreference()).toBe("auto");
  });
});
