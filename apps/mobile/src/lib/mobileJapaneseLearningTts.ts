import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import { FileSystemBinaryCache } from "@/data/nativeCache";
import type { NativeBinaryCachePolicy } from "@/data/nativeCachePolicy";
import { mobileNativeFetch } from "@/sources/mobileNativeHttp";
import {
  awaitMobileJapaneseLearningAbortable,
  throwIfMobileJapaneseLearningAborted,
} from "./mobileJapaneseLearningSafety";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";

export type MobileJapaneseLearningTtsOptions = {
  fetchImpl?: typeof fetch;
  getAuthCookie?: () => string;
  readCachedWavFile?: (id: string) => Promise<string | null>;
  skipTagging?: boolean;
  siteUrl?: string | null;
  signal?: AbortSignal;
  source?: "sentence" | "transcript" | "voice";
  writeWavFile?: (id: string, bytes: Uint8Array) => Promise<string>;
};

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PCM_SAMPLE_RATE = 24000;
const PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;
const WAV_HEADER_BYTE_LENGTH = 44;
export const MOBILE_TTS_DISK_CACHE_POLICY: NativeBinaryCachePolicy = {
  maxBytes: 128 * 1024 * 1024,
  maxEntries: 256,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxEntryBytes: 16 * 1024 * 1024,
};
export const MOBILE_TTS_MAX_PCM_BYTES =
  MOBILE_TTS_DISK_CACHE_POLICY.maxEntryBytes - WAV_HEADER_BYTE_LENGTH;
export const MOBILE_TTS_MAX_EVENT_STREAM_BYTES = 24 * 1024 * 1024;
const mobileTtsDiskCache = new FileSystemBinaryCache(
  "nemu-tts",
  MOBILE_TTS_DISK_CACHE_POLICY,
);
type MobileTtsGenerationEntry = {
  controller: AbortController;
  promise: Promise<{ id: string; uri: string }>;
  consumers: number;
  settled: boolean;
};
const mobileTtsGenerationInFlight = new Map<
  string,
  MobileTtsGenerationEntry
>();
const mobileTtsAbortControllers = new Set<AbortController>();
let mobileTtsCacheEpoch = 0;

type MobileTtsParseLimits = {
  maxEventStreamBytes?: number;
  maxPcmBytes?: number;
};

type MobileTtsEventStreamState = {
  chunks: Uint8Array[];
  decodedBytes: number;
  maxPcmBytes: number;
};

function mobileTtsLimitError(): Error {
  return new Error("TTS response exceeds the mobile safety limit.");
}

function mobileTtsCancelledError(): Error {
  return new Error("TTS generation was cancelled.");
}

function assertMobileTtsCacheEpoch(expectedEpoch: number): void {
  if (expectedEpoch !== mobileTtsCacheEpoch) {
    throw mobileTtsCancelledError();
  }
}

async function consumeMobileTtsGeneration(
  id: string,
  entry: MobileTtsGenerationEntry,
  signal?: AbortSignal,
): Promise<{ id: string; uri: string }> {
  entry.consumers += 1;
  try {
    return await awaitMobileJapaneseLearningAbortable(entry.promise, signal);
  } finally {
    entry.consumers = Math.max(0, entry.consumers - 1);
    if (entry.consumers === 0 && !entry.settled) {
      if (mobileTtsGenerationInFlight.get(id) === entry) {
        mobileTtsGenerationInFlight.delete(id);
      }
      if (!entry.controller.signal.aborted) {
        entry.controller.abort(signal?.reason ?? mobileTtsCancelledError());
      }
    }
  }
}

function normalizeBaseUrl(value: string | null | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("TTS is not configured.");
  return trimmed;
}

function getMobileAuthHeaders(
  getAuthCookie?: () => string,
): Record<string, string> {
  const cookie = getAuthCookie?.();
  return cookie ? { "Better-Auth-Cookie": cookie } : {};
}

function normalizeBase64(base64: string): string {
  const raw = base64.includes(",")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  let cleaned = raw.trim().replace(/\s+/g, "");
  cleaned = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  const pad = cleaned.length % 4;
  if (pad) cleaned += "=".repeat(4 - pad);
  return cleaned;
}

function base64DecodedByteLength(cleaned: string): number {
  if (!cleaned) return 0;
  return (
    (cleaned.length / 4) * 3 -
    (cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0)
  );
}

function decodeBase64ToBytes(
  base64: string,
  maxBytes = Number.POSITIVE_INFINITY,
): Uint8Array {
  const cleaned = normalizeBase64(base64);
  if (!cleaned) return new Uint8Array();

  const outputLength = base64DecodedByteLength(cleaned);
  if (
    !Number.isSafeInteger(outputLength) ||
    outputLength < 0 ||
    outputLength > maxBytes
  ) {
    throw mobileTtsLimitError();
  }
  const output = new Uint8Array(Math.max(0, outputLength));
  let outputIndex = 0;

  for (let index = 0; index < cleaned.length; index += 4) {
    const first = BASE64_CHARS.indexOf(cleaned[index] ?? "");
    const second = BASE64_CHARS.indexOf(cleaned[index + 1] ?? "");
    const thirdChar = cleaned[index + 2] ?? "=";
    const fourthChar = cleaned[index + 3] ?? "=";
    const third = thirdChar === "=" ? 0 : BASE64_CHARS.indexOf(thirdChar);
    const fourth = fourthChar === "=" ? 0 : BASE64_CHARS.indexOf(fourthChar);
    if (first < 0 || second < 0 || third < 0 || fourth < 0) continue;

    const triple = (first << 18) | (second << 12) | (third << 6) | fourth;
    if (outputIndex < output.length)
      output[outputIndex++] = (triple >> 16) & 255;
    if (thirdChar !== "=" && outputIndex < output.length) {
      output[outputIndex++] = (triple >> 8) & 255;
    }
    if (fourthChar !== "=" && outputIndex < output.length) {
      output[outputIndex++] = triple & 255;
    }
  }

  return outputIndex === output.length ? output : output.slice(0, outputIndex);
}

function buildWavHeader(dataLength: number): Uint8Array {
  const bytesPerSample = PCM_BITS_PER_SAMPLE / 8;
  const blockAlign = PCM_CHANNELS * bytesPerSample;
  const byteRate = PCM_SAMPLE_RATE * blockAlign;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTE_LENGTH);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, PCM_CHANNELS, true);
  view.setUint32(24, PCM_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, PCM_BITS_PER_SAMPLE, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);
  return new Uint8Array(buffer);
}

export function wavBytesFromPcmChunks(chunks: Uint8Array[]): Uint8Array {
  let dataLength = 0;
  for (const chunk of chunks) {
    dataLength += chunk.byteLength;
    if (
      !Number.isSafeInteger(dataLength) ||
      dataLength > MOBILE_TTS_MAX_PCM_BYTES
    ) {
      throw mobileTtsLimitError();
    }
  }

  const output = new Uint8Array(WAV_HEADER_BYTE_LENGTH + dataLength);
  output.set(buildWavHeader(dataLength), 0);
  let offset = WAV_HEADER_BYTE_LENGTH;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) byteLength += 1;
    else if (code < 0x800) byteLength += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      byteLength += 4;
      index += 1;
    } else byteLength += 3;
  }
  return byteLength;
}

function parseMobileTtsEventBlock(
  block: string,
  state: MobileTtsEventStreamState,
): void {
  if (!block.trim()) return;
  const payload = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");
  if (!payload) return;
  const event = JSON.parse(payload) as {
    audio_base64?: string;
    error?: string;
  };
  if (event.error) throw new Error(event.error);
  if (event.audio_base64) {
    const remainingBytes = state.maxPcmBytes - state.decodedBytes;
    const bytes = decodeBase64ToBytes(event.audio_base64, remainingBytes);
    if (bytes.byteLength > 0) {
      state.decodedBytes += bytes.byteLength;
      state.chunks.push(bytes);
    }
  }
}

function consumeMobileTtsEventBlocks(
  buffer: string,
  state: MobileTtsEventStreamState,
): string {
  let remainder = buffer;
  while (true) {
    const separator = /\r?\n\r?\n/.exec(remainder);
    if (!separator || separator.index == null) return remainder;
    parseMobileTtsEventBlock(remainder.slice(0, separator.index), state);
    remainder = remainder.slice(separator.index + separator[0].length);
  }
}

export function parseMobileTtsEventStream(
  body: string,
  limits: MobileTtsParseLimits = {},
): Uint8Array[] {
  const maxEventStreamBytes =
    limits.maxEventStreamBytes ?? MOBILE_TTS_MAX_EVENT_STREAM_BYTES;
  if (utf8ByteLength(body) > maxEventStreamBytes) throw mobileTtsLimitError();
  const state: MobileTtsEventStreamState = {
    chunks: [],
    decodedBytes: 0,
    maxPcmBytes: limits.maxPcmBytes ?? MOBILE_TTS_MAX_PCM_BYTES,
  };
  for (const block of body.trim().split(/\r?\n\r?\n+/)) {
    parseMobileTtsEventBlock(block, state);
  }
  if (state.chunks.length === 0)
    throw new Error("TTS response did not include audio.");
  return state.chunks;
}

async function parseMobileTtsResponse(
  response: Response,
  abortController: AbortController,
): Promise<Uint8Array[]> {
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength =
    contentLengthHeader == null ? Number.NaN : Number(contentLengthHeader);
  if (
    Number.isFinite(contentLength) &&
    contentLength > MOBILE_TTS_MAX_EVENT_STREAM_BYTES
  ) {
    abortController.abort();
    throw mobileTtsLimitError();
  }

  const reader = response.body?.getReader();
  if (!reader) {
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      abortController.abort();
      throw new Error(
        "TTS response streaming is unavailable without a bounded content length.",
      );
    }
    return parseMobileTtsEventStream(await response.text());
  }

  const decoder = new TextDecoder();
  const state: MobileTtsEventStreamState = {
    chunks: [],
    decodedBytes: 0,
    maxPcmBytes: MOBILE_TTS_MAX_PCM_BYTES,
  };
  let encodedBytes = 0;
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      encodedBytes += value.byteLength;
      if (encodedBytes > MOBILE_TTS_MAX_EVENT_STREAM_BYTES) {
        abortController.abort();
        await reader.cancel().catch(() => undefined);
        throw mobileTtsLimitError();
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = consumeMobileTtsEventBlocks(buffer, state);
    }
    buffer += decoder.decode();
    parseMobileTtsEventBlock(buffer, state);
  } catch (error) {
    abortController.abort();
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (state.chunks.length === 0)
    throw new Error("TTS response did not include audio.");
  return state.chunks;
}

export function createMobileTtsId(
  prefix: string,
  text: string,
  executionScope = getActiveMobileSourceProfileScope(),
): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return `tts:${executionScope}:${prefix}:${Math.abs(hash).toString(36)}`;
}

async function defaultReadCachedWavFile(id: string): Promise<string | null> {
  return mobileTtsDiskCache.getUri(id);
}

async function defaultWriteWavFile(
  id: string,
  bytes: Uint8Array,
): Promise<string> {
  return mobileTtsDiskCache.setBytes(id, bytes, "audio/wav");
}

function abortMobileJapaneseLearningTtsGeneration(): void {
  mobileTtsCacheEpoch += 1;
  for (const controller of mobileTtsAbortControllers) controller.abort();
  mobileTtsAbortControllers.clear();
  mobileTtsGenerationInFlight.clear();
}

export async function clearMobileJapaneseLearningTtsCache(): Promise<void> {
  abortMobileJapaneseLearningTtsGeneration();
  await mobileTtsDiskCache.clearAll();
}

registerMobileSourceProfileTransitionHandler(
  "japanese-learning-tts-cache",
  abortMobileJapaneseLearningTtsGeneration,
);

export async function generateMobileJapaneseLearningTts(
  text: string,
  options: MobileJapaneseLearningTtsOptions = {},
): Promise<{ id: string; uri: string }> {
  throwIfMobileJapaneseLearningAborted(options.signal);
  const clean = text.trim();
  if (!clean) throw new Error("Missing text.");
  const fetchImpl = options.fetchImpl;
  const source = options.source ?? "sentence";
  const id = createMobileTtsId(source, clean);
  const generationEpoch = mobileTtsCacheEpoch;
  const skipTagging = options.skipTagging ?? source === "voice";
  const readCachedWavFile =
    options.readCachedWavFile ?? defaultReadCachedWavFile;
  let cachedUri: string | null = null;
  try {
    cachedUri = await awaitMobileJapaneseLearningAbortable(
      readCachedWavFile(id),
      options.signal,
    );
  } catch {
    throwIfMobileJapaneseLearningAborted(options.signal);
    cachedUri = null;
  }
  assertMobileTtsCacheEpoch(generationEpoch);
  if (cachedUri) return { id, uri: cachedUri };

  const inFlight = mobileTtsGenerationInFlight.get(id);
  if (inFlight) {
    return consumeMobileTtsGeneration(id, inFlight, options.signal);
  }

  const abortController = new AbortController();
  mobileTtsAbortControllers.add(abortController);
  const generation = (async () => {
    const url = `${normalizeBaseUrl(options.siteUrl ?? mobileSyncConfig.siteUrl)}/tts`;
    const requestInit: RequestInit = {
      method: "POST",
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        ...getMobileAuthHeaders(options.getAuthCookie),
      },
      body: JSON.stringify({
        text: clean,
        skipTagging,
        source,
      }),
      signal: abortController.signal,
    };
    let chunks: Uint8Array[];
    if (fetchImpl) {
      const response = await fetchImpl(url, requestInit);
      assertMobileTtsCacheEpoch(generationEpoch);
      if (!response.ok) {
        if (response.status === 401) throw new Error("auth_required");
        throw new Error(
          `TTS failed: ${response.status} ${response.statusText}`,
        );
      }
      chunks = await parseMobileTtsResponse(response, abortController);
    } else {
      // The native bridge applies maxResponseBytes while bytes are still being
      // received. This is the fail-closed path on JSC, where fetch streaming is
      // not guaranteed and response.text() could otherwise allocate without a
      // trustworthy pre-read boundary.
      const response = await mobileNativeFetch(url, {
        ...requestInit,
        maxResponseBytes: MOBILE_TTS_MAX_EVENT_STREAM_BYTES,
        responseMode: "text",
      });
      assertMobileTtsCacheEpoch(generationEpoch);
      if (!response.ok) {
        if (response.status === 401) throw new Error("auth_required");
        throw new Error(`TTS failed: ${response.status}`);
      }
      chunks = parseMobileTtsEventStream(response.body);
    }
    assertMobileTtsCacheEpoch(generationEpoch);
    throwIfMobileJapaneseLearningAborted(abortController.signal);
    const wavBytes = wavBytesFromPcmChunks(chunks);
    const writeWavFile = options.writeWavFile ?? defaultWriteWavFile;
    const uri = await writeWavFile(id, wavBytes);
    if (abortController.signal.aborted) {
      if (!options.writeWavFile) await mobileTtsDiskCache.remove(id);
      throwIfMobileJapaneseLearningAborted(abortController.signal);
    }
    if (generationEpoch !== mobileTtsCacheEpoch) {
      if (!options.writeWavFile) await mobileTtsDiskCache.remove(id);
      throw mobileTtsCancelledError();
    }
    return { id, uri };
  })();
  const entry: MobileTtsGenerationEntry = {
    controller: abortController,
    promise: generation,
    consumers: 0,
    settled: false,
  };
  mobileTtsGenerationInFlight.set(id, entry);
  const settle = () => {
    entry.settled = true;
    mobileTtsAbortControllers.delete(abortController);
    if (mobileTtsGenerationInFlight.get(id) === entry) {
      mobileTtsGenerationInFlight.delete(id);
    }
  };
  void generation.then(settle, settle);
  return consumeMobileTtsGeneration(id, entry, options.signal);
}
