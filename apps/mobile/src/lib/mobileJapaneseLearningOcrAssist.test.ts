import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
  NemuJapaneseLearningCapabilities,
  NemuJapaneseLearningNativeModule,
  NemuOcrPageBlock,
  NemuRecognizePageResult,
} from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import {
  setMobileJapaneseLearningEnginePreference,
  setMobileJapaneseLearningNativeModuleForTesting,
  setMobileJapaneseLearningOcrAssist,
  isMobileJapaneseLearningOcrAssistActive,
} from "./mobileJapaneseLearningEngine";
import {
  clearMobileOcrAssistCache,
  runMobileJapaneseLearningOcr,
  type MobileOcrDetection,
} from "./mobileJapaneseLearningOcr";
import {
  applyMobileOcrAssist,
  mobileOcrAssistSpacesAgree,
  restoreMobileOcrSymbols,
  selectMobileOcrAssistTargets,
} from "./mobileJapaneseLearningOcrAssist";
import { clearMobileOnDeviceOcrCache } from "./mobileJapaneseLearningOnDeviceOcr";
import { setMobileJapaneseLearningAuthCookieReaderForTesting } from "./mobileJapaneseLearningAuth";

// Cloud paths are server features: these tests run signed in.
beforeAll(() => setMobileJapaneseLearningAuthCookieReaderForTesting(() => "nemu.session_token=test"));
afterAll(() => setMobileJapaneseLearningAuthCookieReaderForTesting(undefined));

function detection(
  order: number,
  text: string,
  box: [number, number, number, number],
  label: MobileOcrDetection["label"] = "ja",
): MobileOcrDetection {
  return { x1: box[0], y1: box[1], x2: box[2], y2: box[3], conf: 0.9, cls: 1, label, order, text };
}

describe("online OCR assist: routing rules", () => {
  const onDevice = [
    detection(0, "王都が見えてきたね。", [700, 100, 760, 300]),
    detection(1, "先生は私の弟子オフィオー", [100, 900, 615, 949]),
    detection(2, "Ｇｏｍｕｒａｗ", [10, 10, 90, 30], "eng"),
  ];

  test("targets only Japanese blocks under the confidence threshold", () => {
    expect(selectMobileOcrAssistTargets(onDevice, [0.99, 0.41, 0.2])).toEqual([1]);
    expect(selectMobileOcrAssistTargets(onDevice, [0.95, 0.9, 0.2])).toEqual([]);
    // Older binaries report no recognition confidence: nothing is routed.
    expect(selectMobileOcrAssistTargets(onDevice, undefined)).toEqual([]);
    expect(selectMobileOcrAssistTargets(onDevice, [null, null, null])).toEqual([]);
    expect(selectMobileOcrAssistTargets(onDevice, [0.1])).toEqual([]);
  });

  test("a routed block takes the overlapping cloud text in cloud order; others keep theirs", () => {
    const cloud = [
      detection(1, "全61巻絶賛発売中!!", [360, 902, 612, 950]),
      detection(0, "『史上最強の弟子ケンイチ』", [98, 900, 358, 950]),
      detection(2, "王都が...", [700, 100, 760, 300]),
    ];
    const { detections, replaced } = applyMobileOcrAssist(onDevice, [1], cloud);
    expect(replaced).toBe(1);
    expect(detections[1]!.text).toBe("『史上最強の弟子ケンイチ』全61巻絶賛発売中!!");
    expect(detections[1]!.x1).toBe(100);
    expect(detections[0]!.text).toBe("王都が見えてきたね。");
    expect(detections[2]).toBe(onDevice[2]);
  });

  test("a routed block no cloud box covers keeps its on-device text", () => {
    const cloud = [detection(0, "別の吹き出し", [100, 1000, 200, 1100])];
    const { detections, replaced } = applyMobileOcrAssist(onDevice, [1], cloud);
    expect(replaced).toBe(0);
    expect(detections[1]!.text).toBe(onDevice[1]!.text);
  });

  test("cloud boxes in another pixel space are rejected", () => {
    const same = [detection(0, "a", [705, 110, 755, 290]), detection(1, "b", [110, 905, 600, 945])];
    expect(mobileOcrAssistSpacesAgree(onDevice, same, { width: 900, height: 1280 })).toBe(true);
    const doubled = same.map((item) => ({ ...item, x1: item.x1 * 2, y1: item.y1 * 2, x2: item.x2 * 2, y2: item.y2 * 2 }));
    expect(mobileOcrAssistSpacesAgree(onDevice, doubled, { width: 900, height: 1280 })).toBe(false);
    const halved = same.map((item) => ({ ...item, x1: item.x1 / 2, y1: item.y1 / 2, x2: item.x2 / 2, y2: item.y2 / 2 }));
    expect(mobileOcrAssistSpacesAgree(onDevice, halved)).toBe(false);
    expect(mobileOcrAssistSpacesAgree(onDevice, [])).toBe(false);
  });

  test("restores typeset punctuation like the cloud service", () => {
    expect(restoreMobileOcrSymbols("金...金...金...")).toBe("金…金…金…");
    expect(restoreMobileOcrSymbols("・・・なるほど")).toBe("…なるほど");
    expect(restoreMobileOcrSymbols("ポチタ～")).toBe("ポチタ〜");
    expect(restoreMobileOcrSymbols("末――")).toBe("末──");
    expect(restoreMobileOcrSymbols("元・殺し屋 2018.W杯 ラーメン")).toBe("元・殺し屋 2018.W杯 ラーメン");
    expect(restoreMobileOcrSymbols(restoreMobileOcrSymbols("え......！？"))).toBe("え……！？");
  });

  test("is opt-in and only with the automatic engine", () => {
    setMobileJapaneseLearningOcrAssist(undefined);
    expect(isMobileJapaneseLearningOcrAssistActive("auto")).toBe(false);
    setMobileJapaneseLearningOcrAssist(true);
    expect(isMobileJapaneseLearningOcrAssistActive("auto")).toBe(true);
    expect(isMobileJapaneseLearningOcrAssistActive("onDevice")).toBe(false);
    expect(isMobileJapaneseLearningOcrAssistActive("cloud")).toBe(false);
    setMobileJapaneseLearningOcrAssist("yes");
    expect(isMobileJapaneseLearningOcrAssistActive("auto")).toBe(false);
  });
});

function capabilities(): NemuJapaneseLearningCapabilities {
  return {
    platform: "ios",
    osVersion: "27.1.0",
    ocr: {
      available: true,
      engine: "apple-vision",
      engineRevision: "RecognizeTextRequest.revision3",
      textDirection: true,
      pipeline: {
        mangaOcr: true,
        detector: "ogkalu-test",
        engine: "manga-ocr-coreml",
        engineRevision: "manga-ocr-test+ogkalu-test+p2",
        computeUnits: "encoder=cpu,decoder=cpu",
      },
    },
    analysis: { kernelLinked: false, engine: "ichiran-rust", abiVersion: 5 },
  };
}

function pageBlock(order: number, text: string, box: [number, number, number, number], recConf?: number): NemuOcrPageBlock {
  return {
    order,
    x1: box[0],
    y1: box[1],
    x2: box[2],
    y2: box[3],
    label: "unknown",
    conf: 0.7,
    text,
    rawText: text,
    source: "manga-ocr",
    tokens: text.length + 2,
    ms: 30,
    ...(recConf === undefined ? {} : { recConf }),
  };
}

function fakeModule(blocks: NemuOcrPageBlock[]): NemuJapaneseLearningNativeModule {
  return {
    getCapabilities: capabilities,
    recognizeImage: async () => {
      throw new Error("unused");
    },
    recognizePage: async (): Promise<NemuRecognizePageResult> => ({
      engine: "manga-ocr-coreml",
      engineRevision: "manga-ocr-test+ogkalu-test+p2",
      detector: "ogkalu-test",
      osVersion: "27.1.0",
      computeUnits: "encoder=cpu,decoder=cpu",
      width: 900,
      height: 1280,
      modelLoadMs: 0,
      detectMs: 10,
      orderMs: 5,
      recognizeMs: 100,
      elapsedMs: 120,
      blocks,
    }),
    cancelRecognition: async () => true,
    getAnalysisStatus: async () => ({ kernelLinked: false, abiVersion: 5, installed: false, installing: false }),
    installAnalysisPack: async () => ({ kernelLinked: false, abiVersion: 5, installed: false, installing: false }),
    removeAnalysisPack: async () => {},
    analyzeText: async () => {
      throw new Error("unused");
    },
    cancelAnalysis: async () => true,
    romanizeText: async (text) => text,
    addListener: () => ({ remove() {} }),
  } as NemuJapaneseLearningNativeModule;
}

const BLOCKS = [
  pageBlock(0, "王都が見えてきたね。", [700, 100, 760, 300], 0.99),
  pageBlock(1, "先生は私の弟子オフィオー", [100, 900, 615, 949], 0.41),
];
const CLOUD_BODY = JSON.stringify({
  detections: [
    detection(0, "王都が見えてきたね。", [702, 98, 758, 302]),
    detection(1, "『史上最強の弟子ケンイチ』全61巻絶賛発売中!!", [98, 898, 617, 951]),
  ],
});

function run(fetchImpl: typeof fetch, engine?: "auto" | "onDevice") {
  return runMobileJapaneseLearningOcr(
    { imageUri: "file:///page.png" },
    {
      fetchImpl,
      readFileBytes: async () => new Uint8Array([1, 2, 3]),
      ...(engine ? { engine } : {}),
    },
  );
}

describe("online OCR assist in runMobileJapaneseLearningOcr", () => {
  afterEach(() => {
    setMobileJapaneseLearningNativeModuleForTesting(undefined);
    setMobileJapaneseLearningOcrAssist(false);
    setMobileJapaneseLearningEnginePreference("auto");
    clearMobileOnDeviceOcrCache();
    clearMobileOcrAssistCache();
  });

  test("off by default: the page never leaves the device", async () => {
    setMobileJapaneseLearningNativeModuleForTesting(fakeModule(BLOCKS));
    let calls = 0;
    const result = await run((async () => {
      calls += 1;
      return new Response(CLOUD_BODY);
    }) as unknown as typeof fetch);
    expect(calls).toBe(0);
    expect(result.detections.map((item) => item.text)).toEqual(["王都が見えてきたね。", "先生は私の弟子オフィオー"]);
    expect(result.assistedBlocks).toBeUndefined();
  });

  test("on: low-confidence bubbles take the cloud reading, confident ones stay", async () => {
    setMobileJapaneseLearningOcrAssist(true);
    setMobileJapaneseLearningNativeModuleForTesting(fakeModule(BLOCKS));
    const urls: string[] = [];
    const result = await run((async (url: string) => {
      urls.push(url);
      return new Response(CLOUD_BODY);
    }) as unknown as typeof fetch);
    expect(urls).toEqual(["https://ocr.nemu.pm/ocr"]);
    expect(result.detections.map((item) => item.text)).toEqual([
      "王都が見えてきたね。",
      "『史上最強の弟子ケンイチ』全61巻絶賛発売中!!",
    ]);
    expect(result.assistedBlocks).toBe(1);
    expect(result.engine?.kind).toBe("on-device");
    // The same page again reuses the assisted reading without another upload.
    clearMobileOnDeviceOcrCache();
    await run((async (url: string) => {
      urls.push(url);
      return new Response(CLOUD_BODY);
    }) as unknown as typeof fetch);
    expect(urls.length).toBe(1);
  });

  test("on, but every bubble is confident: nothing is sent", async () => {
    setMobileJapaneseLearningOcrAssist(true);
    setMobileJapaneseLearningNativeModuleForTesting(
      fakeModule([pageBlock(0, "王都が見えてきたね。", [700, 100, 760, 300], 0.99)]),
    );
    let calls = 0;
    await run((async () => {
      calls += 1;
      return new Response(CLOUD_BODY);
    }) as unknown as typeof fetch);
    expect(calls).toBe(0);
  });

  test("the on-device-only engine never uploads, even with the assist on", async () => {
    setMobileJapaneseLearningOcrAssist(true);
    setMobileJapaneseLearningNativeModuleForTesting(fakeModule(BLOCKS));
    let calls = 0;
    const result = await run((async () => {
      calls += 1;
      return new Response(CLOUD_BODY);
    }) as unknown as typeof fetch, "onDevice");
    expect(calls).toBe(0);
    expect(result.detections[1]!.text).toBe("先生は私の弟子オフィオー");
  });

  test("a cloud failure silently keeps the on-device text", async () => {
    setMobileJapaneseLearningOcrAssist(true);
    setMobileJapaneseLearningNativeModuleForTesting(fakeModule(BLOCKS));
    const failing = await run((async () => new Response("", { status: 521, statusText: "Web Server Is Down" })) as unknown as typeof fetch);
    expect(failing.detections.map((item) => item.text)).toEqual(["王都が見えてきたね。", "先生は私の弟子オフィオー"]);
    expect(failing.assistedBlocks).toBeUndefined();
    const offline = await run((async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch);
    expect(offline.detections[1]!.text).toBe("先生は私の弟子オフィオー");
  });

  test("signed out: the assist is inactive and the page never leaves the device", async () => {
    setMobileJapaneseLearningOcrAssist(true);
    setMobileJapaneseLearningNativeModuleForTesting(fakeModule(BLOCKS));
    setMobileJapaneseLearningAuthCookieReaderForTesting(() => "");
    try {
      expect(isMobileJapaneseLearningOcrAssistActive("auto")).toBe(false);
      let calls = 0;
      const result = await run((async () => {
        calls += 1;
        return new Response(CLOUD_BODY);
      }) as unknown as typeof fetch);
      expect(calls).toBe(0);
      expect(result.engine?.kind).toBe("on-device");
      expect(result.detections[1]!.text).toBe("先生は私の弟子オフィオー");
      expect(result.assistedBlocks).toBeUndefined();
    } finally {
      setMobileJapaneseLearningAuthCookieReaderForTesting(() => "nemu.session_token=test");
    }
  });

  test("binaries without recognition confidence are never routed", async () => {
    setMobileJapaneseLearningOcrAssist(true);
    setMobileJapaneseLearningNativeModuleForTesting(
      fakeModule(
        BLOCKS.map((item) => {
          const { recConf, ...rest } = item;
          void recConf;
          return rest;
        }),
      ),
    );
    let calls = 0;
    await run((async () => {
      calls += 1;
      return new Response(CLOUD_BODY);
    }) as unknown as typeof fetch);
    expect(calls).toBe(0);
  });
});

describe("online OCR assist setting", () => {
  test("the plugin schema exposes an off-by-default switch that feeds the engine layer", async () => {
    const { getMobileReaderPlugin } = await import("./mobileReaderPlugins");
    const { syncMobileJapaneseLearningEnginePreference } = await import("./mobileJapaneseLearningEngineSettings");
    const plugin = getMobileReaderPlugin("japanese-learning")!;
    const item = plugin.settings
      .flatMap((setting) => ("items" in setting ? setting.items ?? [] : []))
      .find((setting) => setting.key === "onlineOcrAssist") as { type?: string; default?: unknown } | undefined;
    expect(item?.type).toBe("switch");
    expect(item?.default).toBe(false);
    syncMobileJapaneseLearningEnginePreference([
      { id: "japanese-learning", values: { recognitionEngine: "auto", onlineOcrAssist: true } },
    ]);
    expect(isMobileJapaneseLearningOcrAssistActive()).toBe(true);
    syncMobileJapaneseLearningEnginePreference([
      { id: "japanese-learning", values: { recognitionEngine: "onDevice", onlineOcrAssist: true } },
    ]);
    expect(isMobileJapaneseLearningOcrAssistActive()).toBe(false);
    syncMobileJapaneseLearningEnginePreference([]);
    expect(isMobileJapaneseLearningOcrAssistActive()).toBe(false);
  });
});
