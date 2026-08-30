import type { MobileReaderPageProcessor } from "@/sources/mobileSourcePages";

/**
 * Dispose a processor returned to a cancelled effect only when no newer effect
 * has adopted that exact processor. A current-page change intentionally reuses
 * the processor, so the older effect must not tear it down after its stale
 * processWindow promise settles.
 */
export function disposeMobileReaderPageProcessorIfUnowned(
  candidate: MobileReaderPageProcessor,
  owned: MobileReaderPageProcessor | null | undefined,
): boolean {
  if (candidate === owned) return false;
  candidate.dispose();
  return true;
}
