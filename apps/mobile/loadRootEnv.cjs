// Bridge the monorepo root `.env*` files into the Expo/Metro process so the
// mobile bundle bakes in the same Convex deployment the web app targets.
//
// File precedence mirrors Vite (`vite build` reads `.env.production.local`
// first) and Expo's own `.env` loading, keyed on NODE_ENV — which
// `expo export:embed` sets to "production" for every non-Debug Xcode/Gradle
// bundle and "development" for Metro dev servers:
//
//   production:  .env.production.local, .env.production, .env
//   test:        .env.test.local,       .env.test,       .env
//   development: .env.development.local, .env.local, .env.development, .env
//
// A production bundle deliberately never reads `.env.local`. That file holds
// the *dev* deployment on developer machines, and falling back to it once
// shipped a release build that talked to the dev backend, so a fresh install
// signed in to an empty account. Release builds must get their Convex URL from
// `.env.production(.local)` or from the environment (EAS env vars, CI).
const fs = require("fs");
const path = require("path");
const { config } = require("dotenv");

const DEFAULT_ROOT_DIR = path.resolve(__dirname, "../..");

function clean(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function mirrorEnv(env, target, source) {
  if (clean(env[target])) return;
  const value = clean(env[source]);
  if (value) env[target] = value;
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

function resolveMode(env) {
  const nodeEnv = clean(env.NODE_ENV);
  if (nodeEnv === "production" || nodeEnv === "test") return nodeEnv;
  return "development";
}

function envFilesForMode(mode) {
  switch (mode) {
    case "production":
      return [".env.production.local", ".env.production", ".env"];
    case "test":
      return [".env.test.local", ".env.test", ".env"];
    default:
      return [
        ".env.development.local",
        ".env.local",
        ".env.development",
        ".env",
      ];
  }
}

/**
 * Load root env files for the current mode into `env` (defaults to
 * `process.env`; existing values always win) and mirror `VITE_CONVEX_*` into
 * the `EXPO_PUBLIC_CONVEX_*` names the app reads. Returns what was resolved so
 * callers and tests can assert on it.
 */
module.exports = function loadRootEnv(options = {}) {
  const env = options.env ?? process.env;
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const mode = resolveMode(env);
  const loadedFiles = [];

  for (const name of envFilesForMode(mode)) {
    const filePath = path.join(rootDir, name);
    if (!fs.existsSync(filePath)) continue;
    config({ path: filePath, processEnv: env, override: false, quiet: true });
    loadedFiles.push(name);
  }

  mirrorEnv(env, "EXPO_PUBLIC_CONVEX_URL", "VITE_CONVEX_URL");
  mirrorEnv(env, "EXPO_PUBLIC_CONVEX_SITE_URL", "VITE_CONVEX_SITE_URL");

  if (!clean(env.EXPO_PUBLIC_CONVEX_SITE_URL)) {
    const siteUrl = deriveConvexSiteUrl(env.EXPO_PUBLIC_CONVEX_URL);
    if (siteUrl) env.EXPO_PUBLIC_CONVEX_SITE_URL = siteUrl;
  }

  const convexUrl = clean(env.EXPO_PUBLIC_CONVEX_URL);
  if (!options.silent) {
    // One line per bundler process so build logs show which deployment a
    // bundle was baked against. The URL itself is public but kept out of logs.
    console.log(
      `[loadRootEnv] mode=${mode} files=${loadedFiles.join(",") || "(none)"} convexUrl=${convexUrl ? "set" : "unset"}`,
    );
  }
  if (mode === "production" && !convexUrl && !options.silent) {
    console.warn(
      [
        "",
        "[loadRootEnv] WARNING: production bundle has no Convex URL.",
        "  Looked for .env.production.local / .env.production / .env in",
        `  ${rootDir} and EXPO_PUBLIC_CONVEX_URL / VITE_CONVEX_URL in the`,
        "  environment. .env.local (dev deployment) is intentionally ignored",
        "  for production bundles, so this build will run local-only with",
        "  cloud sync disabled.",
        "",
      ].join("\n"),
    );
  }

  return { mode, loadedFiles, convexUrl: convexUrl ?? null };
};

module.exports.resolveMode = resolveMode;
module.exports.envFilesForMode = envFilesForMode;
module.exports.deriveConvexSiteUrl = deriveConvexSiteUrl;
