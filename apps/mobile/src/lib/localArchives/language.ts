import type { AppLanguage } from "@/data/schema";

let language: AppLanguage = "en";

/** Kept current by the language provider; the executor has no React context. */
export function setLocalArchiveLanguage(next: AppLanguage): void {
  language = next;
}

export function getLocalArchiveLanguage(): AppLanguage {
  return language;
}
