import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import type {
  NemuAidokuHttpClientStatus,
  NemuAidokuHttpRequest,
  NemuAidokuHttpResponse,
  NemuAidokuHttpResponseMode,
} from "../../modules/nemu-aidoku/src/NemuAidoku.types";
import {
  markMobilePerformance,
  measureMobilePerformance,
} from "@/lib/mobilePerformance";
import { decodeBase64 } from "@/lib/mobileBase64";
import { assertBase64DecodedByteLimit } from "./sourcePackageSafety";
import { MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES } from "./mobileNativeHttpLimits";
import {
  createMobileNativeHttpRequestId,
  runAbortableMobileNativeHttpRequest,
  throwIfMobileNativeHttpAborted,
} from "./mobileNativeHttpAbort";
import { runMobileHttpRequestWithRetry } from "./mobileNativeHttpRetry";
import {
  assertMobileNativeHttpCapability,
  resolveMobileNativeHttpCapabilityStatus,
} from "./mobileNativeHttpCapabilities";

const DEFAULT_TIMEOUT_MS = 30000;
let cachedMobileNativeHttpStatus: MobileNativeHttpStatus | null = null;

export type MobileNativeHttpStatus = NemuAidokuHttpClientStatus;

export type MobileNativeFetchResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: Uint8Array;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type MobileNativeFetchInit = RequestInit & {
  responseMode?: NemuAidokuHttpResponseMode;
  maxResponseBytes?: number;
  requireHttps?: boolean;
};

function normalizeHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

function bodyToString(body: BodyInit | null | undefined): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Uint8Array) {
    return Array.from(body, (byte) => String.fromCharCode(byte)).join("");
  }
  return String(body);
}

export function getMobileNativeHttpStatus(): MobileNativeHttpStatus {
  if (cachedMobileNativeHttpStatus) return cachedMobileNativeHttpStatus;
  try {
    cachedMobileNativeHttpStatus = resolveMobileNativeHttpCapabilityStatus(
      NemuAidokuModule.getHttpClientStatus(),
      NemuAidokuModule,
    );
    return cachedMobileNativeHttpStatus;
  } catch (error) {
    cachedMobileNativeHttpStatus = {
      available: false,
      platform: "unknown",
      detail:
        error instanceof Error
          ? error.message
          : "Native source networking is not available.",
    };
    return cachedMobileNativeHttpStatus;
  }
}

export async function sendMobileNativeHttpRequest(
  request: NemuAidokuHttpRequest,
  signal?: AbortSignal | null,
): Promise<NemuAidokuHttpResponse> {
  assertMobileNativeHttpCapability(getMobileNativeHttpStatus());
  const requestId = request.requestId ?? createMobileNativeHttpRequestId();
  const response = await runAbortableMobileNativeHttpRequest({
    requestId,
    signal,
    prepare: (id) => {
      NemuAidokuModule.prepareHttpRequest(id);
    },
    cancel: (id) => {
      NemuAidokuModule.cancelHttpRequest(id);
    },
    release: (id) => {
      NemuAidokuModule.releaseHttpRequest(id);
    },
    execute: () =>
      NemuAidokuModule.sendHttpRequest({
        ...request,
        requestId,
        maxResponseBytes:
          request.maxResponseBytes ?? MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES,
      }),
  });
  if (response.status === 0 && response.error) {
    throw new Error(response.error);
  }
  return response;
}

export function sendMobileNativeHttpRequestSync(
  request: NemuAidokuHttpRequest,
): NemuAidokuHttpResponse {
  assertMobileNativeHttpCapability(getMobileNativeHttpStatus());
  const response = NemuAidokuModule.sendHttpRequestSync({
    ...request,
    maxResponseBytes:
      request.maxResponseBytes ?? MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES,
  });
  if (response.status === 0 && response.error) {
    throw new Error(response.error);
  }
  return response;
}

export async function mobileNativeFetch(
  input: string,
  init: MobileNativeFetchInit = {},
): Promise<MobileNativeFetchResponse> {
  throwIfMobileNativeHttpAborted(init.signal);
  const requestStartedAt = markMobilePerformance("native.http.request.start", {
    method: init.method ?? "GET",
    hasBody: init.body != null,
  });
  const maxResponseBytes =
    init.maxResponseBytes ?? MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES;
  const method = (init.method ?? "GET").toUpperCase();
  // Idempotent requests only: a transient cold-start failure of the loopback
  // proxy egress (DNS resolution / pinned-IP connect) is retried with short
  // backoff; caller aborts and deadline cancellations always win.
  const idempotent = init.body == null && (method === "GET" || method === "HEAD");
  const request = {
    url: input,
    method,
    headers: normalizeHeaders(init.headers),
    body: bodyToString(init.body),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    responseMode: init.responseMode ?? "auto",
    maxResponseBytes,
    requireHttps: init.requireHttps === true,
  };
  const response = idempotent
    ? await runMobileHttpRequestWithRetry(
        () => sendMobileNativeHttpRequest(request, init.signal),
        { signal: init.signal },
      )
    : await sendMobileNativeHttpRequest(request, init.signal);
  throwIfMobileNativeHttpAborted(init.signal);
  measureMobilePerformance("native.http.request.complete", requestStartedAt, {
    status: response.status,
  });

  const encodedBytes = response.bytesBase64 ?? "";
  assertBase64DecodedByteLimit(
    encodedBytes,
    maxResponseBytes,
    "Native HTTP response",
  );
  const decodeStartedAt = markMobilePerformance("native.http.decode.start");
  const bytes = decodeBase64(encodedBytes);
  throwIfMobileNativeHttpAborted(init.signal);
  measureMobilePerformance("native.http.decode.complete", decodeStartedAt, {
    byteLength: bytes.byteLength,
  });
  const body = response.body ?? "";

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    headers: Object.fromEntries(
      Object.entries(response.headers ?? {}).map(([key, value]) => [
        key.toLowerCase(),
        String(value),
      ]),
    ),
    body,
    bytes,
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
    arrayBuffer: async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
  };
}
