/**
 * The manga detail page's description sheet: the synopsis as paragraphs, one
 * per non-empty line (sources separate paragraphs with one or two line
 * breaks), each trimmed.
 */
export function splitMobileDescriptionParagraphs(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

