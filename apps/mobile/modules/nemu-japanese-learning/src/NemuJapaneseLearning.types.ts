export type NemuJapaneseLearningCapabilities = {
  platform: "ios" | "android";
  osVersion: string;
  ocr: {
    available: boolean;
    engine: "apple-vision" | "none";
    engineRevision: string;
    /** Vision reports per-line text direction (iOS 26+). */
    textDirection: boolean;
    /**
     * The manga-ocr page pipeline (`recognizePage`). Absent in binaries built
     * before it existed; `mangaOcr` is false when the build did not bundle
     * the Core ML models (Debug builds without `bun run ocr:models`).
     */
    pipeline?: NemuMangaOcrPipelineCapabilities;
  };
  analysis: {
    /** The Rust kernel is linked into this binary (vendored at build time). */
    kernelLinked: boolean;
    engine: "ichiran-rust";
    abiVersion: number;
  };
};

export type NemuMangaOcrPipelineCapabilities = {
  mangaOcr: boolean;
  /**
   * "vision-layout": the caller passes regions (Vision lines grouped by the
   * TS layout); any other value is a detector bundled in the binary.
   */
  detector: string;
  engine: "manga-ocr-coreml";
  /** Model revision + detector: part of the OCR cache key. */
  engineRevision: string;
  computeUnits: string;
};

export type NemuOcrRegionInput = {
  /** [x1, y1, x2, y2] top-left page pixels. */
  box: [number, number, number, number];
  label: "ja" | "eng" | "unknown";
  conf?: number;
  /** Detector text; kept for "eng" regions, which manga-ocr does not read. */
  text?: string;
};

export type NemuRecognizePageOptions = {
  requestId?: string;
  /** Detector regions (unordered). Omitted: the bundled detector runs. */
  regions?: NemuOcrRegionInput[];
  /** Send an `onOcrBlock` event per recognized block, in reading order. */
  emitBlocks?: boolean;
  /** Pixels added around each region before cropping (default 0). */
  cropPadding?: number;
};

export type NemuOcrPageBlock = {
  /** 0..n-1 reading order (text_order port). */
  order: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: "ja" | "eng" | "unknown";
  conf: number;
  /** Display text (manga-ocr post_process, `．．．` → `…`). */
  text: string;
  /** manga-ocr `post_process` output. */
  rawText: string;
  source: "manga-ocr" | "detector";
  tokens: number;
  ms: number;
  /**
   * manga-ocr's recognition confidence alone (geometric mean token
   * probability); `conf` is min(detection, recognition) with the bundled
   * detector. Absent on older binaries and for detector text.
   */
  recConf?: number;
};

export type NemuRecognizePageResult = {
  engine: "manga-ocr-coreml";
  engineRevision: string;
  detector: string;
  osVersion: string;
  computeUnits: string;
  width: number;
  height: number;
  modelLoadMs: number;
  detectMs: number;
  orderMs: number;
  recognizeMs: number;
  elapsedMs: number;
  blocks: NemuOcrPageBlock[];
};

export type NemuOcrBlockEvent = {
  requestId: string;
  index: number;
  total: number;
  block: NemuOcrPageBlock;
};

export type NemuRecognizeImageOptions = {
  requestId?: string;
  /** BCP-47 identifiers; Japanese must be supported or the call rejects. */
  languages?: string[];
  usesLanguageCorrection?: boolean;
  includeCharacterBoxes?: boolean;
  minimumTextHeightFraction?: number;
};

/** [x1, y1, x2, y2] in top-left pixels, or null when Vision could not place it. */
export type NemuCharacterBox = [number, number, number, number] | null;

export type NemuRecognizedLine = {
  text: string;
  confidence: number;
  box: { x1: number; y1: number; x2: number; y2: number };
  /** Corner points TL, TR, BR, BL as flat [x, y, …] top-left pixels. */
  quad: number[];
  direction: "topToBottom" | "leftToRight" | "rightToLeft" | null;
  characterBoxes?: NemuCharacterBox[];
};

export type NemuRecognizeImageResult = {
  engine: "apple-vision";
  engineRevision: string;
  osVersion: string;
  width: number;
  height: number;
  orientation: number;
  languages: string[];
  textDirectionSupported: boolean;
  recognizeMs: number;
  elapsedMs: number;
  lines: NemuRecognizedLine[];
};

export type NemuRecognizeRegionsResult = {
  engine: "apple-vision";
  engineRevision: string;
  osVersion: string;
  width: number;
  height: number;
  recognizeMs: number;
  elapsedMs: number;
  /**
   * One entry per requested region, in request order: the lines Vision read
   * on that region's padded, upscaled crop, boxes in page pixels.
   */
  regions: Array<{ lines: NemuRecognizedLine[]; scale: number }>;
};

export type NemuAnalysisStatus = {
  kernelLinked: boolean;
  abiVersion: number;
  installed: boolean;
  installing: boolean;
  packVersion?: string;
  sourceCommit?: string;
  manifestSha256?: string;
  installedBytes?: number;
  reason?: string;
};

export type NemuAnalysisPackProgress = {
  phase: "downloading" | "verifying" | "installing" | "opening" | "publishing";
  completedBytes: number;
  totalBytes: number;
};

export type NemuAnalyzeTextOptions = {
  requestId?: string;
  limit?: number;
  entities?: Array<{ start: number; end: number; boost?: number }>;
};

export type NemuAnalyzeTextResult = {
  /** Ichiran detailed-legacy segments JSON (the cloud `/api/segment` `segments`). */
  segmentsJson: string;
  packVersion: string;
  engine: "ichiran-rust";
  abiVersion: number;
  openMs: number;
  elapsedMs: number;
};

export type NemuJapaneseLearningEventsMap = {
  onAnalysisPackProgress: (event: NemuAnalysisPackProgress) => void;
  onOcrBlock: (event: NemuOcrBlockEvent) => void;
};

export type NemuJapaneseLearningNativeModule = {
  getCapabilities(): NemuJapaneseLearningCapabilities;
  recognizeImage(
    fileUri: string,
    options?: NemuRecognizeImageOptions,
  ): Promise<NemuRecognizeImageResult>;
  /**
   * Second OCR pass over text regions ([x1, y1, x2, y2] page pixels, at
   * most 64). Optional: older binaries and Android do not provide it.
   */
  recognizeRegions?(
    fileUri: string,
    regions: Array<[number, number, number, number]>,
    options?: NemuRecognizeImageOptions,
  ): Promise<NemuRecognizeRegionsResult>;
  /**
   * manga-ocr page pipeline: detector regions → reading order → Core ML
   * manga-ocr per bubble. Optional: older binaries and Android lack it.
   */
  recognizePage?(
    fileUri: string,
    options?: NemuRecognizePageOptions,
  ): Promise<NemuRecognizePageResult>;
  cancelRecognition(requestId: string): Promise<boolean>;
  getAnalysisStatus(): Promise<NemuAnalysisStatus>;
  installAnalysisPack(
    manifestUrl: string,
    expectedManifestSha256: string,
  ): Promise<NemuAnalysisStatus>;
  removeAnalysisPack(): Promise<void>;
  analyzeText(
    text: string,
    options?: NemuAnalyzeTextOptions,
  ): Promise<NemuAnalyzeTextResult>;
  cancelAnalysis(requestId: string): Promise<boolean>;
  romanizeText(text: string): Promise<string>;
  addListener<K extends keyof NemuJapaneseLearningEventsMap>(
    eventName: K,
    listener: NemuJapaneseLearningEventsMap[K],
  ): { remove(): void };
};
