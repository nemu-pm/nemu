export function makeAlignmentSampleCacheId(baseId: string, sampleMax: number): string {
  const normalized = Math.max(1, Math.trunc(sampleMax));
  return `${baseId}:s${normalized}`;
}
