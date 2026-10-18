import { getLocalArchiveLanguage } from "@/lib/localArchives/language";
import type { AppLanguage } from "@/data/schema";

/** The app language, as the executor sees it (no React context there). */
export function getSelfHostedLanguage(): AppLanguage {
  return getLocalArchiveLanguage();
}
