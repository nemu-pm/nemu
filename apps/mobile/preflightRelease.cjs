// Release preflight: refuses to bundle unless a production bundle would bake a
// production Convex deployment (see loadRootEnv.cjs for how it is resolved).
//
//   - metro.config.js calls `enforceReleaseEnv` whenever the bundle mode is
//     production (NODE_ENV=production: Xcode Release archive, Gradle release,
//     `expo export` for production), so a bad URL fails the bundle step.
//     Debug and development bundles are never checked.
//   - `node preflightRelease.cjs` (or `bun run preflight:release`) runs the
//     same check by hand.
//
// Never prints the URLs themselves, only which rule failed.
const fs = require("fs");
const path = require("path");
const { parse } = require("dotenv");
const loadRootEnv = require("./loadRootEnv.cjs");

// Hosts a production deployment may use: the Convex-hosted domain, or the
// nemu.pm custom domain (the production site URL, convex.nemu.pm, lives there).
const ALLOWED_HOST_SUFFIXES = [".convex.cloud", ".convex.site", ".nemu.pm"];
// Deployment names that are development backends, whatever domain fronts them.
const DEV_DEPLOYMENT_NAMES = ["fastidious-hare"];

function isAllowedHost(hostname) {
  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function isDevHost(hostname) {
  const label = hostname.split(".")[0];
  return DEV_DEPLOYMENT_NAMES.some((name) => label === name || label.startsWith(`${name}-`));
}

function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function readDevConvexHost(rootDir) {
  const file = path.join(rootDir, ".env.local");
  if (!fs.existsSync(file)) return null;
  const parsed = parse(fs.readFileSync(file));
  return hostOf(parsed.VITE_CONVEX_URL || parsed.EXPO_PUBLIC_CONVEX_URL || "");
}

/**
 * @param {{ env?: Record<string, string | undefined>, rootDir?: string }} options
 * @returns {{ ok: boolean, problems: string[], mode: string }}
 */
function checkReleaseEnv(options = {}) {
  const env = { ...(options.env ?? process.env), NODE_ENV: "production" };
  const rootDir = options.rootDir ?? path.resolve(__dirname, "../..");
  const { mode, convexUrl } = loadRootEnv({ env, rootDir, silent: true });
  const problems = [];

  if (!convexUrl) {
    // CI's release builds only check that the app bundles and compiles; none
    // of them ships. They have no production URL, so CI may opt in to a
    // local-only bundle. A URL that is set is still checked below.
    if (env.CI === "true" && env.NEMU_CI_LOCAL_ONLY_BUNDLE === "1") {
      return { ok: true, problems, mode };
    }
    problems.push(
      "no production Convex URL (set EXPO_PUBLIC_CONVEX_URL in the environment or the root .env.production.local); the build would be local-only",
    );
  } else {
    let url = null;
    try {
      url = new URL(convexUrl);
    } catch {
      problems.push("EXPO_PUBLIC_CONVEX_URL is not a URL");
    }
    if (url) {
      if (url.protocol !== "https:") problems.push("EXPO_PUBLIC_CONVEX_URL is not https");
      if (!isAllowedHost(url.hostname)) {
        problems.push("EXPO_PUBLIC_CONVEX_URL host is not a Convex or nemu.pm host");
      }
      if (isDevHost(url.hostname)) {
        problems.push("EXPO_PUBLIC_CONVEX_URL is a known dev deployment");
      }
      if (readDevConvexHost(rootDir) === url.hostname) {
        problems.push("EXPO_PUBLIC_CONVEX_URL is the dev deployment from .env.local");
      }
      const expected = env.NEMU_EXPECT_PROD_CONVEX_HOST?.trim();
      if (expected && expected !== url.hostname) {
        problems.push("EXPO_PUBLIC_CONVEX_URL does not match NEMU_EXPECT_PROD_CONVEX_HOST");
      }
    }
  }

  const siteUrl = env.EXPO_PUBLIC_CONVEX_SITE_URL?.trim();
  if (siteUrl) {
    const site = hostOf(siteUrl);
    if (!site || new URL(siteUrl).protocol !== "https:") {
      problems.push("EXPO_PUBLIC_CONVEX_SITE_URL is not an https URL");
    } else if (isDevHost(site)) {
      problems.push("EXPO_PUBLIC_CONVEX_SITE_URL is a known dev deployment");
    }
  } else if (convexUrl) {
    problems.push("EXPO_PUBLIC_CONVEX_SITE_URL could not be derived (auth would not work)");
  }

  return { ok: problems.length === 0, problems, mode };
}

/**
 * Called by metro.config.js with the result of loadRootEnv(). Throws (failing
 * the bundle step) in production mode when the env is unusable; does nothing
 * in development or test mode.
 */
function enforceReleaseEnv(rootEnv, options = {}) {
  if (!rootEnv || rootEnv.mode !== "production") return;
  const result = checkReleaseEnv(options);
  if (result.ok) return;
  throw new Error(
    [
      "[preflightRelease] Refusing to bundle a production build:",
      ...result.problems.map((problem) => `  - ${problem}`),
      "Set the production Convex URL in the root .env.production.local (or the environment) and rebuild.",
    ].join("\n"),
  );
}

module.exports = { checkReleaseEnv, enforceReleaseEnv };

if (require.main === module) {
  const result = checkReleaseEnv();
  if (result.ok) {
    console.log("[preflightRelease] ok: production bundle targets a production Convex deployment");
  } else {
    for (const problem of result.problems) console.error(`[preflightRelease] ${problem}`);
    process.exit(1);
  }
}
