import { describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/japanese-learning-ichiran/hanako-pos-parity.json";
import { convertIchiranToGrammarTokens } from "../../../../src/lib/plugins/builtin/japanese-learning/grammar-analysis";
import type {
  IchiranToken,
  WordInfoWithGloss,
} from "../../../../src/lib/plugins/builtin/japanese-learning/ichiran-types";
import {
  convertMobileIchiranSegments,
  type MobileGrammarToken,
} from "./mobileJapaneseLearningGrammar";

type Sample = {
  text: string;
  engine: "device" | "cloud";
  segments: unknown[];
};
const samples = (fixture as { samples: Sample[] }).samples;

type PosTree = {
  word: string;
  partOfSpeech: string;
  meanings: [string, string[]][];
  children: PosTree[];
};

type AnyGrammarToken = {
  word: string;
  partOfSpeech: string;
  meanings: { text: string; partOfSpeech: string[] }[];
  conjugations?: AnyGrammarToken[];
  alternatives?: AnyGrammarToken[];
  components?: AnyGrammarToken[];
};

function posTree(token: AnyGrammarToken): PosTree {
  return {
    word: token.word,
    partOfSpeech: token.partOfSpeech,
    meanings: token.meanings.map((meaning) => [meaning.text, meaning.partOfSpeech]),
    children: [
      ...(token.conjugations ?? []),
      ...(token.alternatives ?? []),
      ...(token.components ?? []),
    ].map(posTree),
  };
}

/** Web `ichiran-service.ts#parseTokens`: the best segmentation's word infos. */
function webTokens(segments: unknown[]): IchiranToken[] {
  const tokens: IchiranToken[] = [];
  for (const segment of segments) {
    if (typeof segment === "string") {
      tokens.push({
        word: segment,
        romanized: segment,
        info: { text: segment, kana: segment, type: "GAP" } as WordInfoWithGloss,
        alternatives: [],
      });
      continue;
    }
    const best = (segment as [unknown[], number][])[0];
    for (const tuple of best?.[0] ?? []) {
      if (!Array.isArray(tuple) || tuple.length < 2) continue;
      const info = tuple[1] as WordInfoWithGloss;
      tokens.push({ word: info.text, romanized: tuple[0], info, alternatives: [] });
    }
  }
  return tokens;
}

function mobileTokens(sample: Sample): MobileGrammarToken[] {
  return convertMobileIchiranSegments(
    sample.segments as Parameters<typeof convertMobileIchiranSegments>[0],
  );
}

describe("grammar token web parity", () => {
  test.each(samples.map((sample) => [sample.engine, sample.text, sample] as const))(
    "%s: %s has web's part-of-speech labels",
    (_engine, _text, sample) => {
      expect(mobileTokens(sample).map(posTree)).toEqual(
        convertIchiranToGrammarTokens(webTokens(sample.segments)).map(posTree),
      );
    },
  );

  test("もの Noun vs Particle is the kernel's entry choice, not the label mapping", () => {
    const mono = (engine: Sample["engine"]) =>
      mobileTokens(
        samples.find(
          (sample) =>
            sample.engine === engine && sample.text.startsWith("でも引き換えに"),
        )!,
      ).find((token) => token.word === "もの");
    // On-device picks 物 (JMdict 1502390, [n]); cloud picks the sentence-final
    // particle もの (2780660, [prt]). Both map their own [pos] tags faithfully.
    expect(mono("device")?.partOfSpeech).toBe("Noun");
    expect(mono("cloud")?.partOfSpeech).toBe("Particle");
  });
});
