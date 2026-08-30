/**
 * Source Error Handler
 * 
 * Utilities for handling and displaying source-related errors to users.
 */
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { useCloudflareBypassStore } from "@/components/cloudflare-bypass-dialog";
import {
  extractCfUrlFromMessage,
  isCloudflareErrorMessage,
  readErrorUrl,
} from "@nemu/core/sources";
// Note: Don't import from ./aidoku here to avoid circular dependency

/**
 * Check if an error is a Cloudflare block.
 *
 * Web keeps a strict `instanceof Error` gate: the shared
 * `isCloudflareErrorMessage` primitive handles the message patterns, and the
 * `CloudflareBlockedError` name check is applied here (inside the gate) so a
 * plain string is never classified as Cloudflare on web.
 */
export function isCloudflareError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "CloudflareBlockedError") return true;
  return isCloudflareErrorMessage(error.message);
}

/**
 * Extract URL from Cloudflare error if available.
 *
 * Kept `instanceof Error`-gated to match prior web behavior; the shared
 * `readErrorUrl` / `extractCfUrlFromMessage` primitives do the actual work.
 */
function extractCfUrl(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const url = readErrorUrl(error);
  if (url) return url;
  return extractCfUrlFromMessage(error.message);
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

  // Network errors
  if (error instanceof Error && error.message.includes("fetch")) {
    toast.error(i18n.t("error.networkError"), {
      description: context || error.message,
      duration: 3000,
    });
    return true;
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

