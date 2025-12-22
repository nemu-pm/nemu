#!/usr/bin/env bun
/**
 * List Keiyoushi extensions sorted by last commit date (descending).
 * Much faster than shell loop - uses single git log call.
 * 
 * Usage:
 *   bun scripts/list-extensions.ts [limit]
 *   bun scripts/list-extensions.ts 50
 */

import { $ } from "bun";
import path from "path";

const EXTENSIONS_SOURCE = path.resolve(import.meta.dir, "../vendor/keiyoushi/extensions-source");
const limit = parseInt(process.argv[2] || "30", 10);

// Single git log call - get recent commits with file names
const result = await $`cd ${EXTENSIONS_SOURCE} && git log --format='%H|%ai' --name-only -n 500 -- src/`.text();

// Parse: track latest commit per extension
const extMap = new Map<string, { hash: string; date: string }>();

let currentHash = "";
let currentDate = "";

for (const line of result.split("\n")) {
  if (!line.trim()) continue;
  
  if (line.includes("|")) {
    // Commit line: hash|date
    const [hash, date] = line.split("|");
    currentHash = hash;
    currentDate = date;
  } else if (line.startsWith("src/")) {
    // File path - extract extension name (src/lang/name/...)
    const parts = line.split("/");
    if (parts.length >= 3) {
      const ext = `${parts[1]}/${parts[2]}`;
      // Only keep first (most recent) occurrence
      if (!extMap.has(ext)) {
        extMap.set(ext, { hash: currentHash, date: currentDate });
      }
    }
  }
}

// Sort by date descending
const sorted = [...extMap.entries()]
  .sort((a, b) => b[1].date.localeCompare(a[1].date))
  .slice(0, limit);

// Output
console.log(`# ${sorted.length} extensions (sorted by last commit)\n`);
for (const [ext, { hash, date }] of sorted) {
  const shortHash = hash.slice(0, 7);
  const shortDate = date.split(" ")[0];
  console.log(`${shortDate} ${shortHash} ${ext}`);
}
