/**
 * Source Error Handler
 * 
 * Utilities for handling and displaying source-related errors to users.
 */
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { useCloudflareBypassStore } from "@/components/cloudflare-bypass-dialog";
// Note: Don't import from ./aidoku here to avoid circular dependency

/**
 * Check if an error is a Cloudflare block
 */
export function isCloudflareError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Direct CloudflareBlockedError
    if (error.name === "CloudflareBlockedError") return true;
    // Error message patterns
    if (msg.includes("cloudflare blocked")) return true;
    if (msg.includes("cloudflare challenge")) return true;
    if (msg.includes("cloudflare protection")) return true;
    // Image 403 errors often indicate CF/hotlink protection
    if (msg.includes("fetch image") && msg.includes("403")) return true;
  }
  return false;
}

/**
 * Extract URL from Cloudflare error if available
 */
function extractCfUrl(error: unknown): string | undefined {
  if (error instanceof Error) {
    // CloudflareBlockedError has url property
    if ("url" in error && typeof (error as { url: unknown }).url === "string") {
      return (error as { url: string }).url;
    }
    // Parse URL from error message: "Cloudflare challenge detected for https://... (status 403)"
    const match = error.message.match(/for (https?:\/\/[^\s(]+)/);
    if (match) return match[1];
    // Also try "Cloudflare blocked: ..." format
    const match2 = error.message.match(/blocked[:\s]+(https?:\/\/[^\s]+)/i);
    if (match2) return match2[1];
  }
  return undefined;
}

/**
 * Handle a source error and show appropriate UI
 * Returns true if error was handled (shown to user), false if not
 */
export function handleSourceError(error: unknown, context?: string): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  console.log("[ErrorHandler] Handling error:", msg, "isCF:", isCloudflareError(error));
  
  if (isCloudflareError(error)) {
    const url = extractCfUrl(error);
    console.log("[ErrorHandler] Showing CF dialog for:", url);
    // Show the Cloudflare bypass dialog
    useCloudflareBypassStore.getState().show(url);
    return true;
  }

  // Network errors. Cover both web fetch failures ("Failed to fetch", etc.)
  // and CapacitorHttp native-bridge errors ("Request failed", URLSession /
  // OkHttp messages) so users on iOS/Android still see the toast instead of
  // a silent console.error.
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const isNetworkError =
      msg.includes("fetch") ||
      msg.includes("request failed") ||
      msg.includes("network") ||
      msg.includes("nsurlerror") ||
      msg.includes("connection") ||
      msg.includes("timeout") ||
      msg.includes("unreachable");
    if (isNetworkError) {
      toast.error(i18n.t("error.networkError"), {
        description: context || error.message,
        duration: 3000,
      });
      return true;
    }
  }

  // Log unhandled errors
  console.error(`[Source Error] ${context || "Unknown context"}:`, error);
  return false;
}

/**
 * Wrap an async function with error handling
 */
export function withSourceErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleSourceError(error, context);
      throw error; // Re-throw so caller can also handle
    }
  }) as T;
}

