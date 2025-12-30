import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type AidokuPage = { index: number; url: string };

function extractJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Failed to locate JSON array in output (len=${text.length})`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

function assertPages(x: unknown): AidokuPage[] {
  if (!Array.isArray(x)) throw new Error("pages JSON is not an array");
  for (const it of x) {
    if (typeof it !== "object" || it === null) throw new Error("pages item not object");
    const index = (it as any).index;
    const url = (it as any).url;
    if (typeof index !== "number" || typeof url !== "string") {
      throw new Error("pages item missing {index:number,url:string}");
    }
  }
  return x as AidokuPage[];
}

async function runAidokuPagesJson(sourceId: string, mangaKey: string, chapterKey: string) {
  const proc = Bun.spawnSync({
    cmd: ["aidoku", "test", "pages", "--json", sourceId, mangaKey, chapterKey],
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const out = proc.stdout.toString("utf8");
  const err = proc.stderr.toString("utf8");
  if (proc.exitCode !== 0) {
    throw new Error(`aidoku failed (${proc.exitCode})\nstdout:\n${out}\nstderr:\n${err}`);
  }
  const parsed = extractJsonArray(out);
  return assertPages(parsed);
}

async function downloadTo(url: string, outFile: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} ${res.statusText}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outFile, buf);
}

function extFromUrl(url: string): string {
  const clean = url.split("?")[0]!;
  const ext = path.extname(clean).toLowerCase();
  return ext && ext.length <= 6 ? ext : ".img";
}

async function main() {
  const primary = {
    sourceId: "ja.rawkuma",
    mangaKey: "/manga/drawing-saikyou-mangaka-wa-oekaki-skill-de-isekai-musou-suru/",
    chapterKey: "/manga/drawing-saikyou-mangaka-wa-oekaki-skill-de-isekai-musou-suru/chapter-1.117360/",
  };
  const secondary = {
    sourceId: "zh.copymanga",
    mangaKey: "zqmhjlyhhjnzysjkws",
    chapterKey: "ce8f331a-4e54-11ec-a0b6-024352452ce0",
  };

  const downloadAll = process.env.DUAL_READ_DEBUG_ALL === "1";
  const secondaryOffset = Number(process.env.DUAL_READ_DEBUG_OFFSET ?? "1");
  const maxPages = Number(process.env.DUAL_READ_DEBUG_MAX_PAGES ?? "0");
  const pairs = downloadAll
    ? []
    : [
        { primaryIndex: 2, secondaryIndex: 3 },
        { primaryIndex: 3, secondaryIndex: 4 },
        { primaryIndex: 4, secondaryIndex: 5 },
        { primaryIndex: 14, secondaryIndex: 15 },
        { primaryIndex: 15, secondaryIndex: 16 },
        { primaryIndex: 16, secondaryIndex: 17 },
      ];

  const outDir = path.resolve("public/dual-read-debug");
  await mkdir(outDir, { recursive: true });

  const primaryPages = await runAidokuPagesJson(primary.sourceId, primary.mangaKey, primary.chapterKey);
  const secondaryPages = await runAidokuPagesJson(secondary.sourceId, secondary.mangaKey, secondary.chapterKey);

  if (downloadAll) {
    const limit = maxPages > 0 ? Math.min(primaryPages.length, maxPages) : primaryPages.length;
    for (let primaryIndex = 0; primaryIndex < limit; primaryIndex += 1) {
      const secondaryIndex = primaryIndex + secondaryOffset;
      if (secondaryIndex < 0 || secondaryIndex >= secondaryPages.length) continue;
      pairs.push({ primaryIndex, secondaryIndex });
    }
  }

  const manifestPairs: { id: string; label: string; primaryUrl: string; secondaryUrl: string }[] = [];

  for (const pair of pairs) {
    const primaryPage = primaryPages.find((p) => p.index === pair.primaryIndex);
    const secondaryPage = secondaryPages.find((p) => p.index === pair.secondaryIndex);
    if (!primaryPage || !secondaryPage) {
      throw new Error(`Missing page for pair ${pair.primaryIndex}/${pair.secondaryIndex}`);
    }
    const primaryExt = extFromUrl(primaryPage.url);
    const secondaryExt = extFromUrl(secondaryPage.url);
    const primaryFile = `primary-${String(pair.primaryIndex + 1).padStart(4, "0")}${primaryExt}`;
    const secondaryFile = `secondary-${String(pair.secondaryIndex + 1).padStart(4, "0")}${secondaryExt}`;
    await downloadTo(primaryPage.url, path.join(outDir, primaryFile));
    await downloadTo(secondaryPage.url, path.join(outDir, secondaryFile));
    manifestPairs.push({
      id: `p${String(pair.primaryIndex + 1).padStart(4, "0")}-s${String(pair.secondaryIndex + 1).padStart(4, "0")}`,
      label: `Primary ${String(pair.primaryIndex + 1).padStart(4, "0")} / Secondary ${String(pair.secondaryIndex + 1).padStart(4, "0")}`,
      primaryUrl: `/dual-read-debug/${primaryFile}`,
      secondaryUrl: `/dual-read-debug/${secondaryFile}`,
    });
    console.log(`[dual-read-debug] downloaded ${primaryFile} + ${secondaryFile}`);
  }

  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({ pairs: manifestPairs }, null, 2));
  console.log(`[dual-read-debug] wrote manifest.json (${manifestPairs.length} pairs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
