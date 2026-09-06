import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadRootEnv = require("./loadRootEnv.cjs") as ((options?: {
  env?: Record<string, string | undefined>;
  rootDir?: string;
  silent?: boolean;
}) => { mode: string; loadedFiles: string[]; convexUrl: string | null }) & {
  envFilesForMode(mode: string): string[];
};

const DEV_URL = "https://dev-deployment-111.convex.cloud";
const PROD_URL = "https://prod-deployment-222.convex.cloud";
const PROD_SITE_URL = "https://convex.example.test";

const tempDirs: string[] = [];

function makeRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "nemu-root-env-"));
  tempDirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const bothFiles = {
  ".env.local": `VITE_CONVEX_URL=${DEV_URL}\n`,
  ".env.production.local": `VITE_CONVEX_URL=${PROD_URL}\nVITE_CONVEX_SITE_URL=${PROD_SITE_URL}\n`,
};

describe("loadRootEnv", () => {
  test("development mode bridges the dev deployment from .env.local", () => {
    const env: Record<string, string | undefined> = { NODE_ENV: "development" };
    const result = loadRootEnv({ env, rootDir: makeRoot(bothFiles), silent: true });

    expect(result.mode).toBe("development");
    expect(result.loadedFiles).toEqual([".env.local"]);
    expect(env.EXPO_PUBLIC_CONVEX_URL).toBe(DEV_URL);
    expect(env.EXPO_PUBLIC_CONVEX_SITE_URL).toBe(
      "https://dev-deployment-111.convex.site",
    );
  });

  test("production mode bridges the production deployment, not .env.local", () => {
    const env: Record<string, string | undefined> = { NODE_ENV: "production" };
    const result = loadRootEnv({ env, rootDir: makeRoot(bothFiles), silent: true });

    expect(result.mode).toBe("production");
    expect(result.loadedFiles).toEqual([".env.production.local"]);
    expect(env.EXPO_PUBLIC_CONVEX_URL).toBe(PROD_URL);
    expect(env.EXPO_PUBLIC_CONVEX_SITE_URL).toBe(PROD_SITE_URL);
  });

  test("production mode never falls back to the dev deployment in .env.local", () => {
    const env: Record<string, string | undefined> = { NODE_ENV: "production" };
    const result = loadRootEnv({
      env,
      rootDir: makeRoot({ ".env.local": `VITE_CONVEX_URL=${DEV_URL}\n` }),
      silent: true,
    });

    expect(result.loadedFiles).toEqual([]);
    expect(result.convexUrl).toBeNull();
    expect(env.EXPO_PUBLIC_CONVEX_URL).toBeUndefined();
    expect(env.EXPO_PUBLIC_CONVEX_SITE_URL).toBeUndefined();
  });

  test("an unset or unknown NODE_ENV is treated as development", () => {
    for (const NODE_ENV of [undefined, "", "staging"]) {
      const env: Record<string, string | undefined> = { NODE_ENV };
      loadRootEnv({ env, rootDir: makeRoot(bothFiles), silent: true });
      expect(env.EXPO_PUBLIC_CONVEX_URL).toBe(DEV_URL);
    }
  });

  test("explicit environment values win over every file", () => {
    const explicit = "https://explicit-deployment-333.convex.cloud";
    const env: Record<string, string | undefined> = {
      NODE_ENV: "production",
      EXPO_PUBLIC_CONVEX_URL: explicit,
    };
    loadRootEnv({ env, rootDir: makeRoot(bothFiles), silent: true });

    expect(env.EXPO_PUBLIC_CONVEX_URL).toBe(explicit);
    expect(env.VITE_CONVEX_URL).toBe(PROD_URL);
  });

  test("file precedence matches Vite and Expo for each mode", () => {
    expect(loadRootEnv.envFilesForMode("production")).toEqual([
      ".env.production.local",
      ".env.production",
      ".env",
    ]);
    expect(loadRootEnv.envFilesForMode("test")).toEqual([
      ".env.test.local",
      ".env.test",
      ".env",
    ]);
    expect(loadRootEnv.envFilesForMode("development")).toEqual([
      ".env.development.local",
      ".env.local",
      ".env.development",
      ".env",
    ]);
  });
});
