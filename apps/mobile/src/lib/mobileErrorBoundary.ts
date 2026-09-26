import { normalizeAppLanguage } from "./mobileLanguageSettings";
import { sanitizeMobileErrorDiagnostic } from "./mobileSourceErrors";

export type MobileErrorLogInput = {
  error: Error;
  routePath?: string | null;
  timestamp?: string;
  componentStack?: string | null;
};

/**
 * The first usable locale tag from `sources`, tried in order. A source that
 * throws or returns nothing is skipped.
 */
export function firstMobileSystemLocale(
  sources: ReadonlyArray<() => string | null | undefined>,
): string | undefined {
  for (const source of sources) {
    try {
      const locale = source()?.trim();
      if (locale) return locale;
    } catch {
      // e.g. `Intl` is not defined on Android's ICU-less JavaScriptCore.
    }
  }
  return undefined;
}

export function resolveMobileErrorBoundaryLanguage(locale: string | null | undefined) {
  const language = locale?.split(/[-_]/)[0]?.toLowerCase();
  return normalizeAppLanguage(language);
}

export function formatMobileErrorSummary(error: Error): string {
  const name = sanitizeMobileErrorDiagnostic(error.name) ?? "Error";
  const message = sanitizeMobileErrorDiagnostic(error) ?? "";
  return message ? `${name}: ${message}` : name;
}

export function formatMobileErrorLog({
  error,
  routePath,
  timestamp = new Date().toISOString(),
  componentStack,
}: MobileErrorLogInput): string {
  const lines: string[] = [`Timestamp: ${timestamp}`];
  const safeRoutePath = sanitizeMobileErrorDiagnostic(routePath);
  if (safeRoutePath) lines.push(`Route: ${safeRoutePath}`);

  lines.push("");
  const safeName = sanitizeMobileErrorDiagnostic(error.name) ?? "Error";
  lines.push(`Error: ${safeName}`);
  const safeMessage = sanitizeMobileErrorDiagnostic(error);
  if (safeMessage) lines.push(`Message: ${safeMessage}`);

  const safeStack = sanitizeMobileErrorDiagnostic(error.stack);
  if (safeStack) {
    lines.push("");
    lines.push("Stack Trace:");
    lines.push(safeStack);
  }

  const safeComponentStack = sanitizeMobileErrorDiagnostic(componentStack);
  if (safeComponentStack) {
    lines.push("");
    lines.push("Component Stack:");
    lines.push(safeComponentStack);
  }

  return lines.join("\n");
}
