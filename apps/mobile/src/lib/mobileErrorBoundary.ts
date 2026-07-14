import { normalizeAppLanguage } from "./mobileLanguageSettings";

export type MobileErrorLogInput = {
  error: Error;
  routePath?: string | null;
  timestamp?: string;
  componentStack?: string | null;
};

export function resolveMobileErrorBoundaryLanguage(locale: string | null | undefined) {
  const language = locale?.split(/[-_]/)[0]?.toLowerCase();
  return normalizeAppLanguage(language);
}

export function formatMobileErrorSummary(error: Error): string {
  const message = error.message.trim();
  return message ? `${error.name}: ${message}` : error.name;
}

export function formatMobileErrorLog({
  error,
  routePath,
  timestamp = new Date().toISOString(),
  componentStack,
}: MobileErrorLogInput): string {
  const lines: string[] = [`Timestamp: ${timestamp}`];
  if (routePath?.trim()) lines.push(`Route: ${routePath.trim()}`);

  lines.push("");
  lines.push(`Error: ${error.name}`);
  if (error.message.trim()) lines.push(`Message: ${error.message.trim()}`);

  if (error.stack?.trim()) {
    lines.push("");
    lines.push("Stack Trace:");
    lines.push(error.stack.trim());
  }

  if (componentStack?.trim()) {
    lines.push("");
    lines.push("Component Stack:");
    lines.push(componentStack.trim());
  }

  return lines.join("\n");
}
