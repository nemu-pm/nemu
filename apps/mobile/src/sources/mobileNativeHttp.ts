import type {
  NemuAidokuHttpClientStatus,
  NemuAidokuHttpRequest,
  NemuAidokuHttpResponse,
  NemuAidokuHttpResponseMode,
} from "../../modules/nemu-aidoku/src/NemuAidoku.types";
import { MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES } from "./mobileNativeHttpLimits";
import { throwIfMobileNativeHttpAborted } from "./mobileNativeHttpAbort";

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
};

function headersToRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function bodyToString(body: BodyInit | null | undefined): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return String(body);
}

export function getMobileNativeHttpStatus(): MobileNativeHttpStatus {
  return {
    available: false,
    platform: "web",
    detail:
      "Native source networking is only available in the mobile native app.",
  };
}

export async function sendMobileNativeHttpRequest(
  request: NemuAidokuHttpRequest,
  signal?: AbortSignal | null,
): Promise<NemuAidokuHttpResponse> {
  void request;
  throwIfMobileNativeHttpAborted(signal);
  throw new Error(
    "Native source networking is only available in the mobile native app.",
  );
}

export function sendMobileNativeHttpRequestSync(
  request: NemuAidokuHttpRequest,
): NemuAidokuHttpResponse {
  void request;
  throw new Error(
    "Native source networking is only available in the mobile native app.",
  );
}

export async function mobileNativeFetch(
  input: string,
  init: MobileNativeFetchInit = {},
): Promise<MobileNativeFetchResponse> {
  throwIfMobileNativeHttpAborted(init.signal);
  const {
    responseMode = "auto",
    maxResponseBytes = MOBILE_NATIVE_HTTP_DEFAULT_MAX_RESPONSE_BYTES,
    ...requestInit
  } = init;
  const response = await fetch(input, {
    ...requestInit,
    body: bodyToString(init.body),
  });
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw new Error(
      `HTTP response exceeds the ${maxResponseBytes} byte safety limit.`,
    );
  }
  const buffer = await response.arrayBuffer();
  throwIfMobileNativeHttpAborted(init.signal);
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength > maxResponseBytes) {
    throw new Error(
      `HTTP response exceeds the ${maxResponseBytes} byte safety limit.`,
    );
  }
  const body = responseMode === "bytes" ? "" : new TextDecoder().decode(bytes);

  return {
    ok: response.ok,
    status: response.status,
    headers: headersToRecord(response.headers),
    body,
    bytes,
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
    arrayBuffer: async () => buffer,
  };
}
