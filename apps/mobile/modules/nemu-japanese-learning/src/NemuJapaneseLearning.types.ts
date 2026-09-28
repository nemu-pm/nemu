export type NemuJapaneseLearningCapabilities = {
  platform: "ios" | "android";
  osVersion: string;
  ocr: {
    available: boolean;
    engine: "apple-vision" | "none";
    engineRevision: string;
    /** Vision reports per-line text direction (iOS 26+). */
    textDirection: boolean;
  };
  analysis: {
    /** The Rust kernel is linked into this binary (vendored at build time). */
    kernelLinked: boolean;
    engine: "ichiran-rust";
    abiVersion: number;
  };
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
};

export type NemuJapaneseLearningNativeModule = {
  getCapabilities(): NemuJapaneseLearningCapabilities;
  recognizeImage(
    fileUri: string,
    options?: NemuRecognizeImageOptions,
  ): Promise<NemuRecognizeImageResult>;
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
