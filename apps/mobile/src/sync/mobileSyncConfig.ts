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

export function deriveConvexSiteUrl(convexUrl: string | null | undefined): string | null {
  if (!convexUrl) return null;
  if (!convexUrl.includes(".convex.cloud")) return null;
  return convexUrl.replace(".convex.cloud", ".convex.site");
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
  const convexUrl =
    cleanEnvValue(env.EXPO_PUBLIC_CONVEX_URL) ??
    cleanEnvValue(env.VITE_CONVEX_URL);
  const siteUrl =
    cleanEnvValue(env.EXPO_PUBLIC_CONVEX_SITE_URL) ??
    cleanEnvValue(env.VITE_CONVEX_SITE_URL) ??
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
