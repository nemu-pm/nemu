import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { normalizeVaulCss } from "./normalize-vaul-css";

const vaulRoot = path.resolve(process.cwd(), "node_modules/vaul");
const targets = ["style.css", "dist/index.js", "dist/index.mjs"] as const;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!(await exists(vaulRoot))) {
    console.warn("[patch-vaul-css] Skipped: vaul is not installed.");
    return;
  }

  let touchedFiles = 0;
  for (const target of targets) {
    const filePath = path.join(vaulRoot, target);
    let content = await readFile(filePath, "utf8");
    const original = content;
    content = normalizeVaulCss(content);
    if (!content.includes("[data-vaul-handle-hitarea]")) {
      throw new Error(
        `[patch-vaul-css] Failed to validate ${target}: handle hit-area selector is missing.`,
      );
    }
    if (content !== original) {
      await writeFile(filePath, content, "utf8");
      touchedFiles += 1;
    }
  }

  console.log(
    touchedFiles > 0
      ? `[patch-vaul-css] Patched ${touchedFiles} Vaul files.`
      : "[patch-vaul-css] Vaul CSS already patched.",
  );
}

await main();
