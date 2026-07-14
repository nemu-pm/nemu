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
  if (!value || !value.includes(".convex.cloud")) return undefined;
  return value.replace(".convex.cloud", ".convex.site");
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
