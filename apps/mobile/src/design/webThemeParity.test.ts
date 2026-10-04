import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nemuTokens, type NemuColorScheme, type NemuTokens } from "./tokens";

// The app's theme is the web theme: these read the production web layer
// (`src/index.css`) and fail when a web variable changes until the native
// value is re-derived.
const read = (relative: string) =>
  readFileSync(path.join(import.meta.dir, relative), "utf8");

const webCss = read("../../../../src/index.css");

/** OKLCH → sRGB hex (the conversion the browser applies to the web variables). */
function oklchToHex(lightness: number, chroma: number, hueDegrees: number): string {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear
    .map((value) => {
      const clamped = Math.max(0, Math.min(1, value));
      const encoded =
        clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

function webVariables(scheme: NemuColorScheme): Record<string, string> {
  const start = webCss.indexOf(scheme === "dark" ? ".dark {" : ":root {");
  const block = webCss.slice(start, webCss.indexOf("\n}", start));
  const variables: Record<string, string> = {};
  for (const match of block.matchAll(
    /--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g,
  )) {
    variables[match[1]] = oklchToHex(Number(match[2]), Number(match[3]), Number(match[4]));
  }
  return variables;
}

const WEB_VARIABLE_FOR_TOKEN: Partial<Record<keyof NemuTokens, string>> = {
  background: "background",
  foreground: "foreground",
  card: "card",
  cardForeground: "card-foreground",
  primary: "primary",
  primaryForeground: "primary-foreground",
  secondary: "secondary",
  secondaryForeground: "secondary-foreground",
  muted: "muted",
  mutedForeground: "muted-foreground",
  danger: "destructive",
};

describe("mobile theme tokens are the web theme variables", () => {
  test.each(["light", "dark"] as const)("%s palette", (scheme) => {
    const web = webVariables(scheme);
    for (const [token, variable] of Object.entries(WEB_VARIABLE_FOR_TOKEN)) {
      expect(web[variable]).toBeDefined();
      expect(`${token}: ${nemuTokens[scheme][token as keyof NemuTokens]}`).toBe(
        `${token}: ${web[variable]}`,
      );
    }
  });
});

describe("controls drawn by the app follow the web components", () => {
  test("Android switch thumb follows the web Switch in dark mode", () => {
    const source = read("../design-system/components/NemuNativeSwitch.tsx");
    const androidSwitch = source.slice(
      source.indexOf("function ShadcnAndroidSwitch"),
      source.indexOf("export function NemuNativeSwitch"),
    );
    expect(androidSwitch).toContain("? tokens.primaryForeground");
    expect(androidSwitch).toContain(": tokens.foreground");
    const webSwitch = read("../../../../src/components/ui/switch.tsx");
    expect(webSwitch).toContain("dark:data-checked:bg-primary-foreground");
    expect(webSwitch).toContain("dark:data-unchecked:bg-foreground");
  });
});
