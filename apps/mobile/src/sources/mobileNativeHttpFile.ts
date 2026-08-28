import type {
  NemuAidokuHttpFileRequest,
  NemuAidokuHttpFileResponse,
} from "../../modules/nemu-aidoku/src/NemuAidoku.types";
import { throwIfMobileNativeHttpAborted } from "./mobileNativeHttpAbort";

export type MobileNativeHttpFileRequest = Omit<
  NemuAidokuHttpFileRequest,
  "requestId"
>;
type MobileNativeHttpResponseBase = Omit<
  NemuAidokuHttpFileResponse,
  | "kind"
  | "fileUri"
  | "byteLength"
  | "manifestVersion"
  | "imageWidth"
  | "imageHeight"
  | "imageSegments"
>;
export type MobileNativeHttpFileResponse = MobileNativeHttpResponseBase & {
  kind: "file";
  fileUri: string;
  byteLength: number;
};
export type MobileNativeHttpImageSegment = Readonly<{
  fileUri: string;
  byteLength: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
}>;
export type MobileNativeHttpSegmentedImageResponse =
  MobileNativeHttpResponseBase & {
    kind: "segmented-image";
    byteLength: number;
    manifestVersion: 1;
    imageWidth: number;
    imageHeight: number;
    imageSegments: MobileNativeHttpImageSegment[];
  };
export type MobileNativeHttpDownloadResponse =
  | MobileNativeHttpFileResponse
  | MobileNativeHttpSegmentedImageResponse;

/** Native-only. The base module deliberately has no browser download fallback. */
export async function downloadMobileNativeHttpFile(
  request: MobileNativeHttpFileRequest,
  signal?: AbortSignal | null,
): Promise<MobileNativeHttpDownloadResponse> {
  void request;
  throwIfMobileNativeHttpAborted(signal);
  throw new Error(
    "Native source file downloads are only available in the mobile native app.",
  );
}
