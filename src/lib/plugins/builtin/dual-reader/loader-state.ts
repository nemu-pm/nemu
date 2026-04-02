/**
 * Module-level loading guards for dual-reader secondary pages/images.
 * Extracted from components.tsx so the plugin index can reset them
 * synchronously without pulling in the heavy component bundle.
 */

export const loadingSecondaryChapters = new Set<string>();
export const loadingSecondaryImages = new Set<string>();

export function resetDualReadLoaders() {
  loadingSecondaryChapters.clear();
  loadingSecondaryImages.clear();
}
