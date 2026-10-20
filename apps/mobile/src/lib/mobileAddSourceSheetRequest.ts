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
const listeners = createChangeListeners();

export function requestMobileAddSourceSheet(): void {
  pending = true;
  listeners.notify();
}

/** True once per request; the request is cleared by reading it. */
export function consumeMobileAddSourceSheetRequest(): boolean {
  if (!pending) return false;
  pending = false;
  return true;
}

export function hasPendingMobileAddSourceSheetRequest(): boolean {
  return pending;
}

export const subscribeMobileAddSourceSheetRequest = listeners.subscribe;
