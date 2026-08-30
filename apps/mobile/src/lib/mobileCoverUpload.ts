import { api } from "../../../../convex/_generated/api";
import { mobileNativeFetch } from "@/sources/mobileNativeHttp";
import { mobileConvexRef } from "@/sync/mobileSyncRuntime";

const MOBILE_R2_PUBLIC_URL = "https://r2.nemu.pm";
export const MOBILE_COVER_UPLOAD_UNAVAILABLE_ERROR =
  "mobile-cover-upload-unavailable";
// Remote cover upload materializes the encoded response before constructing
// the upload Blob, so keep this user-action path within the same 8 MiB cap as
// OCR and reader processing. Persistent display caching remains streamed.
export const MOBILE_COVER_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export function assertMobileCoverUploadByteLength(byteLength: number): void {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > MOBILE_COVER_UPLOAD_MAX_BYTES
  ) {
    throw new Error(
      `Cover image exceeds the ${MOBILE_COVER_UPLOAD_MAX_BYTES} byte safety limit.`,
    );
  }
}

type UploadUrlResult = {
  key: string;
  url: string;
};

type MobileCoverUploadClient = {
  mutation: (functionReference: unknown, args: unknown) => Promise<unknown>;
};

type MobileCoverUploadFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type MobileCoverUploadOptions = {
  bytes: Uint8Array;
  contentType?: string | null;
  client?: MobileCoverUploadClient | null;
  fetcher?: MobileCoverUploadFetcher;
};

type MobileRemoteCoverUploadOptions = {
  url: string;
  headers?: Record<string, string>;
  client?: MobileCoverUploadClient | null;
  fetcher?: MobileCoverUploadFetcher;
};

export function getMobileCoverPublicUrl(key: string): string {
  return `${MOBILE_R2_PUBLIC_URL}/${key}`;
}

export function getMobileCoverContentType(input: {
  mimeType?: string | null;
  uri?: string | null;
}): string {
  const mimeType = input.mimeType?.trim();
  if (mimeType) return mimeType;

  const uri = input.uri?.toLowerCase() ?? "";
  if (uri.endsWith(".png")) return "image/png";
  if (uri.endsWith(".webp")) return "image/webp";
  if (uri.endsWith(".gif")) return "image/gif";
  if (uri.endsWith(".heic")) return "image/heic";
  if (uri.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

export async function uploadMobileCoverBytes({
  bytes,
  contentType,
  client,
  fetcher = fetch,
}: MobileCoverUploadOptions): Promise<string> {
  assertMobileCoverUploadByteLength(bytes.byteLength);
  const uploadClient =
    client ??
    (mobileConvexRef.current as unknown as MobileCoverUploadClient | null);
  if (!uploadClient) {
    throw new Error(MOBILE_COVER_UPLOAD_UNAVAILABLE_ERROR);
  }

  const { key, url } = (await uploadClient.mutation(
    api.r2.generateUploadUrl,
    {},
  )) as UploadUrlResult;
  const resolvedContentType = contentType?.trim() || "image/jpeg";
  const uploadBuffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        );
  const result = await fetcher(url, {
    method: "PUT",
    headers: { "Content-Type": resolvedContentType },
    body: new Blob([uploadBuffer as ArrayBuffer], { type: resolvedContentType }),
  });

  if (!result.ok) {
    throw new Error(`Failed to upload cover: ${result.statusText}`);
  }

  await uploadClient.mutation(api.r2.syncMetadata, { key });
  return getMobileCoverPublicUrl(key);
}

export async function uploadMobileRemoteCover({
  url,
  headers,
  client,
  fetcher = fetch,
}: MobileRemoteCoverUploadOptions): Promise<string> {
  if (fetcher === fetch) {
    const response = await mobileNativeFetch(url, {
      ...(headers ? { headers } : {}),
      responseMode: "bytes",
      maxResponseBytes: MOBILE_COVER_UPLOAD_MAX_BYTES,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch cover: ${response.status}`);
    }

    const contentType =
      response.headers["content-type"] ??
      getMobileCoverContentType({ uri: url });

    return uploadMobileCoverBytes({
      bytes: response.bytes,
      contentType,
      client,
      fetcher,
    });
  }

  const response = await fetcher(url, headers ? { headers } : undefined);
  if (!response.ok) {
    throw new Error(`Failed to fetch cover: ${response.statusText}`);
  }

  const contentType =
    response.headers.get("Content-Type") ??
    getMobileCoverContentType({ uri: url });

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength)) {
    assertMobileCoverUploadByteLength(declaredLength);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertMobileCoverUploadByteLength(bytes.byteLength);

  return uploadMobileCoverBytes({
    bytes,
    contentType,
    client,
    fetcher,
  });
}
