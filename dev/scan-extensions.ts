#!/usr/bin/env bun
/**
 * Generates a manifest of all Tachiyomi extensions for Gradle.
 * This allows config-cache compatible builds by avoiding filesystem walks during configuration.
 *
 * Usage:
 *   bun dev/scan-extensions.ts                    # All extensions
 *   bun dev/scan-extensions.ts en/mangadex        # Specific extension
 *   bun dev/scan-extensions.ts en/*               # All English extensions
 *   bun dev/scan-extensions.ts --only en/a,ja/b   # Specific list (for CI)
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const EXTENSIONS_ROOT = "vendor/keiyoushi/extensions-source/src";
const MANIFEST_PATH = "packages/tachiyomi-js/extensions-manifest.json";

interface ExtensionMetadata {
  lang: string;
  name: string;
  extName: string;
  extClassName: string;
  extVersionCode: number;
  isNsfw: boolean;
  themePkg: string | null;
  libDeps: string[];
}

function parseExtensionBuildGradle(path: string): Partial<ExtensionMetadata> {
  if (!existsSync(path)) return {};
  
  const content = readFileSync(path, "utf-8");
  
  const extClass = content.match(/extClass\s*=\s*['"]\.(\w+)['"]/)?.[1];
  const extVersionCode = parseInt(content.match(/extVersionCode\s*=\s*(\d+)/)?.[1] ?? "1", 10);
  const extName = content.match(/extName\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const isNsfw = /isNsfw\s*=\s*true/.test(content);
  const themePkg = content.match(/themePkg\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? null;
  
  // Extract lib dependencies
  const libDeps = [...content.matchAll(/project\s*\(\s*['"]?:lib:(\w+)['"]?\s*\)/g)]
    .map(m => m[1]);
  
  return {
    extClassName: extClass,
    extVersionCode,
    extName,
    isNsfw,
    themePkg,
    libDeps,
  };
}

function parseMultisrcBuildGradle(themePkg: string): string[] {
  const path = `vendor/keiyoushi/extensions-source/lib-multisrc/${themePkg}/build.gradle.kts`;
  if (!existsSync(path)) return [];
  
  const content = readFileSync(path, "utf-8");
  return [...content.matchAll(/project\s*\(\s*['"]?:lib:(\w+)['"]?\s*\)/g)]
    .map(m => m[1]);
}

function scanExtension(lang: string, name: string): ExtensionMetadata | null {
  const extPath = join(EXTENSIONS_ROOT, lang, name);
  if (!existsSync(extPath)) {
    console.error(`Extension not found: ${lang}/${name}`);
    return null;
  }
  
  const buildGradlePath = join(extPath, "build.gradle");
  const parsed = parseExtensionBuildGradle(buildGradlePath);
  
  // Combine lib deps from extension + multisrc
  const multisrcLibDeps = parsed.themePkg ? parseMultisrcBuildGradle(parsed.themePkg) : [];
  const allLibDeps = [...new Set([...(parsed.libDeps ?? []), ...multisrcLibDeps])];
  
  return {
    lang,
    name,
    extName: parsed.extName ?? name,
    extClassName: parsed.extClassName ?? name.charAt(0).toUpperCase() + name.slice(1),
    extVersionCode: parsed.extVersionCode ?? 1,
    isNsfw: parsed.isNsfw ?? false,
    themePkg: parsed.themePkg ?? null,
    libDeps: allLibDeps,
  };
}

function scanAllExtensions(): ExtensionMetadata[] {
  const extensions: ExtensionMetadata[] = [];
  
  if (!existsSync(EXTENSIONS_ROOT)) {
    console.error(`Extensions root not found: ${EXTENSIONS_ROOT}`);
    return [];
  }
  
  const langs = readdirSync(EXTENSIONS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  for (const lang of langs) {
    const langPath = join(EXTENSIONS_ROOT, lang);
    const exts = readdirSync(langPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    for (const name of exts) {
      const metadata = scanExtension(lang, name);
      if (metadata) {
        extensions.push(metadata);
      }
    }
  }
  
  return extensions;
}

function scanByPattern(pattern: string): ExtensionMetadata[] {
  if (pattern.endsWith("/*")) {
    // All extensions in a language
    const lang = pattern.slice(0, -2);
    const langPath = join(EXTENSIONS_ROOT, lang);
    if (!existsSync(langPath)) {
      console.error(`Language not found: ${lang}`);
      return [];
    }
    
    const exts = readdirSync(langPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    return exts
      .map(name => scanExtension(lang, name))
      .filter((m): m is ExtensionMetadata => m !== null);
  }
  
  // Single extension
  const [lang, name] = pattern.split("/");
  if (!lang || !name) {
    console.error(`Invalid pattern: ${pattern}. Use lang/name or lang/*`);
    return [];
  }
  
  const metadata = scanExtension(lang, name);
  return metadata ? [metadata] : [];
}

// Parse CLI args
const args = process.argv.slice(2);

let extensions: ExtensionMetadata[];

if (args.length === 0) {
  // Scan all
  console.log("Scanning all extensions...");
  extensions = scanAllExtensions();
} else if (args[0] === "--only") {
  // Specific list for CI
  const patterns = args[1]?.split(",") ?? [];
  extensions = patterns.flatMap(p => scanByPattern(p.trim()));
} else {
  // Pattern(s) from args
  extensions = args.flatMap(p => scanByPattern(p.trim()));
}

// Write manifest
mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
writeFileSync(MANIFEST_PATH, JSON.stringify(extensions, null, 2));

console.log(`Generated manifest with ${extensions.length} extension(s): ${MANIFEST_PATH}`);

// Also output as JSON for piping
if (process.env.OUTPUT_JSON === "1") {
  console.log(JSON.stringify(extensions));
}

