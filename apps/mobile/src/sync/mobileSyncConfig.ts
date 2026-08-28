export type MobileSyncConfig = {
  convexUrl: string | null;
  siteUrl: string | null;
  scheme: string;
  configured: boolean;
};

type SyncEnv = Record<string, string | undefined>;

function getDefaultMobileSyncEnv(): SyncEnv {
  return {
    // Expo only inlines statically referenced EXPO_PUBLIC_ process.env reads.
    EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,
    EXPO_PUBLIC_CONVEX_SITE_URL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
    EXPO_PUBLIC_APP_SCHEME: process.env.EXPO_PUBLIC_APP_SCHEME,
    VITE_CONVEX_URL: process.env.VITE_CONVEX_URL,
    VITE_CONVEX_SITE_URL: process.env.VITE_CONVEX_SITE_URL,
  };
}

function cleanEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSyncOrigin(
  rawUrl: string | null | undefined,
): string | null {
  const value = rawUrl?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function deriveConvexSiteUrl(
  convexUrl: string | null | undefined,
): string | null {
  const normalized = normalizeSyncOrigin(convexUrl);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  if (
    !parsed.hostname.endsWith(".convex.cloud") ||
    parsed.hostname.length <= ".convex.cloud".length
  ) {
    return null;
  }
  const deployment = parsed.hostname.slice(0, -".convex.cloud".length);
  return `https://${deployment}.convex.site`;
}

export function resolveExpoScheme(
  scheme: string | string[] | null | undefined,
  fallback = "nemu"
): string {
  if (Array.isArray(scheme)) {
    return scheme.find((item) => item.trim().length > 0) ?? fallback;
  }
  const trimmed = scheme?.trim();
  return trimmed ? trimmed : fallback;
}

export function getMobileSyncConfig(
  env: SyncEnv = getDefaultMobileSyncEnv(),
  scheme: string | string[] | null | undefined = env.EXPO_PUBLIC_APP_SCHEME
): MobileSyncConfig {
  const convexUrl = normalizeSyncOrigin(
    cleanEnvValue(env.EXPO_PUBLIC_CONVEX_URL) ??
      cleanEnvValue(env.VITE_CONVEX_URL),
  );
  const siteUrl =
    normalizeSyncOrigin(
      cleanEnvValue(env.EXPO_PUBLIC_CONVEX_SITE_URL) ??
        cleanEnvValue(env.VITE_CONVEX_SITE_URL),
    ) ??
    deriveConvexSiteUrl(convexUrl);
  const resolvedScheme = resolveExpoScheme(scheme);

  return {
    convexUrl,
    siteUrl,
    scheme: resolvedScheme,
    configured: Boolean(convexUrl && siteUrl),
  };
}

export const mobileSyncConfig = getMobileSyncConfig();
