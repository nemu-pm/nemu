import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
  NEMU_BRAND_LETTER_SPACING_RATIO,
  nemuBrandLetterSpacing,
} from "./nemuBrandWordmark";

const MOBILE_ROOT = path.join(import.meta.dir, "..", "..");
const REPO_ROOT = path.join(MOBILE_ROOT, "..", "..");

// The web app is the source of truth for the wordmark: Noto Serif JP at
// weight 500 with -0.02em tracking, rendered in the About dialog, the Settings
// About row, and the welcome wizard.
const WEB_WORDMARK_FILES = [
  "src/components/about-dialog.tsx",
  "src/components/welcome-wizard.tsx",
  "src/pages/settings.tsx",
];

async function read(root: string, relativePath: string): Promise<string> {
  return Bun.file(path.join(root, relativePath)).text();
}

describe("nemu wordmark tracking", () => {
  test("matches the web -0.02em tracking at any rendered size", () => {
    expect(NEMU_BRAND_LETTER_SPACING_RATIO).toBe(-0.02);
    expect(nemuBrandLetterSpacing(26)).toBeCloseTo(-0.52, 5);
    expect(nemuBrandLetterSpacing(24)).toBeCloseTo(-0.48, 5);
    expect(nemuBrandLetterSpacing(14)).toBeCloseTo(-0.28, 5);
  });

  test("the web wordmark still declares that tracking and weight", async () => {
    for (const file of WEB_WORDMARK_FILES) {
      const contents = await read(REPO_ROOT, file);
      expect(contents, file).toContain('letterSpacing: "-0.02em"');
      expect(contents, file).toContain("fontWeight: 500");
      expect(contents, file).toContain("'Noto Serif JP Variable', serif");
    }
  });

  test("every mobile wordmark goes through the tracking helper", async () => {
    const wordmarkFiles = [
      "src/components/MobileAboutSheet.tsx",
      "src/components/MobileWelcomeWizard.tsx",
      "src/screens/SettingsScreen.tsx",
    ];
    for (const file of wordmarkFiles) {
      const contents = await read(MOBILE_ROOT, file);
      expect(contents, file).toContain("createNemuBrandWordmarkStyle(");
    }

    // A raw NEMU_BRAND_FONT_FAMILY reference outside the helper would render
    // the wordmark without its tracking.
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const offenders: string[] = [];
    for await (const scanned of glob.scan({
      cwd: path.join(MOBILE_ROOT, "src"),
    })) {
      if (scanned === "design/typography.ts") continue;
      if (/\.(?:test|spec)\.tsx?$/.test(scanned)) continue;
      const contents = await read(MOBILE_ROOT, path.join("src", scanned));
      if (contents.includes("NEMU_BRAND_FONT_FAMILY")) offenders.push(scanned);
    }
    expect(offenders).toEqual([]);
  });
});
