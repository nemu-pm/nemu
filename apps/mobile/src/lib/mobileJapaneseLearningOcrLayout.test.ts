import { describe, expect, test } from "bun:test";
import {
  classifyMobileOcrScript,
  groupMobileOcrLinesIntoBlocks,
  layoutMobileOnDeviceOcrPage,
  mobileOcrLineOrientation,
  orderMobileOcrBlocksForManga,
  type MobileOnDeviceOcrLine,
} from "./mobileJapaneseLearningOcrLayout";

function column(
  text: string,
  x: number,
  y: number,
  glyph = 30,
  confidence = 1,
): MobileOnDeviceOcrLine {
  return {
    text,
    confidence,
    box: { x1: x, y1: y, x2: x + glyph, y2: y + glyph * Array.from(text).length },
    direction: null,
  };
}

function row(
  text: string,
  x: number,
  y: number,
  glyph = 24,
  confidence = 0.5,
): MobileOnDeviceOcrLine {
  return {
    text,
    confidence,
    box: { x1: x, y1: y, x2: x + glyph * 0.55 * text.length, y2: y + glyph },
    direction: null,
  };
}

const PAGE = { width: 1000, height: 1400 };

describe("on-device OCR layout", () => {
  test("classifies scripts with the cloud label vocabulary", () => {
    expect(classifyMobileOcrScript("こんにちは")).toBe("ja");
    expect(classifyMobileOcrScript("漢字")).toBe("ja");
    expect(classifyMobileOcrScript("HELLO!")).toBe("eng");
    expect(classifyMobileOcrScript("!?…")).toBe("unknown");
  });

  test("uses the recognizer direction when present and geometry otherwise", () => {
    expect(
      mobileOcrLineOrientation({ ...row("ab", 0, 0), direction: "topToBottom" }),
    ).toBe("vertical");
    expect(mobileOcrLineOrientation(column("縦書き", 0, 0))).toBe("vertical");
    expect(mobileOcrLineOrientation(row("hello", 0, 0))).toBe("horizontal");
    expect(mobileOcrLineOrientation(column("あ", 0, 0))).toBeNull();
  });

  test("merges vertical columns into bubbles and reads them right to left", () => {
    const detections = layoutMobileOnDeviceOcrPage({
      ...PAGE,
      lines: [
        // Left bubble (read second): three columns.
        column("ました", 100, 120),
        column("かり", 140, 110),
        column("わ", 180, 100),
        // Right bubble (read first): two columns, slightly lower.
        column("すか", 760, 160),
        column("本当で", 800, 150),
      ],
    });
    expect(detections.map((detection) => detection.text)).toEqual([
      "本当ですか",
      "わかりました",
    ]);
    expect(detections.map((detection) => detection.order)).toEqual([0, 1]);
    expect(detections[0]).toMatchObject({
      x1: 760,
      y1: 150,
      x2: 830,
      label: "ja",
      cls: 1,
    });
  });

  test("reads panel rows top to bottom before right-to-left within a row", () => {
    const detections = layoutMobileOnDeviceOcrPage({
      ...PAGE,
      lines: [
        column("下の段", 500, 900),
        column("左上", 120, 100),
        column("右上", 820, 140),
      ],
    });
    expect(detections.map((detection) => detection.text)).toEqual([
      "右上",
      "左上",
      "下の段",
    ]);
  });

  test("keeps a tall right-hand panel together when its gutter is clearly wider", () => {
    const blocks = [
      { id: "right-top", box: { x1: 800, y1: 100, x2: 900, y2: 300 } },
      { id: "right-bottom", box: { x1: 800, y1: 700, x2: 900, y2: 900 } },
      { id: "left-top", box: { x1: 100, y1: 150, x2: 200, y2: 350 } },
      { id: "left-bottom", box: { x1: 100, y1: 750, x2: 200, y2: 950 } },
    ];
    expect(
      orderMobileOcrBlocksForManga(blocks, 1000).map((block) => block.id),
    ).toEqual(["right-top", "right-bottom", "left-top", "left-bottom"]);
  });

  test("joins English lines with spaces and repairs hyphenated breaks", () => {
    const detections = layoutMobileOnDeviceOcrPage({
      ...PAGE,
      lines: [
        row("WHAT ARE YOU", 400, 200),
        row("DOING HERE? IT'S DAN-", 380, 226),
        row("GEROUS!", 420, 252),
      ],
    });
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      text: "WHAT ARE YOU DOING HERE? IT'S DANGEROUS!",
      label: "eng",
      cls: 0,
      conf: 0.5,
    });
  });

  test("drops furigana so ruby never reaches the transcript", () => {
    const blocks = groupMobileOcrLinesIntoBlocks({
      ...PAGE,
      lines: [
        column("先生が来た", 500, 200, 40),
        // Ruby for 先生 hugging the right side at half size.
        column("せんせい", 541, 200, 18),
      ],
    });
    expect(blocks.map((block) => block.text)).toEqual(["先生が来た"]);
  });

  test("keeps a full-length small kana column that is dialogue, not ruby", () => {
    const blocks = groupMobileOcrLinesIntoBlocks({
      ...PAGE,
      lines: [
        column("一緒に写ってる", 832, 390, 44),
        column("いっしょ", 877, 390, 20),
        column("みこちゃそと", 905, 383, 45),
      ],
    });
    expect(blocks.map((block) => block.text)).toEqual(["みこちゃそと一緒に写ってる"]);
  });

  test("reassembles single-glyph recognitions into vertical columns", () => {
    const glyphs = ["な", "に", "こ", "れ"];
    const lines: MobileOnDeviceOcrLine[] = [
      // Right column なに, left column これ, recognized glyph by glyph.
      ...glyphs.slice(0, 2).map((text, index) => column(text, 600, 300 + index * 32)),
      ...glyphs.slice(2).map((text, index) => column(text, 560, 300 + index * 32)),
    ];
    const detections = layoutMobileOnDeviceOcrPage({ ...PAGE, lines });
    expect(detections.map((detection) => detection.text)).toEqual(["なにこれ"]);
  });

  test("keeps the full text when character boxes are missing and drops empty lines", () => {
    const detections = layoutMobileOnDeviceOcrPage({
      ...PAGE,
      lines: [
        {
          ...column("ドドドド", 50, 50, 60),
          characterBoxes: [null, null, { x1: 50, y1: 170, x2: 110, y2: 230 }, null],
        },
        { ...row("   ", 400, 400), text: "   " },
      ],
    });
    expect(detections).toHaveLength(1);
    expect(detections[0]!.text).toBe("ドドドド");
    expect(detections[0]!.order).toBe(0);
  });

  test("never merges dialogue with differently sized sound effects", () => {
    const blocks = groupMobileOcrLinesIntoBlocks({
      ...PAGE,
      lines: [column("ゴゴゴ", 300, 100, 90), column("来たか", 395, 120, 30)],
    });
    expect(blocks).toHaveLength(2);
  });

  test("clamps boxes to the page and emits integer pixel boxes", () => {
    const detections = layoutMobileOnDeviceOcrPage({
      width: 500,
      height: 500,
      lines: [
        {
          text: "はみ出し",
          confidence: 0.3,
          box: { x1: 470.4, y1: -10, x2: 530, y2: 130.2 },
          direction: "topToBottom",
        },
      ],
    });
    expect(detections[0]).toMatchObject({ x1: 470, y1: 0, x2: 500, y2: 131 });
  });
});

describe("on-device OCR layout — recognizer artefacts", () => {
  test("keeps only the more confident of two competing readings of one region", () => {
    const blocks = groupMobileOcrLinesIntoBlocks({
      ...PAGE,
      lines: [
        { ...column("曲大の」", 350, 420, 30), confidence: 0.3 },
        { ...column("曲木の重", 352, 428, 30), confidence: 0.5 },
      ],
    });
    expect(blocks.map((block) => block.text)).toEqual(["曲木の重"]);
  });

  test("merges staggered bubble columns that barely overlap", () => {
    const blocks = groupMobileOcrLinesIntoBlocks({
      ...PAGE,
      lines: [column("オランダ風", 669, 1163, 40), column("子細工を", 620, 1300, 40)],
    });
    expect(blocks.map((block) => block.text)).toEqual(["オランダ風子細工を"]);
  });
});

describe("on-device OCR layout — misread ruby", () => {
  test("drops a tiny ruby run that the recognizer misread as a kanji", () => {
    const blocks = groupMobileOcrLinesIntoBlocks({
      ...PAGE,
      lines: [column("俺の大谷投法", 363, 1030, 30), column("乾", 391, 1030, 16)],
    });
    expect(blocks.map((block) => block.text)).toEqual(["俺の大谷投法"]);
  });
});
