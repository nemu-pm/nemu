import { describe, expect, test } from "bun:test";
import { getGreetingPrompt } from "@nemu/core";
import { getMobileJapaneseLearningExplainPrompt, parseMobileJapaneseLearningResponseMode } from "./mobileJapaneseLearningChat";
import { getMobileReaderPlugin, getMobileReaderPluginValues } from "./mobileReaderPlugins";

const plugin = getMobileReaderPlugin("japanese-learning")!;

describe("Japanese Learning: Response language", () => {
  test("a reader who never touched it has the app-language default", () => {
    const values = getMobileReaderPluginValues(plugin, undefined);
    expect(parseMobileJapaneseLearningResponseMode(values.nemuResponseMode)).toBe("app");
  });

  test("the default says exactly what no setting said before it was wired", () => {
    for (const language of ["en", "zh", "ja"] as const) {
      expect(getGreetingPrompt(language, "app")).toBe(getGreetingPrompt(language, undefined));
      expect(getMobileJapaneseLearningExplainPrompt(language, "app", "sentence", "猫"))
        .toBe(getMobileJapaneseLearningExplainPrompt(language, undefined, "sentence", "猫"));
    }
  });

  test("the reader's choice is read, and it reaches the prompts", () => {
    const values = getMobileReaderPluginValues(plugin, { values: { nemuResponseMode: "jlpt" } } as never);
    expect(parseMobileJapaneseLearningResponseMode(values.nemuResponseMode)).toBe("jlpt");
    expect(getGreetingPrompt("en", "jlpt")).not.toBe(getGreetingPrompt("en", "app"));
  });
});
