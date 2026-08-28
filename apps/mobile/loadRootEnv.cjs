const fs = require("fs");
const path = require("path");
const { config } = require("dotenv");

const rootEnvPath = path.resolve(__dirname, "../../.env.local");

function clean(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function mirrorEnv(target, source) {
  if (clean(process.env[target])) return;
  const value = clean(process.env[source]);
  if (value) process.env[target] = value;
}

function deriveConvexSiteUrl(convexUrl) {
  const value = clean(convexUrl);
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const suffix = ".convex.cloud";
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !parsed.hostname.endsWith(suffix) ||
      parsed.hostname.length <= suffix.length
    ) {
      return undefined;
    }
    const deployment = parsed.hostname.slice(0, -suffix.length);
    return `https://${deployment}.convex.site`;
  } catch {
    return undefined;
  }
}

module.exports = function loadRootEnv() {
  if (fs.existsSync(rootEnvPath)) {
    config({ path: rootEnvPath, override: false, quiet: true });
  }

  mirrorEnv("EXPO_PUBLIC_CONVEX_URL", "VITE_CONVEX_URL");
  mirrorEnv("EXPO_PUBLIC_CONVEX_SITE_URL", "VITE_CONVEX_SITE_URL");

  if (!clean(process.env.EXPO_PUBLIC_CONVEX_SITE_URL)) {
    const siteUrl = deriveConvexSiteUrl(process.env.EXPO_PUBLIC_CONVEX_URL);
    if (siteUrl) process.env.EXPO_PUBLIC_CONVEX_SITE_URL = siteUrl;
  }
};
