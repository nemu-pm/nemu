/**
 * Get merged Tachiyomi extension authors from yuzono base + keiyoushi commits.
 * 
 * Usage:
 *   bun dev/get-tachiyomi-extension-authors.ts en/mangapark
 * 
 * Outputs JSON to stdout:
 *   [{ "github": "user", "name": "Name", "commits": 5, "firstCommit": "2020-01-01" }, ...]
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const DEV_DIR = import.meta.dirname;
const KEIYOUSHI_PATH = path.join(DEV_DIR, "../vendor/keiyoushi/extensions-source");
const KEIYOUSHI_CUTOFF = "2024-01-09";

const AUTHORS_BASE_PATH = path.join(DEV_DIR, "tachiyomi-extension-authors-base.json");
const EMAIL_CACHE_PATH = path.join(DEV_DIR, "email-to-github.json");

interface ContributorData {
  email: string;
  name: string;
  commits: number;
  firstCommit: string;
}

interface AuthorOutput {
  github: string | null;
  name: string;
  commits: number;
  firstCommit: string;
}

// Load base data
function loadBaseData(): { extensions: Record<string, ContributorData[]> } {
  if (!fs.existsSync(AUTHORS_BASE_PATH)) {
    return { extensions: {} };
  }
  return JSON.parse(fs.readFileSync(AUTHORS_BASE_PATH, "utf-8"));
}

function loadEmailCache(): Record<string, string | null> {
  if (!fs.existsSync(EMAIL_CACHE_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(EMAIL_CACHE_PATH, "utf-8"));
}

// Extract GitHub username from noreply email
function extractFromNoreply(email: string): string | null {
  const match = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  return match ? match[1] : null;
}

// Get keiyoushi commits after cutoff
function getKeiyoushiCommits(extensionPath: string): ContributorData[] {
  const fullPath = `src/${extensionPath}`;
  
  try {
    // Check if path exists in keiyoushi
    const srcPath = path.join(KEIYOUSHI_PATH, fullPath);
    if (!fs.existsSync(srcPath)) {
      return [];
    }

    const output = execSync(
      `git log --format="%ae|%an|%aI" --after="${KEIYOUSHI_CUTOFF}" -- "${fullPath}"`,
      { cwd: KEIYOUSHI_PATH, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );

    const commits = output.trim().split("\n").filter(Boolean);
    const byEmail = new Map<string, { name: string; commits: number; firstCommit: string }>();

    // Process in reverse (oldest first)
    for (const line of commits.reverse()) {
      const [email, name, date] = line.split("|");
      if (!email || !name || !date) continue;

      const dateOnly = date.split("T")[0];
      const existing = byEmail.get(email);
      
      if (existing) {
        existing.commits++;
        if (dateOnly < existing.firstCommit) {
          existing.firstCommit = dateOnly;
        }
      } else {
        byEmail.set(email, { name, commits: 1, firstCommit: dateOnly });
      }
    }

    return Array.from(byEmail.entries())
      .map(([email, data]) => ({ email, ...data }));
  } catch {
    return [];
  }
}

// Resolve email to github username
function resolveGithub(
  email: string,
  emailCache: Record<string, string | null>
): string | null {
  const cached = emailCache[email];
  if (cached !== undefined) return cached;
  return extractFromNoreply(email);
}

// Merge base + keiyoushi data, dedupe by github username
function mergeAndDedupeAuthors(
  base: ContributorData[],
  keiyoushi: ContributorData[],
  emailCache: Record<string, string | null>
): AuthorOutput[] {
  // First, merge all contributors by email
  const byEmail = new Map<string, ContributorData>();

  for (const c of base) {
    byEmail.set(c.email, { ...c });
  }

  for (const c of keiyoushi) {
    const existing = byEmail.get(c.email);
    if (existing) {
      existing.commits += c.commits;
      if (c.firstCommit < existing.firstCommit) {
        existing.firstCommit = c.firstCommit;
      }
    } else {
      byEmail.set(c.email, { ...c });
    }
  }

  // Now resolve to github and dedupe by github username
  // Key: github username (lowercase) or email if no github
  const byIdentity = new Map<string, AuthorOutput>();

  for (const c of byEmail.values()) {
    const github = resolveGithub(c.email, emailCache);
    const key = github?.toLowerCase() ?? c.email.toLowerCase();

    const existing = byIdentity.get(key);
    if (existing) {
      existing.commits += c.commits;
      if (c.firstCommit < existing.firstCommit) {
        existing.firstCommit = c.firstCommit;
        // Use name from earliest contribution
        existing.name = c.name;
      }
      // Keep the github username if we have it
      if (github && !existing.github) {
        existing.github = github;
      }
    } else {
      byIdentity.set(key, {
        github,
        name: c.name,
        commits: c.commits,
        firstCommit: c.firstCommit,
      });
    }
  }

  // Sort by firstCommit ascending (earliest contributor first)
  return Array.from(byIdentity.values())
    .sort((a, b) => a.firstCommit.localeCompare(b.firstCommit));
}

function main() {
  const extensionPath = process.argv[2];
  
  if (!extensionPath) {
    console.error("Usage: bun dev/get-tachiyomi-extension-authors.ts <lang/name>");
    console.error("Example: bun dev/get-tachiyomi-extension-authors.ts en/mangapark");
    process.exit(1);
  }

  const baseData = loadBaseData();
  const emailCache = loadEmailCache();

  const baseContributors = baseData.extensions[extensionPath] ?? [];
  const keiyoushiContributors = getKeiyoushiCommits(extensionPath);

  const authors = mergeAndDedupeAuthors(baseContributors, keiyoushiContributors, emailCache);

  console.log(JSON.stringify(authors));
}

main();

