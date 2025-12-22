/**
 * Generate enriched Aidoku registry with author metadata.
 * 
 * Usage:
 *   bun dev/generate-aidoku-registry.ts
 * 
 * Reads: dist/aidoku/upstream.json
 * Outputs: dist/aidoku/index.json
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const DIST_DIR = path.join(import.meta.dirname, "../dist/aidoku");
const UPSTREAM_PATH = path.join(DIST_DIR, "upstream.json");
const OUTPUT_PATH = path.join(DIST_DIR, "index.json");

interface UpstreamSource {
  id: string;
  name: string;
  version: number;
  iconURL: string;
  downloadURL: string;
  languages: string[];
  contentRating: number;
  baseURL: string;
}

interface UpstreamRegistry {
  name: string;
  sources: UpstreamSource[];
}

interface Author {
  github: string | null;
  name: string;
  commits: number;
  firstCommit: string;
}

interface EnrichedSource extends UpstreamSource {
  authors: Author[];
}

interface EnrichedRegistry {
  name: string;
  generated: string;
  upstream: string;
  sources: EnrichedSource[];
}

function getSourceAuthors(sourceId: string): Author[] {
  try {
    const result = execSync(
      `bun dev/get-aidoku-source-authors.ts ${sourceId}`,
      { cwd: path.join(import.meta.dirname, ".."), encoding: "utf-8" }
    ).trim();
    
    if (result.startsWith("[")) {
      return JSON.parse(result);
    }
    return [];
  } catch {
    return [];
  }
}

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Read upstream registry
  if (!fs.existsSync(UPSTREAM_PATH)) {
    console.error("Upstream registry not found. Run fetch step first.");
    process.exit(1);
  }

  const upstream: UpstreamRegistry = JSON.parse(
    fs.readFileSync(UPSTREAM_PATH, "utf-8")
  );

  console.log(`Processing ${upstream.sources.length} sources...`);

  // Enrich each source with authors
  const enrichedSources: EnrichedSource[] = [];
  
  for (const source of upstream.sources) {
    const authors = getSourceAuthors(source.id);
    enrichedSources.push({
      ...source,
      // Rewrite downloadURL to use upstream absolute URL
      downloadURL: `https://aidoku-community.github.io/sources/${source.downloadURL}`,
      iconURL: `https://aidoku-community.github.io/sources/${source.iconURL}`,
      authors,
    });
    
    if (authors.length > 0) {
      console.log(`  ${source.id}: ${authors.length} authors`);
    }
  }

  // Create enriched registry
  const enriched: EnrichedRegistry = {
    name: "Nemu Aidoku Sources",
    generated: new Date().toISOString(),
    upstream: "https://aidoku-community.github.io/sources/",
    sources: enrichedSources,
  };

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(enriched, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);
  
  // Also write minified version
  const minPath = path.join(DIST_DIR, "index.min.json");
  fs.writeFileSync(minPath, JSON.stringify(enriched));
  console.log(`Wrote ${minPath}`);

  // Stats
  const withAuthors = enrichedSources.filter(s => s.authors.length > 0).length;
  console.log(`\nStats:`);
  console.log(`  Total sources: ${enrichedSources.length}`);
  console.log(`  With authors: ${withAuthors}`);
}

main().catch(console.error);

