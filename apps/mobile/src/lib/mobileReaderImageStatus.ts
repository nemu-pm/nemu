type MobileReaderImageStatusInput = {
  error?: string;
  hasNaturalSize: boolean;
};

/**
 * Reader image status must survive responsive gallery remounts. A native
 * Image can emit another load-start when the paged gallery is rebuilt for a
 * new width, even though that page already completed and is immediately
 * available from cache. Natural size is our durable success signal; an error
 * is the durable failure signal. Only the absence of both is still loading.
 */
export function isMobileReaderImageLoading({
  error,
  hasNaturalSize,
}: MobileReaderImageStatusInput): boolean {
  return !hasNaturalSize && !error;
}
