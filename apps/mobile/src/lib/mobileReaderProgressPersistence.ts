/**
 * Identifies the user-visible Reader position that needs a deferred progress
 * write. Saved timestamps deliberately do not participate: a successful write
 * advances them, but must not schedule itself again while the chapter and
 * visible page are unchanged.
 */
export function mobileReaderProgressPersistenceKey(
  readerKey: string,
  displayIndex: number,
): string {
  const normalizedDisplayIndex = Number.isFinite(displayIndex)
    ? Math.max(0, Math.trunc(displayIndex))
    : 0;
  return `${readerKey.length}:${readerKey}:${normalizedDisplayIndex}`;
}

export type MobileReaderIntraPageState = Readonly<{
  intraPageProgress: number;
  intraPageContentIdentity: string;
}>;

const MOBILE_READER_INTRA_PAGE_CONTENT_IDENTITY_PATTERN =
  /^mobile-image:reader-page-state-v1:[0-9a-f]{64}$/;

/**
 * Keep the durable offset and its exact content digest as one bounded value.
 * A fraction without a matching image identity must never move a different
 * chapter/page after source data changes.
 */
export function normalizeMobileReaderIntraPageState(input: {
  intraPageProgress?: number;
  intraPageContentIdentity?: string;
}): MobileReaderIntraPageState | null {
  if (
    typeof input.intraPageProgress !== "number" ||
    !Number.isFinite(input.intraPageProgress) ||
    input.intraPageProgress < 0 ||
    input.intraPageProgress > 1 ||
    typeof input.intraPageContentIdentity !== "string" ||
    !MOBILE_READER_INTRA_PAGE_CONTENT_IDENTITY_PATTERN.test(
      input.intraPageContentIdentity,
    )
  ) {
    return null;
  }
  return {
    intraPageProgress: input.intraPageProgress,
    intraPageContentIdentity: input.intraPageContentIdentity,
  };
}

/** Persistence is a hard precondition for leaving the end prompt. */
export async function persistMobileReaderCompletionBeforeNavigation(input: {
  persist: () => Promise<void>;
  navigate: () => void;
  reportError: (error: unknown) => void;
}): Promise<boolean> {
  try {
    await input.persist();
  } catch (error) {
    input.reportError(error);
    return false;
  }
  input.navigate();
  return true;
}
