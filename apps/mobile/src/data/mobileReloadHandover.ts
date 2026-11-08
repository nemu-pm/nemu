/**
 * A caller's own abort, or a run superseded by a newer reload: never a
 * failure to show. Same contract as `isMobileSourceInstallCancellation`.
 */
export function isMobileReloadCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Awaits `started`; while a newer reload has replaced it (`latest()`), awaits
 * that one instead, so a superseded run settles with its successor's result.
 * A cancellation with no successor (unmount) still rejects; callers treat
 * it as "nothing to report" (`isMobileReloadCancellation`).
 */
export async function followMobileSupersedingReload<T>(
  started: Promise<T>,
  latest: () => Promise<T> | null,
): Promise<T> {
  let current = started;
  for (;;) {
    let value: T;
    try {
      value = await current;
    } catch (error) {
      const next = latest();
      if (!isMobileReloadCancellation(error) || !next || next === current) {
        throw error;
      }
      current = next;
      continue;
    }
    const next = latest();
    if (!next || next === current) return value;
    current = next;
  }
}
