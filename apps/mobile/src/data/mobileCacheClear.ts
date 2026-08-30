export type MobileCacheClearStep = () => void | Promise<void>;

/**
 * Cache backends are independent. A corrupt or unavailable backend must not
 * prevent later caches from being cleared, but callers still need the first
 * real failure so the operation is never reported as a full success.
 */
export async function runMobileCacheClearSteps(
  steps: readonly MobileCacheClearStep[],
): Promise<void> {
  let firstFailure: unknown;
  let failed = false;

  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstFailure = error;
      }
    }
  }

  if (failed) throw firstFailure;
}
