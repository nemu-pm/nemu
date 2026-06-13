import type { MangaSource } from "@/lib/sources/types";
import { hasAuthenticationHandlers } from "@/lib/sources/types";

export async function submitSourceBasicLogin(
  source: MangaSource | null,
  key: string,
  username: string,
  password: string,
  fallbackMessage: string
): Promise<void> {
  if (!source || !hasAuthenticationHandlers(source)) {
    throw new Error(fallbackMessage);
  }

  const handlesLogin = await source.handlesBasicLogin();
  if (!handlesLogin) {
    throw new Error(fallbackMessage);
  }

  const success = await source.handleBasicLogin(key, username, password);
  if (!success) {
    throw new Error(fallbackMessage);
  }
}

export async function submitSourceWebLogin(
  source: MangaSource | null,
  key: string,
  cookies: Record<string, string>,
  fallbackMessage: string
): Promise<void> {
  if (Object.keys(cookies).length === 0) {
    return;
  }

  if (!source || !hasAuthenticationHandlers(source)) {
    throw new Error(fallbackMessage);
  }

  const handlesLogin = await source.handlesWebLogin();
  if (!handlesLogin) {
    throw new Error(fallbackMessage);
  }

  const success = await source.handleWebLogin(key, cookies);
  if (!success) {
    throw new Error(fallbackMessage);
  }
}
