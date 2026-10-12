import { afterEach, describe, expect, test } from "bun:test";
import type {
  NemuJapaneseLearningCapabilities,
  NemuJapaneseLearningEventsMap,
  NemuJapaneseLearningNativeModule,
  NemuOcrPageBlock,
  NemuRecognizeImageResult,
  NemuRecognizePageOptions,
  NemuRecognizePageResult,
} from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import { setMobileJapaneseLearningNativeModuleForTesting } from "./mobileJapaneseLearningEngine";
import { runMobileJapaneseLearningOcr } from "./mobileJapaneseLearningOcr";
import {
  detectMobileOcrLayoutRegions,
  isMobileOcrWatermarkText,
} from "./mobileJapaneseLearningOcrLayout";
import {
  clearMobileOnDeviceOcrCache,
  mobileOcrDetectionFromPageBlock,
  mobileOnDeviceOcrLinesFromNative,
  resetMobileOnDeviceOcrPipelineForTesting,
  resolveMobileOnDeviceOcrPipeline,
  runMobileOnDeviceOcr,
} from "./mobileJapaneseLearningOnDeviceOcr";

function capabilities(
  pipeline: Partial<NonNullable<NemuJapaneseLearningCapabilities["ocr"]["pipeline"]>> | null = {},
): NemuJapaneseLearningCapabilities {
  return {
    platform: "ios",
    osVersion: "27.1.0",
    ocr: {
      available: true,
      engine: "apple-vision",
      engineRevision: "RecognizeTextRequest.revision3",
      textDirection: true,
      ...(pipeline
        ? {
            pipeline: {
              mangaOcr: true,
              detector: "vision-layout",
              engine: "manga-ocr-coreml",
              engineRevision: "manga-ocr-base-coreml-int8-v1-test+vision-layout",
              computeUnits: "encoder=cpu,decoder=cpu",
              ...pipeline,
            },
          }
        : {}),
    },
    analysis: { kernelLinked: false, engine: "ichiran-rust", abiVersion: 5 },
  };
}

type Line = NemuRecognizeImageResult["lines"][number];

function line(text: string, x1: number, y1: number, x2: number, y2: number, confidence = 1): Line {
  return {
    text,
    confidence,
    box: { x1, y1, x2, y2 },
    quad: [x1, y1, x2, y1, x2, y2, x1, y2],
    direction: "topToBottom",
  };
}

/** Two bubbles, a ruby column and a watermark, on a 900×1280 page. */
const PAGE_LINES: Line[] = [
  line("知らないの？", 700, 100, 740, 300, 0.3),
  line("じゃあ一つだけ", 600, 100, 640, 330),
  line("教えてあげる", 560, 100, 600, 300),
  // Ruby beside 一つ: half the glyph size, hugging the right of the column.
  line("ひと", 641, 180, 655, 208),
  line("Gomuraw.com", 50, 1200, 250, 1230),
];

function visionPage(lines: Line[] = PAGE_LINES): NemuRecognizeImageResult {
  return {
    engine: "apple-vision",
    engineRevision: "RecognizeTextRequest.revision3",
    osVersion: "27.1.0",
    width: 900,
    height: 1280,
    orientation: 1,
    languages: ["ja-JP", "en-US"],
    textDirectionSupported: true,
    recognizeMs: 40,
    elapsedMs: 45,
    lines,
  };
}

function block(order: number, text: string, box: [number, number, number, number], extra: Partial<NemuOcrPageBlock> = {}): NemuOcrPageBlock {
  return {
    order,
    x1: box[0],
    y1: box[1],
    x2: box[2],
    y2: box[3],
    label: "ja",
    conf: 0.93,
    text,
    rawText: text,
    source: "manga-ocr",
    tokens: text.length + 2,
    ms: 30,
    ...extra,
  };
}

type Harness = {
  module: NemuJapaneseLearningNativeModule;
  pageCalls: Array<{ uri: string; options?: NemuRecognizePageOptions }>;
  visionCalls: string[];
  regionCalls: number;
};

function fakeModule(options: {
  caps?: NemuJapaneseLearningCapabilities;
  blocks?: NemuOcrPageBlock[];
  pageError?: Error & { code?: string };
  withRecognizePage?: boolean;
}): Harness {
  const listeners: Array<NemuJapaneseLearningEventsMap["onOcrBlock"]> = [];
  const harness: Harness = { module: null as never, pageCalls: [], visionCalls: [], regionCalls: 0 };
  const recognizePage = async (
    uri: string,
    pageOptions?: NemuRecognizePageOptions,
  ): Promise<NemuRecognizePageResult> => {
    harness.pageCalls.push({ uri, options: pageOptions });
    if (options.pageError) throw options.pageError;
    const blocks = options.blocks ?? [];
    if (pageOptions?.emitBlocks) {
      blocks.forEach((item, index) => {
        for (const listener of listeners.slice()) {
          listener({ requestId: pageOptions.requestId!, index, total: blocks.length, block: item });
        }
      });
    }
    return {
      engine: "manga-ocr-coreml",
      engineRevision: "manga-ocr-base-coreml-int8-v1-test+vision-layout",
      detector: "vision-layout",
      osVersion: "27.1.0",
      computeUnits: "encoder=cpu,decoder=cpu",
      width: 900,
      height: 1280,
      modelLoadMs: 300,
      detectMs: 0,
      orderMs: 20,
      recognizeMs: 120,
      elapsedMs: 150,
      blocks,
    };
  };
  harness.module = {
    getCapabilities: () => options.caps ?? capabilities(),
    recognizeImage: async (uri) => {
      harness.visionCalls.push(uri);
      return visionPage();
    },
    recognizeRegions: async (_uri, regions) => {
      harness.regionCalls += 1;
      return { ...visionPage([]), regions: regions.map(() => ({ lines: [], scale: 1 })) };
    },
    ...(options.withRecognizePage === false ? {} : { recognizePage }),
    cancelRecognition: async () => true,
    getAnalysisStatus: async () => ({ kernelLinked: false, abiVersion: 5, installed: false, installing: false }),
    installAnalysisPack: async () => ({ kernelLinked: false, abiVersion: 5, installed: false, installing: false }),
    removeAnalysisPack: async () => {},
    analyzeText: async () => {
      throw new Error("unused");
    },
    cancelAnalysis: async () => true,
    romanizeText: async (text) => text,
    addListener: (event, listener) => {
      if (event !== "onOcrBlock") return { remove() {} };
      const typed = listener as NemuJapaneseLearningEventsMap["onOcrBlock"];
      listeners.push(typed);
      return {
        remove() {
          listeners.splice(listeners.indexOf(typed), 1);
        },
      };
    },
  };
  return harness;
}

const PAGE = { imageUri: "file:///page.png" };
const resolveImage = async () => ({
  identity: "page.png",
  tiles: [{ fileUri: "file:///page.png", offsetX: 0, offsetY: 0 }],
});

afterEach(() => {
  setMobileJapaneseLearningNativeModuleForTesting(undefined);
  clearMobileOnDeviceOcrCache();
  resetMobileOnDeviceOcrPipelineForTesting();
});

describe("manga-ocr pipeline selection", () => {
  const withPage = { recognizePage: async () => ({}) as NemuRecognizePageResult };

  test("uses manga-ocr when the binary bundles the models", () => {
    expect(resolveMobileOnDeviceOcrPipeline(withPage, capabilities())).toEqual({ pipeline: "manga-ocr" });
  });

  test("falls back to Vision with an internal reason otherwise", () => {
    expect(resolveMobileOnDeviceOcrPipeline(withPage, capabilities({ mangaOcr: false }))).toEqual({
      pipeline: "vision",
      reason: "manga-ocr models not bundled",
    });
    expect(resolveMobileOnDeviceOcrPipeline(withPage, capabilities(null)).pipeline).toBe("vision");
    expect(resolveMobileOnDeviceOcrPipeline({}, capabilities()).pipeline).toBe("vision");
    expect(resolveMobileOnDeviceOcrPipeline(withPage, capabilities(), "vision").pipeline).toBe("vision");
  });
});

describe("Vision layout as the interim detector", () => {
  test("proposes bubble regions without ruby or watermarks", () => {
    const page = visionPage();
    const regions = detectMobileOcrLayoutRegions({
      width: page.width,
      height: page.height,
      lines: mobileOnDeviceOcrLinesFromNative(page),
    });
    const texts = regions.map((region) => region.text).sort();
    expect(texts).toEqual(["じゃあ一つだけ教えてあげる", "知らないの？"]);
    expect(regions.every((region) => region.label === "ja")).toBe(true);
  });

  test("recognizes full-width watermark output", () => {
    expect(isMobileOcrWatermarkText("Ｇｏｍｕｒａｗ．ｃｏｍ")).toBe(true);
    expect(isMobileOcrWatermarkText("知らないの？")).toBe(false);
  });
});

describe("runMobileOnDeviceOcr with manga-ocr", () => {
  test("passes Vision regions to recognizePage, streams blocks and maps the contract", async () => {
    const harness = fakeModule({
      blocks: [
        block(0, "知らないの？", [700, 100, 740.4, 300]),
        block(1, "じゃあ一つだけ教えてあげる", [560, 100, 640, 330]),
        block(2, "ＧｏｍｕｒａＮｏｏｎ．ｃｏｍ", [50, 1200, 250, 1230]),
      ],
    });
    const partials: string[][] = [];
    const result = await runMobileOnDeviceOcr(PAGE, {
      signal: new AbortController().signal,
      module: harness.module,
      resolveImage,
      onDetections: (detections) => partials.push(detections.map((item) => item.text)),
    });
    expect(harness.visionCalls).toEqual(["file:///page.png"]);
    expect(harness.regionCalls).toBe(0);
    const call = harness.pageCalls[0]!;
    expect(call.options?.emitBlocks).toBe(true);
    expect(call.options?.regions?.map((region) => region.text).sort()).toEqual([
      "じゃあ一つだけ教えてあげる",
      "知らないの？",
    ]);
    expect(partials).toEqual([
      ["知らないの？"],
      ["知らないの？", "じゃあ一つだけ教えてあげる"],
      ["知らないの？", "じゃあ一つだけ教えてあげる"],
    ]);
    expect(result.detections).toEqual([
      { x1: 700, y1: 100, x2: 741, y2: 300, conf: 0.93, cls: 1, label: "ja", order: 0, text: "知らないの？" },
      {
        x1: 560,
        y1: 100,
        x2: 640,
        y2: 330,
        conf: 0.93,
        cls: 1,
        label: "ja",
        order: 1,
        text: "じゃあ一つだけ教えてあげる",
      },
    ]);
    expect(result.imageSize).toEqual({ width: 900, height: 1280 });
    expect(result.engine).toMatchObject({
      engine: "manga-ocr-coreml",
      pipeline: "manga-ocr",
      detector: "vision-layout",
      cached: false,
    });

    const again = await runMobileOnDeviceOcr(PAGE, {
      signal: new AbortController().signal,
      module: harness.module,
      resolveImage,
    });
    expect(again.engine.cached).toBe(true);
    expect(harness.pageCalls).toHaveLength(1);
  });

  test("uses the bundled detector directly without a Vision pass", async () => {
    const harness = fakeModule({
      caps: capabilities({ detector: "ogkalu-v4s-fp16-t040-n050-c080-pad4-v1" }),
      blocks: [block(0, "知らないの？", [700, 100, 740, 300])],
    });
    const result = await runMobileOnDeviceOcr(PAGE, {
      signal: new AbortController().signal,
      module: harness.module,
      resolveImage,
    });
    expect(harness.visionCalls).toEqual([]);
    expect(harness.regionCalls).toBe(0);
    expect(harness.pageCalls).toHaveLength(1);
    expect(harness.pageCalls[0]!.options?.regions).toBeUndefined();
    expect(result.detections.map((item) => item.text)).toEqual(["知らないの？"]);
    expect(result.engine.detector).toBe("ogkalu-v4s-fp16-t040-n050-c080-pad4-v1");
  });

  test("a Core ML failure falls back to Vision and disables manga-ocr for the session", async () => {
    const error = Object.assign(new Error("model load failed"), { code: "E_OCR_MODEL_LOAD" });
    const harness = fakeModule({ pageError: error });
    const first = await runMobileOnDeviceOcr(PAGE, {
      signal: new AbortController().signal,
      module: harness.module,
      resolveImage,
    });
    expect(first.engine.pipeline).toBe("vision");
    expect(first.engine.fallbackReason).toContain("E_OCR_MODEL_LOAD");
    expect(first.detections.map((item) => item.text)).toContain("知らないの？");
    clearMobileOnDeviceOcrCache();
    await runMobileOnDeviceOcr(PAGE, {
      signal: new AbortController().signal,
      module: harness.module,
      resolveImage,
    });
    expect(harness.pageCalls).toHaveLength(1);
  });

  test("a page-level failure falls back for that page only", async () => {
    const error = Object.assign(new Error("bad image"), { code: "E_OCR_IMAGE" });
    const harness = fakeModule({ pageError: error });
    const first = await runMobileOnDeviceOcr(PAGE, {
      signal: new AbortController().signal,
      module: harness.module,
      resolveImage,
    });
    expect(first.engine.pipeline).toBe("vision");
    clearMobileOnDeviceOcrCache();
    await runMobileOnDeviceOcr(PAGE, {
      signal: new AbortController().signal,
      module: harness.module,
      resolveImage,
    });
    expect(harness.pageCalls).toHaveLength(2);
  });

  test("binaries without bundled models keep the Vision pipeline", async () => {
    const harness = fakeModule({ caps: capabilities({ mangaOcr: false }) });
    const result = await runMobileOnDeviceOcr(PAGE, {
      signal: new AbortController().signal,
      module: harness.module,
      resolveImage,
    });
    expect(harness.pageCalls).toHaveLength(0);
    expect(harness.regionCalls).toBe(1);
    expect(result.engine).toMatchObject({
      pipeline: "vision",
      fallbackReason: "manga-ocr models not bundled",
    });
  });

  test("labels follow the recognized text and detector blocks keep theirs", () => {
    const tile = { offsetX: 0, offsetY: 500 };
    expect(mobileOcrDetectionFromPageBlock(block(0, "！？", [0, 0, 10, 10]), tile, 3)).toMatchObject({
      label: "unknown",
      cls: 2,
      order: 3,
      y1: 500,
    });
    expect(
      mobileOcrDetectionFromPageBlock(
        block(0, "THE END", [0, 0, 10, 10], { source: "detector", label: "eng" }),
        tile,
        0,
      ),
    ).toMatchObject({ label: "eng", cls: 0 });
  });
});

describe("runMobileJapaneseLearningOcr", () => {
  test("reports partial transcripts while manga-ocr reads the page", async () => {
    const harness = fakeModule({
      blocks: [block(0, "知らないの？", [700, 100, 740, 300]), block(1, "教えてあげる", [560, 100, 640, 330])],
    });
    setMobileJapaneseLearningNativeModuleForTesting(harness.module);
    const partials: string[] = [];
    const result = await runMobileJapaneseLearningOcr(
      { imageUri: "file:///page.png" },
      { engine: "onDevice", onPartialResult: (partial) => partials.push(partial.text) },
    );
    expect(partials.length).toBe(2);
    expect(partials[1]).toBe(result.text);
    expect(result.engine).toMatchObject({ pipeline: "manga-ocr" });
  });
});
