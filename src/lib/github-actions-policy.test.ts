import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const WORKFLOW_DIRECTORY = path.resolve(import.meta.dir, "../../.github/workflows");
const WORKFLOW_FILE_PATTERN = /\.ya?ml$/;
const ACTION_REFERENCE_PATTERN = /^\s*(?:-\s+)?uses:\s*([^\s#]+)/gm;
const IMMUTABLE_ACTION_REFERENCE_PATTERN = /^[^@\s]+@[0-9a-f]{40}$/;

describe("GitHub Actions supply-chain policy", () => {
  test("pins every remote action to an immutable commit", () => {
    const workflowFiles = readdirSync(WORKFLOW_DIRECTORY)
      .filter((name) => WORKFLOW_FILE_PATTERN.test(name))
      .sort();
    expect(workflowFiles.length).toBeGreaterThan(0);

    const mutableReferences: string[] = [];
    for (const workflowFile of workflowFiles) {
      const contents = readFileSync(path.join(WORKFLOW_DIRECTORY, workflowFile), "utf8");
      for (const match of contents.matchAll(ACTION_REFERENCE_PATTERN)) {
        const reference = match[1];
        if (reference.startsWith("./") || reference.startsWith("docker://")) continue;
        if (!IMMUTABLE_ACTION_REFERENCE_PATTERN.test(reference)) {
          mutableReferences.push(`${workflowFile}: ${reference}`);
        }
      }
    }

    expect(mutableReferences).toEqual([]);
  });
});
