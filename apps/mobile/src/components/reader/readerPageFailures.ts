/**
 * Why the pages on screen failed, for what stands in for each page's Retry
 * capsule under VoiceOver: the stage reads as one element, so nothing inside
 * it can be reached on its own.
 */
export type ReaderPageFailure<Page> =
  | { kind: "processing"; page: Page }
  | { kind: "image"; page: Page; identity: string }
  | { kind: "segments"; page: Page; errorKeys: string[] };

export function readerSegmentErrorKey(identity: string, segmentIndex: number): string {
  return `${identity}:segment:${segmentIndex}`;
}

export function readerVisiblePageFailures<Page extends { imageProcessing?: string }>(
  pages: readonly Page[],
  identityOf: (page: Page) => string,
  errorKeys: Iterable<string>,
): ReaderPageFailure<Page>[] {
  const keys = [...errorKeys];
  const failures: ReaderPageFailure<Page>[] = [];
  for (const page of pages) {
    if (page.imageProcessing === "failed") {
      failures.push({ kind: "processing", page });
      continue;
    }
    const identity = identityOf(page);
    if (keys.includes(identity)) {
      failures.push({ kind: "image", page, identity });
      continue;
    }
    const segmentPrefix = readerSegmentErrorKey(identity, 0).slice(0, -1);
    const segmentKeys = keys.filter((key) => key.startsWith(segmentPrefix));
    if (segmentKeys.length > 0) failures.push({ kind: "segments", page, errorKeys: segmentKeys });
  }
  return failures;
}
