import type { MobileAidokuExecutorSource } from "./mobileSourceExecutor";
import type { MobileProcessedCoverImageRequest } from "./mobileSourceCoverProcessing";

export type MobileProcessedCoverSource = Pick<
  MobileAidokuExecutorSource,
  "hasCoverImageProcessor" | "processCoverImage"
>;

export type MobileProcessedCoverInput = {
  source: MobileProcessedCoverSource;
  /** The source's own rewrite for this cover (url plus any headers). */
  request: MobileProcessedCoverImageRequest;
  /** Same identity the image-request cache keys on. */
  cacheKey: string;
  signal?: AbortSignal | null;
};

export type ResolveMobileProcessedCoverUri = (
  input: MobileProcessedCoverInput,
) => Promise<string | null>;

/**
 * Cover processing needs the bounded native file download, which only exists
 * in the native app. Off-device the cover keeps its plain url+headers path.
 */
export async function resolveMobileProcessedCoverUri(
  input: MobileProcessedCoverInput,
): Promise<string | null> {
  void input;
  return null;
}
