/**
 * Get merged Aidoku source authors from Skittyblock base + Aidoku-Community commits.
 * 
 * Usage:
 *   bun dev/get-aidoku-source-authors.ts en.mangadex
 * 
 * Outputs JSON to stdout:
 *   [{ "github": "user", "name": "Name", "commits": 5, "firstCommit": "2022-01-01" }, ...]
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const DEV_DIR = import.meta.dirname;
const AIDOKU_COMMUNITY_PATH = path.join(DEV_DIR, "../vendor/Aidoku-Community/sources");
const AIDOKU_COMMUNITY_CUTOFF = "2025-06-12";

const AUTHORS_BASE_PATH = path.join(DEV_DIR, "aidoku-source-authors-base.json");
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

function loadBaseData(): { sources: Record<string, ContributorData[]> } {
  if (!fs.existsSync(AUTHORS_BASE_PATH)) {
    return { sources: {} };
  }
  return JSON.parse(fs.readFileSync(AUTHORS_BASE_PATH, "utf-8"));
}

function loadEmailCache(): Record<string, string | null> {
  if (!fs.existsSync(EMAIL_CACHE_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(EMAIL_CACHE_PATH, "utf-8"));
}

function extractFromNoreply(email: string): string | null {
  const match = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  return match ? match[1] : null;
}

// Get Aidoku-Community commits after cutoff
function getAidokuCommunityCommits(sourceName: string): ContributorData[] {
  // Aidoku-Community uses sources/lang.name structure
  const fullPath = `sources/${sourceName}`;
  
  try {
    const srcPath = path.join(AIDOKU_COMMUNITY_PATH, "sources", sourceName);
    if (!fs.existsSync(srcPath)) {
      return [];
    }

    const output = execSync(
      `git log --format="%ae|%an|%aI" --after="${AIDOKU_COMMUNITY_CUTOFF}" -- "${fullPath}"`,
      { cwd: AIDOKU_COMMUNITY_PATH, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );

    const commits = output.trim().split("\n").filter(Boolean);
    const byEmail = new Map<string, { name: string; commits: number; firstCommit: string }>();

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

function resolveGithub(
  email: string,
  emailCache: Record<string, string | null>
): string | null {
  const cached = emailCache[email];
  if (cached !== undefined) return cached;
  return extractFromNoreply(email);
}

function mergeAndDedupeAuthors(
  base: ContributorData[],
  community: ContributorData[],
  emailCache: Record<string, string | null>
): AuthorOutput[] {
  const byEmail = new Map<string, ContributorData>();

  for (const c of base) {
    byEmail.set(c.email, { ...c });
  }

  for (const c of community) {
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

  // Dedupe by github username
  const byIdentity = new Map<string, AuthorOutput>();

  for (const c of byEmail.values()) {
    const github = resolveGithub(c.email, emailCache);
    const key = github?.toLowerCase() ?? c.email.toLowerCase();

    const existing = byIdentity.get(key);
    if (existing) {
      existing.commits += c.commits;
      if (c.firstCommit < existing.firstCommit) {
        existing.firstCommit = c.firstCommit;
        existing.name = c.name;
      }
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

  // Sort by firstCommit ascending
  return Array.from(byIdentity.values())
    .sort((a, b) => a.firstCommit.localeCompare(b.firstCommit));
}

function main() {
  const sourceName = process.argv[2];
  
  if (!sourceName) {
    console.error("Usage: bun dev/get-aidoku-source-authors.ts <lang.name>");
    console.error("Example: bun dev/get-aidoku-source-authors.ts en.mangadex");
    process.exit(1);
  }

  const baseData = loadBaseData();
  const emailCache = loadEmailCache();

  const baseContributors = baseData.sources[sourceName] ?? [];
  const communityContributors = getAidokuCommunityCommits(sourceName);

  const authors = mergeAndDedupeAuthors(baseContributors, communityContributors, emailCache);

  console.log(JSON.stringify(authors));
}

main();

