/**
 * On-device OCR layout: turns the line-level output of a platform text
 * recognizer (Apple Vision today, ML Kit later) into the bubble-level,
 * reading-ordered `MobileOcrDetection` contract the cloud OCR service
 * (`services/ocr/server.py`) returns, so the transcript UI, overlay and
 * grammar pipeline cannot tell the engines apart.
 *
 * Cloud contract recap (server.py + text_order.py):
 * - one detection per text region (speech bubble / caption / SFX block),
 *   top-left pixel box of the source image;
 * - `order` is 0..n-1 in manga reading order (right-to-left pages);
 * - empty regions are dropped and the order re-numbered;
 * - `label`/`cls` are eng=0, ja=1, unknown=2.
 *
 * This is an independent implementation (not derived from Aidoku's GPL
 * clustering or the cloud's Kovanen panel method): lines are merged into
 * blocks with a size-aware union-find, blocks are ordered with a recursive
 * XY-cut that prefers panel rows (top-to-bottom) and then columns
 * (right-to-left), and ruby (furigana) lines are dropped so they do not
 * leak into the transcript.
 */
import type { MobileOcrDetection } from "./mobileJapaneseLearningOcr";

export type MobileOcrRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** Recognizer-reported direction (Vision iOS 26+); null when unknown. */
export type MobileOcrLineDirection =
  | "topToBottom"
  | "leftToRight"
  | "rightToLeft"
  | null;

export type MobileOnDeviceOcrLine = {
  text: string;
  /** 0..1 recognizer confidence. */
  confidence: number;
  /** Top-left pixel box in the oriented source image. */
  box: MobileOcrRect;
  direction: MobileOcrLineDirection;
  /**
   * Optional per-character boxes (index-aligned with the line's characters);
   * a null entry means the recognizer could not place that character. The
   * text itself is never truncated when boxes are missing.
   */
  characterBoxes?: ReadonlyArray<MobileOcrRect | null> | null;
};

export type MobileOnDeviceOcrPage = {
  width: number;
  height: number;
  lines: ReadonlyArray<MobileOnDeviceOcrLine>;
};

export type MobileOcrOrientation = "vertical" | "horizontal";

export type MobileOcrLayoutBlock = {
  box: MobileOcrRect;
  orientation: MobileOcrOrientation;
  lines: MobileOnDeviceOcrLine[];
  text: string;
  confidence: number;
  label: MobileOcrDetection["label"];
};

const JAPANESE_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ々〆ー]/;
const LATIN_PATTERN = /[A-Za-zＡ-Ｚａ-ｚ]/;
const KANA_ONLY_PATTERN = /^[぀-ヿー]+$/;
const LABEL_CLASS: Record<MobileOcrDetection["label"], number> = {
  eng: 0,
  ja: 1,
  unknown: 2,
};

function width(rect: MobileOcrRect): number {
  return Math.max(0, rect.x2 - rect.x1);
}

function height(rect: MobileOcrRect): number {
  return Math.max(0, rect.y2 - rect.y1);
}

function centerX(rect: MobileOcrRect): number {
  return (rect.x1 + rect.x2) / 2;
}

function centerY(rect: MobileOcrRect): number {
  return (rect.y1 + rect.y2) / 2;
}

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function gap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));
}

function union(rects: ReadonlyArray<MobileOcrRect>): MobileOcrRect {
  return rects.reduce(
    (acc, rect) => ({
      x1: Math.min(acc.x1, rect.x1),
      y1: Math.min(acc.y1, rect.y1),
      x2: Math.max(acc.x2, rect.x2),
      y2: Math.max(acc.y2, rect.y2),
    }),
    { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Code-point length; Vision character boxes are per Character, not UTF-16. */
function characterCount(text: string): number {
  return Array.from(text.replace(/\s+/g, "")).length;
}

export function classifyMobileOcrScript(
  text: string,
): MobileOcrDetection["label"] {
  if (JAPANESE_PATTERN.test(text)) return "ja";
  if (LATIN_PATTERN.test(text)) return "eng";
  return "unknown";
}

/**
 * Orientation of one line: the recognizer's direction when it reports one
 * (iOS 26+), otherwise geometry. Single characters have no geometric
 * orientation and return null so they adopt their block's.
 */
export function mobileOcrLineOrientation(
  line: MobileOnDeviceOcrLine,
): MobileOcrOrientation | null {
  if (line.direction === "topToBottom") return "vertical";
  if (line.direction === "leftToRight" || line.direction === "rightToLeft") {
    return "horizontal";
  }
  if (characterCount(line.text) < 2) return null;
  const w = width(line.box);
  const h = height(line.box);
  if (h > w * 1.2) return "vertical";
  return "horizontal";
}

/**
 * Glyph size in pixels: the median short side of the character boxes when
 * the recognizer placed them, otherwise the line's cross-axis extent.
 */
export function mobileOcrLineGlyphSize(line: MobileOnDeviceOcrLine): number {
  const boxes = (line.characterBoxes ?? []).filter(
    (box): box is MobileOcrRect => box != null && width(box) > 0 && height(box) > 0,
  );
  if (boxes.length > 0) {
    return median(boxes.map((box) => Math.max(width(box), height(box))));
  }
  const orientation = mobileOcrLineOrientation(line);
  const w = width(line.box);
  const h = height(line.box);
  if (orientation === "vertical") return w;
  if (orientation === "horizontal") return h;
  return Math.max(w, h);
}

type PreparedLine = {
  line: MobileOnDeviceOcrLine;
  orientation: MobileOcrOrientation | null;
  glyph: number;
  kanaOnly: boolean;
};

function prepareLines(
  lines: ReadonlyArray<MobileOnDeviceOcrLine>,
  page: { width: number; height: number },
): PreparedLine[] {
  const prepared: PreparedLine[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    const box = {
      x1: Math.max(0, Math.min(page.width, line.box.x1)),
      y1: Math.max(0, Math.min(page.height, line.box.y1)),
      x2: Math.max(0, Math.min(page.width, line.box.x2)),
      y2: Math.max(0, Math.min(page.height, line.box.y2)),
    };
    if (width(box) <= 0 || height(box) <= 0) continue;
    const normalized = { ...line, text, box };
    prepared.push({
      line: normalized,
      orientation: mobileOcrLineOrientation(normalized),
      glyph: Math.max(1, mobileOcrLineGlyphSize(normalized)),
      kanaOnly: KANA_ONLY_PATTERN.test(text.replace(/\s+/g, "")),
    });
  }
  return prepared;
}

/**
 * Ruby (furigana) is a kana-only run at roughly half the glyph size, hugging
 * the right side of a vertical line or the top of a horizontal one. It is
 * reading aid, not dialogue, so it must not reach the transcript.
 */
function isRubyLine(candidate: PreparedLine, lines: PreparedLine[]): boolean {
  // Ruby is kana; very short runs are also accepted because recognizers often
  // misread tiny ruby as a kanji or digit (「おれ」→「乾」, 「み」→「1み」).
  if (!candidate.kanaOnly && characterCount(candidate.line.text) > 2) return false;
  return lines.some((base) => {
    if (base === candidate) return false;
    if (candidate.glyph > base.glyph * 0.68) return false;
    const a = candidate.line.box;
    const b = base.line.box;
    const baseVertical =
      base.orientation === "vertical" ||
      (base.orientation === null && height(b) >= width(b));
    // Ruby only spans the kanji it annotates, so it is clearly shorter than
    // its base run; a full-length small kana column is dialogue. Ruby at
    // half the glyph size may run longer (「だいじょうぶ」 over 大丈夫 is
    // two-thirds of 「大丈夫？」), so the length bound relaxes for it.
    const lengthShare = candidate.glyph <= base.glyph * 0.55 ? 0.85 : 0.65;
    if (baseVertical) {
      const verticalShare = overlap(a.y1, a.y2, b.y1, b.y2) / Math.max(1, height(a));
      const sideGap = a.x1 - b.x2;
      return (
        height(a) <= height(b) * lengthShare &&
        verticalShare >= 0.6 &&
        centerX(a) > centerX(b) &&
        sideGap >= -base.glyph * 0.5 &&
        sideGap <= base.glyph * 0.6
      );
    }
    const horizontalShare =
      overlap(a.x1, a.x2, b.x1, b.x2) / Math.max(1, width(a));
    const topGap = b.y1 - a.y2;
    return (
      width(a) <= width(b) * lengthShare &&
      horizontalShare >= 0.6 &&
      centerY(a) < centerY(b) &&
      topGap >= -base.glyph * 0.5 &&
      topGap <= base.glyph * 0.6
    );
  });
}

function intersectionOverUnion(a: MobileOcrRect, b: MobileOcrRect): number {
  const intersection =
    overlap(a.x1, a.x2, b.x1, b.x2) * overlap(a.y1, a.y2, b.y1, b.y2);
  const unionArea = width(a) * height(a) + width(b) * height(b) - intersection;
  return unionArea > 0 ? intersection / unionArea : 0;
}

/**
 * Recognizers sometimes emit two competing readings of the same region
 * (typically handwriting). Keep the more confident (then longer) one.
 */
function dropDuplicateLines(lines: PreparedLine[]): PreparedLine[] {
  const ranked = lines
    .slice()
    .sort(
      (a, b) =>
        b.line.confidence - a.line.confidence ||
        characterCount(b.line.text) - characterCount(a.line.text),
    );
  const kept: PreparedLine[] = [];
  for (const candidate of ranked) {
    if (
      !kept.some(
        (other) => intersectionOverUnion(candidate.line.box, other.line.box) >= 0.6,
      )
    ) {
      kept.push(candidate);
    }
  }
  return lines.filter((item) => kept.includes(item));
}

function belongTogether(a: PreparedLine, b: PreparedLine): boolean {
  const ratio = a.glyph / b.glyph;
  if (ratio < 0.6 || ratio > 1 / 0.6) return false;
  if (a.orientation && b.orientation && a.orientation !== b.orientation) {
    return false;
  }
  const glyph = Math.max(a.glyph, b.glyph);
  const ra = a.line.box;
  const rb = b.line.box;
  const gx = gap(ra.x1, ra.x2, rb.x1, rb.x2);
  const gy = gap(ra.y1, ra.y2, rb.y1, rb.y2);
  const orientation = a.orientation ?? b.orientation;
  const xShare =
    overlap(ra.x1, ra.x2, rb.x1, rb.x2) / Math.max(1, Math.min(width(ra), width(rb)));
  const yShare =
    overlap(ra.y1, ra.y2, rb.y1, rb.y2) / Math.max(1, Math.min(height(ra), height(rb)));

  if (orientation === "vertical") {
    // Neighbouring columns of one bubble, or one column split in two.
    return (
      // Bubble columns are staggered (inner columns start lower), so an
      // adjacent column only has to overlap slightly or sit within a glyph.
      (gx <= glyph * 1.1 && (yShare >= 0.05 || gy <= glyph)) ||
      (xShare >= 0.5 && gy <= glyph * 1.2)
    );
  }
  if (orientation === "horizontal") {
    // Stacked lines of one bubble, or one line split in two.
    return (
      (gy <= glyph * 0.9 && xShare >= 0.1) ||
      (yShare >= 0.5 && gx <= glyph * 1.2)
    );
  }
  // Two orientation-less fragments (single glyphs): adjacent in one step.
  return gx <= glyph * 0.9 && gy <= glyph * 0.9;
}

function blockOrientation(lines: PreparedLine[]): MobileOcrOrientation {
  let vertical = 0;
  let horizontal = 0;
  for (const item of lines) {
    const weight = characterCount(item.line.text);
    if (item.orientation === "vertical") vertical += weight;
    else if (item.orientation === "horizontal") horizontal += weight;
  }
  if (vertical !== horizontal) return vertical > horizontal ? "vertical" : "horizontal";
  const box = union(lines.map((item) => item.line.box));
  const japanese = lines.some((item) => JAPANESE_PATTERN.test(item.line.text));
  // Orientation-less fragments (single glyphs): Japanese manga text is
  // vertical unless the fragments clearly form one row.
  return japanese && width(box) <= height(box) * 2 ? "vertical" : "horizontal";
}

/**
 * Orders the lines inside one block: vertical text reads columns right to
 * left and each column top to bottom; horizontal text reads rows top to
 * bottom and each row left to right. Fragments of one column/row are
 * grouped first so single-glyph recognitions still read correctly.
 */
function orderBlockLines(
  lines: PreparedLine[],
  orientation: MobileOcrOrientation,
): PreparedLine[] {
  const tracks: { lines: PreparedLine[]; box: MobileOcrRect }[] = [];
  const sorted = lines
    .slice()
    .sort((a, b) =>
      orientation === "vertical"
        ? centerX(b.line.box) - centerX(a.line.box)
        : centerY(a.line.box) - centerY(b.line.box),
    );
  for (const item of sorted) {
    const box = item.line.box;
    const track = tracks.find((candidate) => {
      const share =
        orientation === "vertical"
          ? overlap(box.x1, box.x2, candidate.box.x1, candidate.box.x2) /
            Math.max(1, Math.min(width(box), width(candidate.box)))
          : overlap(box.y1, box.y2, candidate.box.y1, candidate.box.y2) /
            Math.max(1, Math.min(height(box), height(candidate.box)));
      return share >= 0.5;
    });
    if (track) {
      track.lines.push(item);
      track.box = union([track.box, box]);
    } else {
      tracks.push({ lines: [item], box });
    }
  }
  tracks.sort((a, b) =>
    orientation === "vertical"
      ? centerX(b.box) - centerX(a.box)
      : centerY(a.box) - centerY(b.box),
  );
  return tracks.flatMap((track) =>
    track.lines.sort((a, b) =>
      orientation === "vertical"
        ? a.line.box.y1 - b.line.box.y1
        : a.line.box.x1 - b.line.box.x1,
    ),
  );
}

function joinBlockText(
  lines: PreparedLine[],
  label: MobileOcrDetection["label"],
): string {
  if (label !== "eng") {
    return lines.map((item) => item.line.text.replace(/\s+/g, "")).join("");
  }
  let text = "";
  for (const item of lines) {
    const next = item.line.text.replace(/\s+/g, " ").trim();
    if (!text) text = next;
    else if (/[A-Za-z]-$/.test(text)) text = `${text.slice(0, -1)}${next}`;
    else text = `${text} ${next}`;
  }
  return text;
}

/** Merges recognized lines into text blocks (bubbles, captions, SFX). */
export function groupMobileOcrLinesIntoBlocks(
  page: MobileOnDeviceOcrPage,
): MobileOcrLayoutBlock[] {
  const prepared = prepareLines(page.lines, page);
  const lines = dropDuplicateLines(prepared).filter(
    (item, _, all) => !isRubyLine(item, all),
  );
  const parent = lines.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (belongTogether(lines[i]!, lines[j]!)) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[b] = a;
      }
    }
  }
  const groups = new Map<number, PreparedLine[]>();
  lines.forEach((item, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(item);
    else groups.set(root, [item]);
  });

  const blocks: MobileOcrLayoutBlock[] = [];
  for (const group of groups.values()) {
    const orientation = blockOrientation(group);
    const ordered = orderBlockLines(group, orientation);
    const combined = ordered.map((item) => item.line.text).join("");
    const label = classifyMobileOcrScript(combined);
    const text = joinBlockText(ordered, label);
    if (!text) continue;
    const weights = ordered.map((item) => Math.max(1, characterCount(item.line.text)));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const confidence =
      ordered.reduce(
        (sum, item, index) => sum + item.line.confidence * weights[index]!,
        0,
      ) / totalWeight;
    blocks.push({
      box: union(ordered.map((item) => item.line.box)),
      orientation,
      lines: ordered.map((item) => item.line),
      text,
      confidence: Math.max(0, Math.min(1, confidence)),
      label,
    });
  }
  return blocks;
}

type AxisGroup<T> = { items: T[]; start: number; end: number };

function splitAlongAxis<T extends { box: MobileOcrRect }>(
  items: T[],
  axis: "x" | "y",
): { groups: AxisGroup<T>[]; largestGap: number } {
  const start = (item: T) => (axis === "x" ? item.box.x1 : item.box.y1);
  const end = (item: T) => (axis === "x" ? item.box.x2 : item.box.y2);
  const sorted = items.slice().sort((a, b) => start(a) - start(b));
  const groups: AxisGroup<T>[] = [];
  let largestGap = 0;
  for (const item of sorted) {
    const current = groups[groups.length - 1];
    if (current && start(item) < current.end) {
      current.items.push(item);
      current.end = Math.max(current.end, end(item));
    } else {
      if (current) largestGap = Math.max(largestGap, start(item) - current.end);
      groups.push({ items: [item], start: start(item), end: end(item) });
    }
  }
  return { groups, largestGap };
}

/**
 * Manga reading order for text blocks on a right-to-left page: a recursive
 * XY-cut. Horizontal gutters (panel rows) are cut first, top to bottom;
 * vertical gutters are cut right to left. A vertical cut wins over a
 * horizontal one only when its gutter is clearly wider, which keeps tall
 * right-hand panels together. Blocks that cannot be separated on either
 * axis are read from the top-right corner outward.
 */
export function orderMobileOcrBlocksForManga<T extends { box: MobileOcrRect }>(
  blocks: ReadonlyArray<T>,
  pageWidth: number,
): T[] {
  const visit = (items: T[]): T[] => {
    if (items.length <= 1) return items;
    const rows = splitAlongAxis(items, "y");
    const columns = splitAlongAxis(items, "x");
    const canRows = rows.groups.length > 1;
    const canColumns = columns.groups.length > 1;
    if (canColumns && (!canRows || columns.largestGap > rows.largestGap * 1.5)) {
      return columns.groups
        .slice()
        .reverse()
        .flatMap((group) => visit(group.items));
    }
    if (canRows) {
      return rows.groups.flatMap((group) => visit(group.items));
    }
    return items
      .slice()
      .sort(
        (a, b) =>
          a.box.y1 + (pageWidth - a.box.x2) - (b.box.y1 + (pageWidth - b.box.x2)),
      );
  };
  return visit(blocks.slice());
}

/**
 * Scan-site watermarks (「Gomuraw.com」, 「aW.com」) are Latin-only domain
 * fragments stamped on raw pages; they are not dialogue.
 */
const WATERMARK_PATTERN = /^[\W_]*[a-z0-9-]*\s*[.,]\s*(com|net|org|top|info|to|me|io|cc)[\W_]*$/i;

function isMobileOcrWatermark(block: Pick<MobileOcrLayoutBlock, "label" | "text">): boolean {
  return block.label === "eng" && WATERMARK_PATTERN.test(block.text.replace(/\s+/g, ""));
}

/**
 * Watermark test for recognizer output that may be full-width (manga-ocr
 * writes 「Ｇｏｍｕｒａｗ．ｃｏｍ」): NFKC first, then the Latin-domain rule.
 */
export function isMobileOcrWatermarkText(text: string): boolean {
  const normalized = text.normalize("NFKC");
  return isMobileOcrWatermark({ label: classifyMobileOcrScript(normalized), text: normalized });
}

/**
 * Interim text detector for the manga-ocr pipeline: the bubble blocks of
 * the Vision line layout (ruby dropped, watermarks removed), unordered —
 * the native pipeline orders them with its text_order port.
 */
export function detectMobileOcrLayoutRegions(page: MobileOnDeviceOcrPage): MobileOcrLayoutBlock[] {
  if (!(page.width > 0) || !(page.height > 0)) return [];
  return groupMobileOcrLinesIntoBlocks(page).filter((block) => !isMobileOcrWatermark(block));
}

/**
 * Full on-device layout: lines → blocks → reading order → the cloud
 * `MobileOcrDetection[]` contract (integer pixel boxes, sequential order).
 */
export function layoutMobileOnDeviceOcrPage(
  page: MobileOnDeviceOcrPage,
): MobileOcrDetection[] {
  if (!(page.width > 0) || !(page.height > 0)) return [];
  const ordered = orderMobileOcrBlocksForManga(
    groupMobileOcrLinesIntoBlocks(page),
    page.width,
  );
  return ordered.filter((block) => !isMobileOcrWatermark(block)).map((block, order) => ({
    x1: Math.floor(block.box.x1),
    y1: Math.floor(block.box.y1),
    x2: Math.ceil(block.box.x2),
    y2: Math.ceil(block.box.y2),
    conf: Math.round(block.confidence * 1000) / 1000,
    cls: LABEL_CLASS[block.label],
    label: block.label,
    order,
    text: block.text,
  }));
}

/**
 * Second-pass text for one detection: the lines Vision read on the
 * detection's own upscaled crop (already in page pixels). Ruby is dropped
 * and the lines are ordered exactly as on the page; only Japanese blocks
 * are kept, so a gutter glyph or a watermark caught by the padded crop does
 * not leak in. An empty or non-Japanese second read keeps the first-pass
 * text, and the detection's box and order never change (the overlay and
 * the transcript stay put).
 */
export function refineMobileOcrDetectionText(
  detection: MobileOcrDetection,
  page: { width: number; height: number },
  lines: ReadonlyArray<MobileOnDeviceOcrLine>,
): MobileOcrDetection {
  if (detection.label !== "ja" || lines.length === 0) return detection;
  const blocks = orderMobileOcrBlocksForManga(
    groupMobileOcrLinesIntoBlocks({ width: page.width, height: page.height, lines }),
    page.width,
  ).filter((block) => block.label === "ja");
  const text = blocks.map((block) => block.text).join("");
  if (!text) return detection;
  const weights = blocks.map((block) => Math.max(1, characterCount(block.text)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const confidence =
    blocks.reduce((sum, block, index) => sum + block.confidence * weights[index]!, 0) / total;
  return {
    ...detection,
    text,
    conf: Math.round(Math.max(0, Math.min(1, confidence)) * 1000) / 1000,
  };
}
