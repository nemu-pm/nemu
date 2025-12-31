export type TitleParts = Array<string | null | undefined>;

const APP_NAME = "nemu";
const SEP = " · ";

function cleanPart(part: string): string {
  return part.replace(/\s+/g, " ").trim();
}

function uniquePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function formatDocumentTitle(parts: TitleParts): string {
  const cleaned = uniquePreserveOrder(
    (parts ?? [])
      .filter((p): p is string => typeof p === "string")
      .map(cleanPart)
      .filter(Boolean)
  );

  const last = cleaned[cleaned.length - 1];
  const hasAppNameLast = typeof last === "string" && last.toLowerCase() === APP_NAME.toLowerCase();

  if (cleaned.length === 0) return APP_NAME;
  if (hasAppNameLast) return cleaned.join(SEP);
  return `${cleaned.join(SEP)}${SEP}${APP_NAME}`;
}


