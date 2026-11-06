import { createChangeListeners } from "./mobileChangeListeners";

/**
 * A one-shot request for Browse to present its Add Sources sheet.
 *
 * The sheet is Browse-local state (`BrowseScreen`'s `activeSheet`), not a
 * route, so another tab (Settings → Installed Sources' "+") cannot open it by
 * navigating alone. The caller files a request and switches to Browse; Browse
 * consumes it once it is focused — on its first mount when the tab had never
 * been opened, or through `subscribe` when it was already mounted. Consuming
 * clears the request, so a later visit to Browse does not reopen the sheet.
 */
let pending = false;
let pendingDirectoryId: string | null = null;
const listeners = createChangeListeners();

/**
 * `directoryId`: a directory just added. The sheet opens on that directory's
 * sources (a removable filter chip names it), so they are what the user sees
 * first instead of having to find them in the full list.
 */
export function requestMobileAddSourceSheet(
  options: { directoryId?: string } = {},
): void {
  pending = true;
  pendingDirectoryId = options.directoryId ?? null;
  listeners.notify();
}

/** True once per request; the request is cleared by reading it. */
export function consumeMobileAddSourceSheetRequest(): boolean {
  if (!pending) return false;
  pending = false;
  return true;
}

/** The directory the consumed request asked to show first; read once. */
export function consumeMobileAddSourceSheetDirectoryFocus(): string | null {
  const directoryId = pendingDirectoryId;
  pendingDirectoryId = null;
  return directoryId;
}

export const subscribeMobileAddSourceSheetRequest = listeners.subscribe;
