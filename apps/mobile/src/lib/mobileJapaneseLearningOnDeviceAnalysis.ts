/**
 * On-device Japanese analysis: TigerHix/ichiran-node's Rust kernel via the
 * NemuJapaneseLearning module, plus its one-time dictionary pack.
 *
 * The kernel returns Ichiran's detailed legacy `segments` — the same JSON the
 * cloud `/api/segment` endpoint returns — so `convertMobileIchiranSegments`
 * maps both engines to the UI's grammar tokens identically.
 *
 * The pack (format 1, `portable-core-260118-baseline`: hot.bin.gz +
 * details.bin.gz, ~24 MiB download, ~37 MiB installed) is downloaded on first
 * use into Application Support (excluded from backup), integrity-checked by
 * IchiranPackStore against a manifest whose identity is pinned here.
 */
import type {
  NemuAnalysisPackProgress,
  NemuAnalysisStatus,
  NemuJapaneseLearningNativeModule,
} from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";
import {
  createMobileJapaneseLearningEngineRequestId,
  getMobileJapaneseLearningNativeModule,
  mobileJapaneseLearningNowMs,
  recordMobileJapaneseLearningEngineRun,
} from "./mobileJapaneseLearningEngine";
import {
  assertMobileJapaneseLearningUtf8ByteLength,
  awaitMobileJapaneseLearningAbortable,
  throwIfMobileJapaneseLearningAborted,
} from "./mobileJapaneseLearningSafety";

/** Release pinned by manifest identity (the manifest's authenticated `manifestSha256`). */
export const MOBILE_ICHIRAN_PACK_RELEASE = {
  tag: "portable-core-260118-baseline",
  packVersion: "ichiran-260118",
  sourceCommit: "29ec534ede2b4c90dcddb18f87a84089c24df9de",
  manifestUrl:
    "https://github.com/TigerHix/ichiran-node/releases/download/portable-core-260118-baseline/manifest.json",
  manifestSha256:
    "e245cde362ade8b7e6f30f063ea93f42e551168f8c28a7d9fd0b13c48085b258",
  downloadBytes: 12_662_917 + 12_317_325,
  installedBytes: 24_857_288 + 13_555_874,
} as const;

/** The kernel's per-call limit (UTF-16 code units). */
export const MOBILE_ICHIRAN_MAX_UNITS_PER_CALL = 4_096;
const MOBILE_ICHIRAN_CHUNK_UNITS = 3_800;
const MOBILE_ICHIRAN_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** A mirror (e.g. nemu's own CDN) may serve the same pinned manifest. */
export function getMobileIchiranPackManifestUrl(): string {
  // Expo inlines `process.env.EXPO_PUBLIC_*` member expressions at bundle time.
  return (
    process.env.EXPO_PUBLIC_NEMU_ICHIRAN_MANIFEST_URL?.trim() ||
    MOBILE_ICHIRAN_PACK_RELEASE.manifestUrl
  );
}

type ProgressListener = (progress: NemuAnalysisPackProgress) => void;
const progressListeners = new Set<ProgressListener>();
let nativeProgressSubscription: { remove(): void } | null = null;

/** Pack download/verify/install progress for any UI that wants to show it. */
export function subscribeMobileJapaneseLearningAnalysisPackProgress(
  listener: ProgressListener,
): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

export type MobileJapaneseLearningAnalysisPackInstallEvent =
  | { type: "started" }
  | { type: "succeeded"; status: NemuAnalysisStatus }
  | { type: "failed"; error: unknown };
type InstallListener = (event: MobileJapaneseLearningAnalysisPackInstallEvent) => void;
const installListeners = new Set<InstallListener>();

/** Start / finish / failure of the shared pack install (for status UIs). */
export function subscribeMobileJapaneseLearningAnalysisPackInstall(
  listener: InstallListener,
): () => void {
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}

function emitInstallEvent(event: MobileJapaneseLearningAnalysisPackInstallEvent) {
  for (const listener of installListeners) listener(event);
}

function ensureNativeProgressSubscription(module: NemuJapaneseLearningNativeModule) {
  if (nativeProgressSubscription) return;
  try {
    nativeProgressSubscription = module.addListener(
      "onAnalysisPackProgress",
      (progress) => {
        for (const listener of progressListeners) listener(progress);
      },
    );
  } catch {
    nativeProgressSubscription = null;
  }
}

function requireModule(
  module: NemuJapaneseLearningNativeModule | null | undefined,
): NemuJapaneseLearningNativeModule {
  const resolved =
    module !== undefined ? module : getMobileJapaneseLearningNativeModule();
  if (!resolved) {
    throw new Error("On-device Japanese analysis is not available.");
  }
  return resolved;
}

export async function getMobileJapaneseLearningAnalysisPackStatus(
  module?: NemuJapaneseLearningNativeModule | null,
): Promise<NemuAnalysisStatus> {
  const resolved =
    module !== undefined ? module : getMobileJapaneseLearningNativeModule();
  if (!resolved) {
    return { kernelLinked: false, abiVersion: 0, installed: false, installing: false };
  }
  return resolved.getAnalysisStatus();
}

let installInFlight: Promise<NemuAnalysisStatus> | null = null;

/**
 * Installs the pinned pack if missing. Concurrent callers share one install;
 * an abort only stops the caller waiting (the verified download keeps going
 * so a retry does not start over).
 */
export async function ensureMobileJapaneseLearningAnalysisPack(options: {
  signal?: AbortSignal;
  module?: NemuJapaneseLearningNativeModule | null;
  onProgress?: ProgressListener;
} = {}): Promise<NemuAnalysisStatus> {
  const module = requireModule(options.module);
  const status = await module.getAnalysisStatus();
  if (!status.kernelLinked) {
    throw new Error("On-device Japanese analysis is not available in this build.");
  }
  if (
    status.installed &&
    status.manifestSha256 === MOBILE_ICHIRAN_PACK_RELEASE.manifestSha256
  ) {
    return status;
  }
  ensureNativeProgressSubscription(module);
  const unsubscribe = options.onProgress
    ? subscribeMobileJapaneseLearningAnalysisPackProgress(options.onProgress)
    : () => undefined;
  try {
    if (!installInFlight) {
      const started = mobileJapaneseLearningNowMs();
      emitInstallEvent({ type: "started" });
      installInFlight = module
        .installAnalysisPack(
          getMobileIchiranPackManifestUrl(),
          MOBILE_ICHIRAN_PACK_RELEASE.manifestSha256,
        )
        .then(
          (next) => {
            recordMobileJapaneseLearningEngineRun({
              stage: "pack-install",
              engine: "on-device",
              ok: true,
              durationMs: mobileJapaneseLearningNowMs() - started,
              detail: `${next.packVersion ?? "?"} bytes=${next.installedBytes ?? "?"}`,
            });
            emitInstallEvent({ type: "succeeded", status: next });
            return next;
          },
          (error: unknown) => {
            recordMobileJapaneseLearningEngineRun({
              stage: "pack-install",
              engine: "on-device",
              ok: false,
              durationMs: mobileJapaneseLearningNowMs() - started,
              detail: error instanceof Error ? error.message : String(error),
            });
            emitInstallEvent({ type: "failed", error });
            throw error;
          },
        )
        .finally(() => {
          installInFlight = null;
        });
    }
    return await awaitMobileJapaneseLearningAbortable(installInFlight, options.signal);
  } finally {
    unsubscribe();
  }
}

export async function removeMobileJapaneseLearningAnalysisPack(
  module?: NemuJapaneseLearningNativeModule | null,
): Promise<void> {
  await requireModule(module).removeAnalysisPack();
}

/**
 * Splits text into kernel-sized chunks at line or sentence boundaries so a
 * long transcript never hits the 4,096-unit limit. Chunks concatenate back
 * to the input exactly.
 */
export function chunkMobileIchiranInput(
  text: string,
  maxUnits = MOBILE_ICHIRAN_CHUNK_UNITS,
): string[] {
  if (text.length <= maxUnits) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxUnits) {
    const window = rest.slice(0, maxUnits);
    let cut = Math.max(
      window.lastIndexOf("\n"),
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
    );
    cut = cut > maxUnits / 4 ? cut + 1 : maxUnits;
    // Never split a surrogate pair.
    const code = rest.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export type MobileOnDeviceAnalysisResult = {
  segments: unknown[];
  packVersion: string;
  elapsedMs: number;
};

export async function runMobileOnDeviceAnalysis(
  text: string,
  options: {
    signal: AbortSignal;
    limit?: number;
    module?: NemuJapaneseLearningNativeModule | null;
  },
): Promise<MobileOnDeviceAnalysisResult> {
  const module = requireModule(options.module);
  const started = mobileJapaneseLearningNowMs();
  const segments: unknown[] = [];
  let packVersion = "";
  let kernelMs = 0;
  try {
    for (const chunk of chunkMobileIchiranInput(text)) {
      throwIfMobileJapaneseLearningAborted(options.signal);
      const requestId = createMobileJapaneseLearningEngineRequestId("analyze");
      const onAbort = () => {
        void module.cancelAnalysis(requestId).catch(() => undefined);
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      try {
        const result = await awaitMobileJapaneseLearningAbortable(
          module.analyzeText(chunk, { requestId, limit: options.limit ?? 5 }),
          options.signal,
        );
        assertMobileJapaneseLearningUtf8ByteLength(
          result.segmentsJson,
          MOBILE_ICHIRAN_MAX_RESPONSE_BYTES,
          "On-device analysis result",
        );
        const parsed = JSON.parse(result.segmentsJson) as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error("On-device analysis returned an invalid result.");
        }
        segments.push(...parsed);
        packVersion = result.packVersion;
        kernelMs += result.elapsedMs;
      } finally {
        options.signal.removeEventListener("abort", onAbort);
      }
    }
    const elapsedMs = mobileJapaneseLearningNowMs() - started;
    recordMobileJapaneseLearningEngineRun({
      stage: "analysis",
      engine: "on-device",
      ok: true,
      durationMs: elapsedMs,
      detail: `ichiran-rust ${packVersion} segments=${segments.length} kernel=${Math.round(kernelMs)}ms`,
    });
    return { segments, packVersion, elapsedMs: Math.round(elapsedMs) };
  } catch (error) {
    recordMobileJapaneseLearningEngineRun({
      stage: "analysis",
      engine: "on-device",
      ok: false,
      durationMs: mobileJapaneseLearningNowMs() - started,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
