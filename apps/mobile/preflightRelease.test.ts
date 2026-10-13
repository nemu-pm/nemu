import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkReleaseEnv, enforceReleaseEnv } = require("./preflightRelease.cjs") as {
  enforceReleaseEnv(rootEnv: { mode: string } | null, options?: { env?: Record<string, string | undefined>; rootDir?: string }): void;
  checkReleaseEnv(options: {
    env?: Record<string, string | undefined>;
    rootDir?: string;
  }): { ok: boolean; problems: string[]; mode: string };
};

const DEV_URL = "https://dev-deployment-111.convex.cloud";
const PROD_URL = "https://prod-deployment-222.convex.cloud";
const PROD_SITE_URL = "https://convex.nemu.pm";
const KNOWN_DEV_URL = "https://fastidious-hare-123.convex.cloud";

const tempDirs: string[] = [];

function makeRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "nemu-preflight-"));
  tempDirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("release preflight", () => {
  test("passes when the production file names a production deployment", () => {
    const rootDir = makeRoot({
      ".env.local": `VITE_CONVEX_URL=${DEV_URL}\n`,
      ".env.production.local": `VITE_CONVEX_URL=${PROD_URL}\n`,
    });
    expect(checkReleaseEnv({ env: {}, rootDir })).toMatchObject({
      ok: true,
      problems: [],
      mode: "production",
    });
  });

  test("is always evaluated in production mode, even if NODE_ENV says otherwise", () => {
    const rootDir = makeRoot({
      ".env.local": `VITE_CONVEX_URL=${DEV_URL}\n`,
    });
    const result = checkReleaseEnv({ env: { NODE_ENV: "development" }, rootDir });
    expect(result.mode).toBe("production");
    expect(result.ok).toBe(false);
  });

  test("fails when no production Convex URL exists (dev .env.local is ignored)", () => {
    const rootDir = makeRoot({ ".env.local": `VITE_CONVEX_URL=${DEV_URL}\n` });
    const result = checkReleaseEnv({ env: {}, rootDir });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("no production Convex URL");
  });

  test("fails when the URL passed through the environment is the dev deployment", () => {
    const rootDir = makeRoot({ ".env.local": `VITE_CONVEX_URL=${DEV_URL}\n` });
    const result = checkReleaseEnv({
      env: { EXPO_PUBLIC_CONVEX_URL: DEV_URL },
      rootDir,
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("dev deployment");
  });

  test("accepts the production custom domain site URL and nemu.pm hosts", () => {
    const rootDir = makeRoot({});
    expect(
      checkReleaseEnv({
        env: { EXPO_PUBLIC_CONVEX_URL: PROD_URL, EXPO_PUBLIC_CONVEX_SITE_URL: PROD_SITE_URL },
        rootDir,
      }).ok,
    ).toBe(true);
    expect(
      checkReleaseEnv({
        env: { EXPO_PUBLIC_CONVEX_URL: "https://convex.nemu.pm", EXPO_PUBLIC_CONVEX_SITE_URL: PROD_SITE_URL },
        rootDir,
      }).ok,
    ).toBe(true);
  });

  test("rejects the known dev deployment by name, on any domain", () => {
    const rootDir = makeRoot({});
    const result = checkReleaseEnv({ env: { EXPO_PUBLIC_CONVEX_URL: KNOWN_DEV_URL }, rootDir });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("known dev deployment");
    expect(JSON.stringify(result)).not.toContain("fastidious");
  });

  test("fails on non-https or non-convex URLs", () => {
    const rootDir = makeRoot({});
    expect(
      checkReleaseEnv({
        env: { EXPO_PUBLIC_CONVEX_URL: "http://prod-deployment-222.convex.cloud" },
        rootDir,
      }).problems.join("\n"),
    ).toContain("not https");
    expect(
      checkReleaseEnv({
        env: { EXPO_PUBLIC_CONVEX_URL: "https://example.com" },
        rootDir,
      }).problems.join("\n"),
    ).toContain("not a Convex or nemu.pm host");
  });

  test("honours an expected production host", () => {
    const rootDir = makeRoot({});
    const env = { EXPO_PUBLIC_CONVEX_URL: PROD_URL };
    expect(
      checkReleaseEnv({
        env: { ...env, NEMU_EXPECT_PROD_CONVEX_HOST: "prod-deployment-222.convex.cloud" },
        rootDir,
      }).ok,
    ).toBe(true);
    expect(
      checkReleaseEnv({
        env: { ...env, NEMU_EXPECT_PROD_CONVEX_HOST: "other.convex.cloud" },
        rootDir,
      }).ok,
    ).toBe(false);
  });

  test("never echoes the deployment URL in problems", () => {
    const rootDir = makeRoot({});
    const result = checkReleaseEnv({
      env: { EXPO_PUBLIC_CONVEX_URL: "http://secret-name.convex.cloud" },
      rootDir,
    });
    expect(result.problems.join("\n")).not.toContain("secret-name");
  });
});

describe("bundle-time enforcement (metro.config.js hook)", () => {
  test("production mode with the dev URL fails the bundle step", () => {
    const rootDir = makeRoot({ ".env.local": `VITE_CONVEX_URL=${DEV_URL}\n` });
    expect(() =>
      enforceReleaseEnv({ mode: "production" }, { env: { EXPO_PUBLIC_CONVEX_URL: DEV_URL }, rootDir }),
    ).toThrow("Refusing to bundle a production build");
    expect(() =>
      enforceReleaseEnv({ mode: "production" }, { env: { EXPO_PUBLIC_CONVEX_URL: KNOWN_DEV_URL }, rootDir }),
    ).toThrow("known dev deployment");
  });

  test("production mode with no URL or http fails", () => {
    const rootDir = makeRoot({});
    expect(() => enforceReleaseEnv({ mode: "production" }, { env: {}, rootDir })).toThrow();
    expect(() =>
      enforceReleaseEnv(
        { mode: "production" },
        { env: { EXPO_PUBLIC_CONVEX_URL: "http://prod-deployment-222.convex.cloud" }, rootDir },
      ),
    ).toThrow();
  });

  test("production mode with the production host passes", () => {
    const rootDir = makeRoot({ ".env.local": `VITE_CONVEX_URL=${DEV_URL}\n` });
    expect(() =>
      enforceReleaseEnv(
        { mode: "production" },
        {
          env: { EXPO_PUBLIC_CONVEX_URL: PROD_URL, EXPO_PUBLIC_CONVEX_SITE_URL: PROD_SITE_URL },
          rootDir,
        },
      ),
    ).not.toThrow();
  });

  test("development and test modes are never checked", () => {
    const rootDir = makeRoot({});
    for (const mode of ["development", "test"]) {
      expect(() => enforceReleaseEnv({ mode }, { env: {}, rootDir })).not.toThrow();
    }
    expect(() => enforceReleaseEnv(null, { env: {}, rootDir })).not.toThrow();
  });
});
