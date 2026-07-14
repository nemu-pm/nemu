import type {
  NemuAidokuHttpFileRequest,
  NemuAidokuHttpFileResponse,
} from "../../modules/nemu-aidoku/src/NemuAidoku.types";
import { throwIfMobileNativeHttpAborted } from "./mobileNativeHttpAbort";

export type MobileNativeHttpFileRequest = Omit<
  NemuAidokuHttpFileRequest,
  "requestId"
>;
export type MobileNativeHttpFileResponse = NemuAidokuHttpFileResponse & {
  fileUri: string;
  byteLength: number;
};

/** Native-only. The base module deliberately has no browser download fallback. */
export async function downloadMobileNativeHttpFile(
  request: MobileNativeHttpFileRequest,
  signal?: AbortSignal | null,
): Promise<MobileNativeHttpFileResponse> {
  void request;
  throwIfMobileNativeHttpAborted(signal);
  throw new Error(
    "Native source file downloads are only available in the mobile native app.",
  );
}
