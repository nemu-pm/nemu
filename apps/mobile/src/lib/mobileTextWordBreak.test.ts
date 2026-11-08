import { describe, expect, test } from "bun:test";
import { hasMobileMidWordLineBreak, nextMobileWordFitMultiplier } from "./mobileTextWordBreak";

describe("hasMobileMidWordLineBreak", () => {
  test("a word split across lines", () => {
    expect(hasMobileMidWordLineBreak([{ text: "Pepper&Ca" }, { text: "rrot" }])).toBe(true);
    expect(hasMobileMidWordLineBreak([{ text: "The Pepper&Ca" }, { text: "rrot Saga" }])).toBe(true);
  });

  test("lines broken between words", () => {
    expect(hasMobileMidWordLineBreak([{ text: "Pepper&Carrot " }, { text: "Episode 1" }])).toBe(false);
    expect(hasMobileMidWordLineBreak([{ text: "Spider-" }, { text: "Man" }])).toBe(false);
    expect(hasMobileMidWordLineBreak([{ text: "One line" }])).toBe(false);
    expect(hasMobileMidWordLineBreak([])).toBe(false);
  });

  test("Chinese and Japanese break between any two characters", () => {
    expect(hasMobileMidWordLineBreak([{ text: "胡椒与胡萝" }, { text: "卜" }])).toBe(false);
    expect(hasMobileMidWordLineBreak([{ text: "ペッパーとキャ" }, { text: "ロット" }])).toBe(false);
  });

  test("accented Latin words count as words", () => {
    expect(hasMobileMidWordLineBreak([{ text: "Cứu Truy" }, { text: "ện" }])).toBe(true);
  });
});

describe("nextMobileWordFitMultiplier", () => {
  test("steps down to the text's own size, then stops", () => {
    const steps: number[] = [];
    let current: number | null = 1.6;
    while (current !== null) {
      steps.push(current);
      current = nextMobileWordFitMultiplier(current);
    }
    expect(steps[0]).toBe(1.6);
    expect(steps.at(-1)).toBe(1);
    expect(steps.every((step, index) => index === 0 || step < steps[index - 1])).toBe(true);
    expect(steps.length).toBeLessThan(8);
  });
});
