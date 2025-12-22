/**
 * Generate Tachiyomi extension registry from built extensions.
 * 
 * Usage:
 *   bun dev/generate-tachiyomi-registry.ts
 * 
 * Reads: dist/tachiyomi/tachiyomi-extensions/*/manifest.json
 * Outputs: dist/tachiyomi/index.json
 */

import * as fs from "fs";
import * as path from "path";

const DIST_DIR = path.join(import.meta.dirname, "../dist/tachiyomi");
const EXTENSIONS_DIR = path.join(DIST_DIR, "tachiyomi-extensions");
const OUTPUT_PATH = path.join(DIST_DIR, "index.json");

interface SourceMetadata {
  id: number;
  name: string;
  lang: string;
  baseUrl: string;
  supportsLatest: boolean;
  isNsfw: boolean;
}

interface Author {
  github: string | null;
  name: string;
  commits: number;
  firstCommit: string;
}

interface ExtensionManifest {
  name: string;
  pkg: string;
  lang: string;
  version: number;
  nsfw: boolean;
  hasWebView: boolean;
  hasCloudflare: boolean;
  icon?: string;
  jsPath: string;
  authors?: Author[];
  sources: SourceMetadata[];
}

interface RegistryExtension {
  name: string;
  pkg: string;
  lang: string;
  version: number;
  nsfw: boolean;
  hasWebView: boolean;
  hasCloudflare: boolean;
  iconURL?: string;
  jsURL: string;
  authors: Author[];
  sources: SourceMetadata[];
}

interface Registry {
  name: string;
  generated: string;
  baseURL: string;
  extensions: RegistryExtension[];
}

function main() {
  // Ensure directories exist
  fs.mkdirSync(DIST_DIR, { recursive: true });

  if (!fs.existsSync(EXTENSIONS_DIR)) {
    console.log("No extensions directory found. Creating empty registry.");
    const emptyRegistry: Registry = {
      name: "Nemu Tachiyomi Extensions",
      generated: new Date().toISOString(),
      baseURL: "", // Will be set by deployment
      extensions: [],
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(emptyRegistry, null, 2));
    return;
  }

  const extensions: RegistryExtension[] = [];
  const extDirs = fs.readdirSync(EXTENSIONS_DIR).filter(d => 
    fs.statSync(path.join(EXTENSIONS_DIR, d)).isDirectory()
  );

  console.log(`Processing ${extDirs.length} extensions...`);

  for (const extDir of extDirs) {
    const manifestPath = path.join(EXTENSIONS_DIR, extDir, "manifest.json");
    
    if (!fs.existsSync(manifestPath)) {
      console.warn(`  Skipping ${extDir}: no manifest.json`);
      continue;
    }

    try {
      const manifest: ExtensionManifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8")
      );

      const registryExt: RegistryExtension = {
        name: manifest.name,
        pkg: manifest.pkg,
        lang: manifest.lang,
        version: manifest.version,
        nsfw: manifest.nsfw,
        hasWebView: manifest.hasWebView,
        hasCloudflare: manifest.hasCloudflare,
        jsURL: `tachiyomi-extensions/${extDir}/${manifest.jsPath}`,
        authors: manifest.authors ?? [],
        sources: manifest.sources,
      };

      if (manifest.icon) {
        registryExt.iconURL = `tachiyomi-extensions/${extDir}/${manifest.icon}`;
      }

      extensions.push(registryExt);
      console.log(`  ${extDir}: ${manifest.sources.length} sources, ${registryExt.authors.length} authors`);
    } catch (e) {
      console.error(`  Error processing ${extDir}:`, e);
    }
  }

  // Sort by language then name
  extensions.sort((a, b) => {
    if (a.lang !== b.lang) return a.lang.localeCompare(b.lang);
    return a.name.localeCompare(b.name);
  });

  // Create registry
  const registry: Registry = {
    name: "Nemu Tachiyomi Extensions",
    generated: new Date().toISOString(),
    baseURL: "", // Set during deployment or by client
    extensions,
  };

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(registry, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);

  // Minified version
  const minPath = path.join(DIST_DIR, "index.min.json");
  fs.writeFileSync(minPath, JSON.stringify(registry));
  console.log(`Wrote ${minPath}`);

  // Stats
  const totalSources = extensions.reduce((sum, e) => sum + e.sources.length, 0);
  const withAuthors = extensions.filter(e => e.authors.length > 0).length;
  
  console.log(`\nStats:`);
  console.log(`  Extensions: ${extensions.length}`);
  console.log(`  Total sources: ${totalSources}`);
  console.log(`  With authors: ${withAuthors}`);
}

main();

