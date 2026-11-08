/**
 * The Settings sheet for adding a directory, while it is up. A system sheet
 * must be down before Browse can present Add Sources, so a `nemu://` link
 * confirmed over it closes it first (the sheet resolves once it has dismissed).
 */
let closeOpenSheet: (() => Promise<void>) | null = null;

export function registerMobileAddSourceDirectorySheet(close: () => Promise<void>): () => void {
  closeOpenSheet = close;
  return () => {
    if (closeOpenSheet === close) closeOpenSheet = null;
  };
}

/** Resolves at once when no such sheet is up. */
export function closeMobileAddSourceDirectorySheet(): Promise<void> {
  return closeOpenSheet?.() ?? Promise.resolve();
}
