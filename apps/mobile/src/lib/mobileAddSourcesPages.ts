import { isSelfHostedKind, type SelfHostedKind } from "./selfHosted/policy";

/**
 * The pages pushed over the Add Sources list, as values on its stack: Add
 * Source Directory, or the server picker and on top of it one server's form.
 */
export const ADD_DIRECTORY_PAGE = "add-directory";
export const SERVER_PICKER_PAGE = "server-picker";
const SERVER_FORM_PREFIX = "server-form:";

export function mobileServerFormPage(kind: SelfHostedKind): string {
  return `${SERVER_FORM_PREFIX}${kind}`;
}

export function mobileServerFormPageKind(page: string | undefined): SelfHostedKind | null {
  if (!page?.startsWith(SERVER_FORM_PREFIX)) return null;
  const kind = page.slice(SERVER_FORM_PREFIX.length);
  return isSelfHostedKind(kind) ? kind : null;
}

/** A swipe-down would discard what is typed into the server form, or walk away from a connection in flight. */
export function mobileServerSourceFormBlocksDismiss(
  fields: { server: string; name: string; username: string; password: string; apiKey: string },
  saving: boolean,
): boolean {
  return saving || Object.values(fields).some((value) => value.length > 0);
}

/** The pages `next` adds to `previous`: each of these starts fresh. */
export function mobileAddSourcesEnteredPages(previous: readonly string[], next: readonly string[]): string[] {
  return next.filter((page) => !previous.includes(page));
}
