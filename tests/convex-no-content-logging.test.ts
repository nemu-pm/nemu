import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Privacy contract: user content (chat messages, page transcripts, TTS text,
 * titles sent to AI providers, model output) passes through Convex to the AI
 * providers but is never written to Convex function logs. Logs may carry
 * counts, model names, durations, and error classes only.
 */

const CONVEX_DIR = join(import.meta.dir, "..", "convex");

/** Words that name request/response content in the Convex sources. */
const CONTENT_WORDS =
  /\b(text|ttsText|cleanText|rawText|messages|aiMessages\w*|modelMessages\w*|systemPrompt|hiddenContext|transcript|prompt|title|authors?|description|parsed|translated|japanese\w*|english\w*|romaji\w*|chinese\w*|errorText|trimmed|accumulatedText|collectedSuggestions|rawValue|delta|input|output|content|message|object)\b/;

function sources(): Array<{ file: string; code: string }> {
  return readdirSync(CONVEX_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((file) => ({
      file,
      code: readFileSync(join(CONVEX_DIR, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1"),
    }));
}

/** Returns the argument text of every call to one of `callees`. */
function callArguments(code: string, callees: RegExp): string[] {
  const found: string[] = [];
  const pattern = new RegExp("(?:" + callees.source + ")\\s*\\(", "g");
  for (const match of code.matchAll(pattern)) {
    let depth = 1;
    let i = match.index! + match[0].length;
    const start = i;
    let quote: string | null = null;
    for (; i < code.length && depth > 0; i++) {
      const ch = code[i]!;
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    found.push(code.slice(start, i - 1));
  }
  return found;
}

/** Drops string literals and `.length` / `.name` reads, which carry no content. */
function strip(args: string): string {
  return args
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    // Keep only a template literal's ${...} expressions, not its fixed text.
    .replace(/`((?:[^`\\]|\\.)*)`/g, (_m, body: string) =>
      [...body.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(" "),
    )
    .replace(/[\w.?[\]]+\.(length|name)\b/g, "")
    .replace(/\btypeof\s+[\w.]+/g, "")
    .replace(/(^|[{,\s])\w+(?=\s*:)/g, "$1");
}

describe("Convex function logs never contain user content", () => {
  const logCall = /console\.(?:log|info|warn|error|debug)|\bstreamLogs\.push|\bt\.log/;

  for (const { file, code } of sources()) {
    const calls = callArguments(code, logCall);
    if (calls.length === 0) continue;
    test(`${file}: ${calls.length} log call(s) are metadata only`, () => {
      for (const call of calls) {
        const remaining = strip(call);
        expect({ call: call.slice(0, 120), leak: remaining.match(CONTENT_WORDS)?.[0] })
          .toEqual({ call: call.slice(0, 120), leak: undefined });
      }
    });
  }

  test("the scanner catches the leaks it exists to prevent", () => {
    const leaky = [
      'console.log("ctx", JSON.stringify(aiMessages))',
      "console.log(`post-tag ${ttsText}`)",
      'console.warn("failed", err.message)',
      "streamLogs.push(JSON.stringify({ content: text }))",
      't.log(`Found: ${parsed.title}`)',
    ];
    for (const line of leaky) {
      const args = callArguments(line, logCall)[0]!;
      expect(strip(args).match(CONTENT_WORDS)).not.toBeNull();
    }
    const safe = "console.log('x', { chars: text.length, model: MODEL })";
    expect(strip(callArguments(safe, logCall)[0]!).match(CONTENT_WORDS)).toBeNull();
  });
});
