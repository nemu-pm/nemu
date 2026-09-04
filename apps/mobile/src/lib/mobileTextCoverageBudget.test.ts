import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Dynamic Type ratchet.
 *
 * A bare react-native `<Text>` ships without a `maxFontSizeMultiplier`, so an
 * AX font size can push glyphs outside the measured native chrome Nemu draws
 * its cards, sheets, and tab bar against. `NemuText` bounds the multiplier by
 * default (1.6, or 1.5 with `density="compact"`), passes every `TextProps`
 * through, and applies no typography of its own unless a `variant` is given —
 * so migrating a node is a mechanical swap that keeps its existing `style`.
 *
 * An eslint `no-restricted-syntax` warning flags every new
 * `import { Text } from "react-native"`. This test is the hard gate: the total
 * may shrink, never grow.
 */

const sourceRoot = path.resolve(import.meta.dir, "..");

/** Exact bare-`<Text>` count outside the design system. Only ever lower it. */
const MOBILE_BARE_TEXT_BUDGET = 284;

/** Files already migrated to `NemuText`; they must never regain a bare `Text`. */
const MOBILE_FULLY_MIGRATED_FILES = [
  "components/MobileErrorBoundaryScreen.tsx",
  "components/MobileMetadataEditorSheet.tsx",
  "components/MobileSourceManagerSheet.tsx",
  "components/MobileSourceSettingsCard.tsx",
  "screens/SettingsScreen.tsx",
];

// `NemuText` itself lives here and legitimately renders the primitive.
const EXCLUDED_DIRECTORY_PREFIXES = ["design-system/"];

const BARE_TEXT_ELEMENT = /<Text\b/g;

function listAppTsxFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory).sort()) {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      listAppTsxFiles(absolute, collected);
      continue;
    }
    if (!absolute.endsWith(".tsx")) continue;
    if (absolute.endsWith(".test.tsx")) continue;
    collected.push(absolute);
  }
  return collected;
}

function countBareTextByFile(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const absolute of listAppTsxFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, absolute).split(path.sep).join("/");
    if (EXCLUDED_DIRECTORY_PREFIXES.some((prefix) => relative.startsWith(prefix))) {
      continue;
    }
    const matches = readFileSync(absolute, "utf8").match(BARE_TEXT_ELEMENT);
    if (matches?.length) counts.set(relative, matches.length);
  }
  return counts;
}

function describeWorstOffenders(counts: Map<string, number>, limit: number): string {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([file, count]) => `  ${count.toString().padStart(3, " ")}  src/${file}`)
    .join("\n");
}

describe("mobile Dynamic Type coverage budget", () => {
  test("bare react-native Text nodes never grow past the recorded budget", () => {
    const counts = countBareTextByFile();
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

    expect(
      total,
      total > MOBILE_BARE_TEXT_BUDGET
        ? [
            `Bare <Text> nodes grew to ${total}, above the recorded budget of ${MOBILE_BARE_TEXT_BUDGET}.`,
            "New mobile text must use <NemuText> from @/design-system: it keeps your",
            'existing `style` untouched, bounds maxFontSizeMultiplier, and takes',
            'density="compact" inside sheets and the tab bar.',
            "If you deliberately migrated nodes, lower MOBILE_BARE_TEXT_BUDGET in",
            "src/lib/mobileTextCoverageBudget.test.ts to the new count instead.",
            "Largest remaining offenders:",
            describeWorstOffenders(counts, 10),
          ].join("\n")
        : undefined,
    ).toBeLessThanOrEqual(MOBILE_BARE_TEXT_BUDGET);
  });

  test("already-migrated files stay free of bare react-native Text", () => {
    const counts = countBareTextByFile();
    const regressed = MOBILE_FULLY_MIGRATED_FILES.filter((file) => counts.has(file));

    expect(
      regressed,
      regressed.length
        ? [
            `These files were fully migrated to <NemuText> and must stay that way: ${regressed.join(", ")}.`,
            "Replace the reintroduced <Text> with <NemuText> (same style prop,",
            'density="compact" inside sheets) rather than widening this list.',
          ].join("\n")
        : undefined,
    ).toEqual([]);
  });
});
