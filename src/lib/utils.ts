import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a timestamp to a relative time string (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

/**
 * Format language codes for display, matching Swift's behavior:
 * - Multi-language sources (count > 1 or first is "multi") return a translated "Multi-language" string
 * - Single language sources return the localized language name (e.g., "English" for "en")
 * - Falls back to the language code if localization fails
 * 
 * @param languages Array of language codes (e.g., ["en"], ["en", "ja"], ["multi"])
 * @param t Translation function from react-i18next (optional, for multi-language label)
 * @param appLanguage App language setting ("en" or "zh") - if not provided, uses browser language
 * @returns Formatted language string for display
 */
/**
 * Copy text to clipboard with iOS Safari fallback.
 * navigator.clipboard.writeText() doesn't work reliably on iOS Safari,
 * so we use execCommand('copy') as a fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern API first
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for iOS Safari and older browsers
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  try {
    const success = document.execCommand('copy')
    return success
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

export function formatLanguageDisplay(
  languages: string[] | undefined | null,
  t?: (key: string) => string,
  appLanguage?: string
): string {
  if (!languages || languages.length === 0) {
    return "?";
  }

  // Check if multi-language: count > 1 or first is "multi"
  const isMultiLanguage = languages.length > 1 || languages[0] === "multi";
  
  if (isMultiLanguage) {
    // Return translated "Multi-language" if translation function provided
    return t ? t("languages.multi") : "Multi-language";
  }

  // Single language: get localized name
  const langCode = languages[0];
  
  // Try i18n first (languages.en, languages.ja, etc.)
  if (t) {
    const i18nKey = `languages.${langCode}`;
    const translated = t(i18nKey);
    // i18next returns the key if translation not found
    if (translated && translated !== i18nKey) {
      return translated;
    }
  }
  
  // Fallback to Intl.DisplayNames
  const displayLang = appLanguage || (typeof navigator !== "undefined" ? navigator.language : "en");
  
  try {
    const displayName = new Intl.DisplayNames([displayLang], {
      type: "language",
    }).of(langCode);
    
    if (displayName) {
      return displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }
  } catch {
    // Intl API not available or failed
  }

  // Fallback to uppercase code
  return langCode.toUpperCase();
}

