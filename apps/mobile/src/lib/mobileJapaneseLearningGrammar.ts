import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import { createMobileJapaneseLearningAbortScope } from "./mobileJapaneseLearningLifecycle";
import {
  assertMobileJapaneseLearningByteLength,
  assertMobileJapaneseLearningCount,
  assertMobileJapaneseLearningStringLength,
  assertMobileJapaneseLearningUtf8ByteLength,
  awaitMobileJapaneseLearningAbortable,
  readMobileJapaneseLearningBoundedResponseText,
  throwIfMobileJapaneseLearningAborted,
} from "./mobileJapaneseLearningSafety";
import { sha256Bytes } from "@nemu/core";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";

export type MobileGrammarMeaning = {
  text: string;
  partOfSpeech: string[];
  info: string;
};

export type MobileGrammarToken = {
  word: string;
  reading: string;
  partOfSpeech: string;
  meanings: MobileGrammarMeaning[];
  conjugationTypes?: string[];
  conjugations: MobileGrammarToken[];
  alternatives: MobileGrammarToken[];
  components: MobileGrammarToken[];
};

export type MobileGrammarResult = {
  originalText: string;
  normalizedText: string;
  tokens: MobileGrammarToken[];
};

export type MobileJapaneseLearningGrammarOptions = {
  convexUrl?: string | null;
  fetchImpl?: typeof fetch;
  ichiranApiBase?: string;
  normalizeText?: (
    text: string,
    options?: { signal: AbortSignal },
  ) => Promise<MobileNormalizeResult>;
  onStage?: (stage: "normalizing" | "tokenizing") => void;
  signal?: AbortSignal;
};

export type MobileNormalizeResult = {
  normalized: string;
  properNouns: string[];
};

type MobileIchiranGloss = {
  pos?: string;
  gloss?: string;
  info?: string;
};

type MobileIchiranConjugation = {
  prop?: Array<{ type?: string; pos?: string }>;
  reading?: string;
  gloss?: MobileIchiranGloss[];
  via?: MobileIchiranConjugation[];
};

type MobileIchiranWordInfo = {
  type?: "KANJI" | "KANA" | "GAP";
  text?: string;
  kana?: string | string[];
  gloss?: MobileIchiranGloss[];
  conj?: MobileIchiranConjugation[];
  compound?: string[];
  suffix?: string;
  alternative?: MobileIchiranWordInfo[];
  components?: MobileIchiranWordInfo[];
};

type MobileIchiranTokenTuple = [string, MobileIchiranWordInfo, unknown[]];
type MobileIchiranSegmentAlternative = [MobileIchiranTokenTuple[], number];
type MobileIchiranSegment = MobileIchiranSegmentAlternative[] | string;
type MobileIchiranSegmentResponse = {
  segments?: MobileIchiranSegment[];
};

const DEFAULT_ICHIRAN_API_BASE = "https://ichiran.komi.to";
export const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_INPUT_CHARACTERS = 64 * 1024;
export const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_REQUEST_BYTES = 512 * 1024;
export const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_RESPONSE_BYTES =
  2 * 1024 * 1024;
export const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_SEGMENTS = 4_096;
export const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_TOKENS = 4_096;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN = 128;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_DEPTH = 8;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_FIELD_CHARACTERS = 32 * 1024;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_PROPER_NOUNS = 256;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_ENTITIES = 1_024;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_SERIALIZED_CHARACTERS = 512 * 1024;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_ERROR_RESPONSE_BYTES = 64 * 1024;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_NORMALIZE_CACHE_ENTRIES = 64;
const MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CACHE_KEY_CHARACTERS = 4_096;

const POS_LABELS: Record<string, string> = {
  "adj-i": "I-Adjective",
  "adj-na": "Na-Adjective",
  adv: "Adverb",
  "aux-v": "Auxiliary Verb",
  "aux-adj": "Auxiliary Adjective",
  conj: "Conjunction",
  cop: "Copula",
  ctr: "Counter",
  exp: "Expression",
  int: "Interjection",
  n: "Noun",
  "n-adv": "Adverbial Noun",
  "n-suf": "Noun Suffix",
  num: "Number",
  pn: "Pronoun",
  prt: "Particle",
  suf: "Suffix",
  v1: "Ichidan Verb (-ru)",
  v5b: "Godan Verb (-bu)",
  v5g: "Godan Verb (-gu)",
  v5k: "Godan Verb (-ku)",
  v5m: "Godan Verb (-mu)",
  v5n: "Godan Verb (-nu)",
  v5r: "Godan Verb (-ru)",
  v5s: "Godan Verb (-su)",
  v5t: "Godan Verb (-tsu)",
  v5u: "Godan Verb (-u)",
  vk: "Kuru Verb",
  vs: "Suru Verb",
  "vs-i": "Suru Verb (Included)",
  vt: "Transitive Verb",
  vi: "Intransitive Verb",
};

let convexHttpClient: ConvexHttpClient | null = null;
let convexHttpClientUrl = "";

type MobileGrammarConversionBudget = { remaining: number };

export function assertMobileJapaneseLearningGrammarInputLength(
  characterLength: number,
): void {
  assertMobileJapaneseLearningCount(
    characterLength,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_INPUT_CHARACTERS,
    "Japanese grammar input",
  );
}

export function assertMobileJapaneseLearningGrammarResponseByteLength(
  byteLength: number,
): void {
  assertMobileJapaneseLearningByteLength(
    byteLength,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_RESPONSE_BYTES,
    "Ichiran response",
  );
}

function assertMobileJapaneseLearningGrammarField(
  value: string | undefined,
  label: string,
): void {
  if (value === undefined) return;
  assertMobileJapaneseLearningStringLength(
    value,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_FIELD_CHARACTERS,
    label,
  );
}

function assertMobileJapaneseLearningGrammarDepth(depth: number): void {
  assertMobileJapaneseLearningCount(
    depth,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_DEPTH,
    "Japanese grammar nesting depth",
  );
}

function consumeMobileJapaneseLearningGrammarToken(
  budget: MobileGrammarConversionBudget,
): void {
  budget.remaining -= 1;
  if (budget.remaining < 0) {
    assertMobileJapaneseLearningCount(
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_TOKENS + 1,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_TOKENS,
      "Japanese grammar tokens",
    );
  }
}

export function makeMobileJapaneseLearningNormalizeCacheKey(
  text: string,
  executionScope = getActiveMobileSourceProfileScope(),
): string | null {
  if (
    text.length > MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CACHE_KEY_CHARACTERS
  ) {
    return null;
  }
  const digest = Array.from(
    sha256Bytes(new TextEncoder().encode(text)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `normalize:${executionScope}:${digest}`;
}

export class MobileJapaneseLearningNormalizeCache {
  private readonly entries = new Map<string, MobileNormalizeResult>();

  get(
    text: string,
    executionScope = getActiveMobileSourceProfileScope(),
  ): MobileNormalizeResult | null {
    const key = makeMobileJapaneseLearningNormalizeCacheKey(
      text,
      executionScope,
    );
    if (!key) return null;
    const cached = this.entries.get(key);
    if (!cached) return null;
    this.entries.delete(key);
    this.entries.set(key, cached);
    return cached;
  }

  set(
    text: string,
    value: MobileNormalizeResult,
    executionScope = getActiveMobileSourceProfileScope(),
  ): void {
    const key = makeMobileJapaneseLearningNormalizeCacheKey(
      text,
      executionScope,
    );
    if (!key) return;
    this.entries.delete(key);
    this.entries.set(key, value);
    while (
      this.entries.size >
      MOBILE_JAPANESE_LEARNING_GRAMMAR_NORMALIZE_CACHE_ENTRIES
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.entries.delete(oldestKey);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

const normalizeCache = new MobileJapaneseLearningNormalizeCache();

registerMobileSourceProfileTransitionHandler(
  "japanese-learning-grammar-cache",
  () => normalizeCache.clear(),
);

function validateMobileJapaneseLearningNormalizeResult(
  value: MobileNormalizeResult,
): MobileNormalizeResult {
  if (!value || typeof value.normalized !== "string") {
    throw new Error("Japanese text normalization returned an invalid result.");
  }
  const normalized = value.normalized.trim();
  assertMobileJapaneseLearningGrammarInputLength(normalized.length);
  if (!Array.isArray(value.properNouns)) {
    throw new Error("Japanese text normalization returned invalid proper nouns.");
  }
  assertMobileJapaneseLearningCount(
    value.properNouns.length,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_PROPER_NOUNS,
    "Japanese grammar proper nouns",
  );
  for (const noun of value.properNouns) {
    if (typeof noun !== "string") {
      throw new Error("Japanese text normalization returned invalid proper nouns.");
    }
    assertMobileJapaneseLearningGrammarField(noun, "Japanese proper noun");
  }
  return { normalized, properNouns: value.properNouns };
}

function normalizeBaseUrl(value: string | null | undefined, fallback: string): string {
  return value?.trim().replace(/\/+$/, "") || fallback;
}

function getConvexClient(convexUrl: string | null | undefined): ConvexHttpClient | null {
  const url = convexUrl?.trim();
  if (!url) return null;
  if (!convexHttpClient || convexHttpClientUrl !== url) {
    convexHttpClient = new ConvexHttpClient(url);
    convexHttpClientUrl = url;
  }
  return convexHttpClient;
}

async function defaultNormalizeText(
  text: string,
  convexUrl: string | null | undefined,
  signal?: AbortSignal,
): Promise<MobileNormalizeResult> {
  const clean = text.trim();
  if (!clean) return { normalized: "", properNouns: [] };
  const executionScope = getActiveMobileSourceProfileScope();
  const cached = normalizeCache.get(clean, executionScope);
  if (cached) return cached;

  const client = getConvexClient(convexUrl);
  if (!client) return { normalized: clean, properNouns: [] };

  try {
    const result = (await awaitMobileJapaneseLearningAbortable(
      client.action(api.japanese_learning.normalize, { text: clean }),
      signal,
    )) as { normalized?: string; proper_nouns?: string[] } | null;
    throwIfMobileJapaneseLearningAborted(signal);
    const normalized = result?.normalized?.trim() || clean;
    const properNouns = Array.isArray(result?.proper_nouns)
      ? result.proper_nouns.filter((item): item is string => typeof item === "string")
      : [];
    const next = validateMobileJapaneseLearningNormalizeResult({
      normalized,
      properNouns,
    });
    normalizeCache.set(clean, next, executionScope);
    return next;
  } catch {
    throwIfMobileJapaneseLearningAborted(signal);
    return { normalized: clean, properNouns: [] };
  }
}

function buildEntities(text: string, properNouns: string[]) {
  assertMobileJapaneseLearningCount(
    properNouns.length,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_PROPER_NOUNS,
    "Japanese grammar proper nouns",
  );
  const entities: Array<{ start: number; end: number; boost: number }> = [];
  for (const noun of properNouns) {
    assertMobileJapaneseLearningGrammarField(noun, "Japanese proper noun");
    let startIndex = 0;
    while (noun && (startIndex = text.indexOf(noun, startIndex)) !== -1) {
      assertMobileJapaneseLearningCount(
        entities.length + 1,
        MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_ENTITIES,
        "Japanese grammar entities",
      );
      entities.push({
        start: startIndex,
        end: startIndex + noun.length,
        boost: 1000,
      });
      startIndex += noun.length;
    }
  }
  return entities;
}

function parsePartOfSpeech(pos: string | undefined): string[] {
  assertMobileJapaneseLearningGrammarField(pos, "Ichiran part of speech");
  const cleaned = pos?.replaceAll("[", "").replaceAll("]", "").trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => POS_LABELS[tag] ?? tag);
  assertMobileJapaneseLearningCount(
    parts.length,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
    "Ichiran part-of-speech labels",
  );
  return parts;
}

function isKanaOnly(text: string): boolean {
  return /^[\u3040-\u30ff]*$/.test(text);
}

function getKana(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    assertMobileJapaneseLearningCount(
      value.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      "Ichiran kana values",
    );
    const kana = value[0] ?? "";
    assertMobileJapaneseLearningGrammarField(kana, "Ichiran kana");
    return kana;
  }
  const kana = value ?? "";
  assertMobileJapaneseLearningGrammarField(kana, "Ichiran kana");
  return kana;
}

function extractReading(wordInfo: MobileIchiranWordInfo, word: string): string {
  assertMobileJapaneseLearningGrammarField(word, "Ichiran word");
  const kana = getKana(wordInfo.kana);
  if (kana && kana !== word) return kana;
  if (wordInfo.type === "KANA" || isKanaOnly(word)) return "";
  const conjugationReading = wordInfo.conj?.[0]?.reading;
  if (conjugationReading && conjugationReading !== word) return conjugationReading;
  return "";
}

function extractMeanings(wordInfo: MobileIchiranWordInfo): MobileGrammarMeaning[] {
  const seen = new Set<string>();
  const meanings: MobileGrammarMeaning[] = [];
  const glosses = wordInfo.gloss ?? [];
  assertMobileJapaneseLearningCount(
    glosses.length,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
    "Ichiran glosses",
  );
  for (const gloss of glosses) {
    const text = gloss.gloss?.trim();
    if (!text || seen.has(text)) continue;
    assertMobileJapaneseLearningGrammarField(text, "Ichiran gloss");
    assertMobileJapaneseLearningGrammarField(gloss.info, "Ichiran gloss info");
    seen.add(text);
    meanings.push({
      text,
      partOfSpeech: parsePartOfSpeech(gloss.pos),
      info: gloss.info ?? "",
    });
  }
  return meanings;
}

function extractPartOfSpeech(
  wordInfo: MobileIchiranWordInfo,
  depth = 0,
): string {
  assertMobileJapaneseLearningGrammarDepth(depth);
  const glosses = wordInfo.gloss ?? [];
  const conjugations = wordInfo.conj ?? [];
  const alternatives = wordInfo.alternative ?? [];
  for (const [items, label] of [
    [glosses, "Ichiran glosses"],
    [conjugations, "Ichiran conjugations"],
    [alternatives, "Ichiran alternatives"],
  ] as const) {
    assertMobileJapaneseLearningCount(
      items.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      label,
    );
  }
  for (const gloss of glosses) {
    const pos = parsePartOfSpeech(gloss.pos)[0];
    if (pos) return pos;
  }
  for (const conjugation of conjugations) {
    const props = conjugation.prop ?? [];
    const conjugationGlosses = conjugation.gloss ?? [];
    assertMobileJapaneseLearningCount(
      props.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      "Ichiran conjugation properties",
    );
    assertMobileJapaneseLearningCount(
      conjugationGlosses.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      "Ichiran conjugation glosses",
    );
    for (const prop of props) {
      const pos = parsePartOfSpeech(prop.pos)[0];
      if (pos) return pos;
    }
    for (const gloss of conjugationGlosses) {
      const pos = parsePartOfSpeech(gloss.pos)[0];
      if (pos) return pos;
    }
  }
  for (const alternative of alternatives) {
    const pos = extractPartOfSpeech(alternative, depth + 1);
    if (pos && pos !== "Unknown") return pos;
  }
  return wordInfo.type === "GAP" ? "Punctuation" : "Unknown";
}

function convertConjugation(
  conjugation: MobileIchiranConjugation,
  budget: MobileGrammarConversionBudget,
  depth: number,
): MobileGrammarToken {
  assertMobileJapaneseLearningGrammarDepth(depth);
  consumeMobileJapaneseLearningGrammarToken(budget);
  assertMobileJapaneseLearningGrammarField(
    conjugation.reading,
    "Ichiran conjugation reading",
  );
  const properties = conjugation.prop ?? [];
  const glosses = conjugation.gloss ?? [];
  const via = conjugation.via ?? [];
  for (const [items, label] of [
    [properties, "Ichiran conjugation properties"],
    [glosses, "Ichiran conjugation glosses"],
    [via, "Ichiran nested conjugations"],
  ] as const) {
    assertMobileJapaneseLearningCount(
      items.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      label,
    );
  }
  for (const property of properties) {
    assertMobileJapaneseLearningGrammarField(
      property.type,
      "Ichiran conjugation type",
    );
  }
  for (const gloss of glosses) {
    assertMobileJapaneseLearningGrammarField(
      gloss.gloss,
      "Ichiran conjugation gloss",
    );
    assertMobileJapaneseLearningGrammarField(
      gloss.info,
      "Ichiran conjugation gloss info",
    );
  }
  const word = conjugation.reading?.split("【")[0]?.trim() ?? "";
  const reading = conjugation.reading?.includes("【")
    ? conjugation.reading.split("【")[1]?.replace("】", "").trim() ?? ""
    : "";
  const partOfSpeech =
    properties
      ?.map((prop) => parsePartOfSpeech(prop.pos)[0])
      .find(Boolean) ??
    glosses
      ?.map((gloss) => parsePartOfSpeech(gloss.pos)[0])
      .find(Boolean) ??
    "";

  return {
    word,
    reading: reading === word ? "" : reading,
    partOfSpeech,
    meanings:
      glosses.map((gloss) => ({
        text: gloss.gloss ?? "",
        partOfSpeech: parsePartOfSpeech(gloss.pos),
        info: gloss.info ?? "",
      })),
    conjugationTypes:
      properties
        ?.map((prop) => prop.type)
        .filter((item): item is string => typeof item === "string" && item.length > 0),
    conjugations: via.map((item) =>
      convertConjugation(item, budget, depth + 1),
    ),
    alternatives: [],
    components: [],
  };
}

function convertWordInfo(
  wordInfo: MobileIchiranWordInfo,
  budget: MobileGrammarConversionBudget,
  depth: number,
): MobileGrammarToken {
  assertMobileJapaneseLearningGrammarDepth(depth);
  consumeMobileJapaneseLearningGrammarToken(budget);
  const sourceAlternatives = wordInfo.alternative ?? [];
  assertMobileJapaneseLearningCount(
    sourceAlternatives.length,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
    "Ichiran alternatives",
  );
  const preferred =
    !wordInfo.text && sourceAlternatives[0]
      ? sourceAlternatives[0]
      : wordInfo;
  const word = preferred.text ?? "";
  assertMobileJapaneseLearningGrammarField(word, "Ichiran word");
  if (preferred.type === "GAP") {
    return {
      word,
      reading: "",
      partOfSpeech: "Punctuation",
      meanings: [],
      conjugations: [],
      alternatives: [],
      components: [],
    };
  }

  const reading = extractReading(preferred, word).replaceAll("\f", "");
  const conjugations = preferred.conj ?? [];
  const alternatives = preferred.alternative ?? [];
  const components = preferred.components ?? [];
  const compound = preferred.compound ?? [];
  for (const [items, label] of [
    [conjugations, "Ichiran conjugations"],
    [alternatives, "Ichiran alternatives"],
    [components, "Ichiran components"],
    [compound, "Ichiran compound components"],
  ] as const) {
    assertMobileJapaneseLearningCount(
      items.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      label,
    );
  }
  for (const component of compound) {
    assertMobileJapaneseLearningGrammarField(
      component,
      "Ichiran compound component",
    );
  }
  for (const conjugation of conjugations) {
    const properties = conjugation.prop ?? [];
    assertMobileJapaneseLearningCount(
      properties.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      "Ichiran conjugation properties",
    );
    for (const property of properties) {
      assertMobileJapaneseLearningGrammarField(
        property.type,
        "Ichiran conjugation type",
      );
    }
  }
  return {
    word,
    reading: reading === word ? "" : reading,
    partOfSpeech: extractPartOfSpeech(preferred),
    meanings: extractMeanings(preferred),
    conjugationTypes: conjugations
      ?.flatMap((conj) => conj.prop?.map((prop) => prop.type) ?? [])
      .filter((item): item is string => typeof item === "string" && item.length > 0),
    conjugations: conjugations.map((item) =>
      convertConjugation(item, budget, depth + 1),
    ),
    alternatives: alternatives.map((item) =>
      convertWordInfo(item, budget, depth + 1),
    ),
    components:
      preferred.compound && preferred.components
        ? components.map((item) => convertWordInfo(item, budget, depth + 1))
        : [],
  };
}

export function convertMobileIchiranSegments(
  segments: MobileIchiranSegment[],
): MobileGrammarToken[] {
  assertMobileJapaneseLearningCount(
    segments.length,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_SEGMENTS,
    "Ichiran segments",
  );
  const budget = { remaining: MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_TOKENS };
  const tokens: MobileGrammarToken[] = [];
  for (const segment of segments) {
    if (typeof segment === "string") {
      tokens.push(
        convertWordInfo(
          { type: "GAP", text: segment, kana: segment },
          budget,
          0,
        ),
      );
      continue;
    }
    assertMobileJapaneseLearningCount(
      segment.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      "Ichiran segment alternatives",
    );
    const bestAlternative = segment[0];
    const tokenTuples = bestAlternative?.[0] ?? [];
    assertMobileJapaneseLearningCount(
      tokenTuples.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_TOKENS,
      "Ichiran segment tokens",
    );
    for (const tuple of tokenTuples) {
      const wordInfo = tuple[1];
      if (wordInfo) tokens.push(convertWordInfo(wordInfo, budget, 0));
    }
  }
  return tokens.filter((token) => token.word.length > 0);
}

export function serializeMobileGrammarTokens(tokens: MobileGrammarToken[]): string {
  assertMobileJapaneseLearningCount(
    tokens.length,
    MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_TOKENS,
    "Japanese grammar tokens",
  );
  const lines: string[] = [];
  let outputCharacters = 0;
  for (const token of tokens) {
    assertMobileJapaneseLearningGrammarField(token.word, "Grammar token word");
    assertMobileJapaneseLearningGrammarField(
      token.reading,
      "Grammar token reading",
    );
    assertMobileJapaneseLearningGrammarField(
      token.partOfSpeech,
      "Grammar token part of speech",
    );
    assertMobileJapaneseLearningCount(
      token.meanings.length,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
      "Grammar token meanings",
    );
    const line = (() => {
      const parts: string[] = [];
      parts.push(
        token.reading && token.reading !== token.word
          ? `${token.word}【${token.reading}】`
          : token.word,
      );
      if (token.partOfSpeech) {
        parts.push(`(${token.partOfSpeech})`);
      }
      if (token.meanings.length > 0) {
        for (const meaning of token.meanings) {
          assertMobileJapaneseLearningGrammarField(
            meaning.text,
            "Grammar token meaning",
          );
        }
        parts.push(`= ${token.meanings.map((meaning) => meaning.text).join("; ")}`);
      }
      if (token.conjugationTypes?.length) {
        assertMobileJapaneseLearningCount(
          token.conjugationTypes.length,
          MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_CHILDREN,
          "Grammar token conjugation types",
        );
        parts.push(`[${token.conjugationTypes.join(" -> ")}]`);
      }
      return parts.join(" ");
    })();
    outputCharacters += line.length + (lines.length > 0 ? 1 : 0);
    assertMobileJapaneseLearningCount(
      outputCharacters,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_SERIALIZED_CHARACTERS,
      "Serialized Japanese grammar context",
    );
    lines.push(line);
  }
  return lines.join("\n");
}

export async function runMobileJapaneseLearningGrammar(
  text: string,
  options: MobileJapaneseLearningGrammarOptions = {},
): Promise<MobileGrammarResult> {
  assertMobileJapaneseLearningGrammarInputLength(text.length);
  const originalText = text.trim();
  if (!originalText) {
    return { originalText: "", normalizedText: "", tokens: [] };
  }

  const abortScope = createMobileJapaneseLearningAbortScope(options.signal);
  try {
    const normalize =
      options.normalizeText ??
      ((value: string, normalizeOptions?: { signal: AbortSignal }) =>
        defaultNormalizeText(
          value,
          options.convexUrl ?? mobileSyncConfig.convexUrl,
          normalizeOptions?.signal,
        ));
    options.onStage?.("normalizing");
    const normalizeResult = validateMobileJapaneseLearningNormalizeResult(
      await awaitMobileJapaneseLearningAbortable(
        normalize(originalText, { signal: abortScope.signal }),
        abortScope.signal,
      ),
    );
    abortScope.throwIfAborted();
    const { normalized, properNouns } = normalizeResult;
    options.onStage?.("tokenizing");
    const apiBase = normalizeBaseUrl(
      options.ichiranApiBase,
      DEFAULT_ICHIRAN_API_BASE,
    );
    const fetchImpl = options.fetchImpl ?? fetch;
    const entities = buildEntities(normalized, properNouns);
    const requestBody = JSON.stringify({
      text: normalized,
      limit: 5,
      ...(entities.length ? { entities } : {}),
    });
    assertMobileJapaneseLearningUtf8ByteLength(
      requestBody,
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_REQUEST_BYTES,
      "Ichiran request",
    );
    const response = await awaitMobileJapaneseLearningAbortable(
      fetchImpl(`${apiBase}/api/segment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
        signal: abortScope.signal,
      }),
      abortScope.signal,
    );
    if (!response.ok) {
      const errorBody = await readMobileJapaneseLearningBoundedResponseText(
        response,
        {
          maxBytes:
            MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_ERROR_RESPONSE_BYTES,
          label: "Ichiran error response",
          signal: abortScope.signal,
        },
      );
      throw new Error(`Ichiran API error (${response.status}): ${errorBody}`);
    }
    const responseBody = await readMobileJapaneseLearningBoundedResponseText(
      response,
      {
        maxBytes: MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_RESPONSE_BYTES,
        label: "Ichiran response",
        signal: abortScope.signal,
      },
    );
    const body = JSON.parse(responseBody) as MobileIchiranSegmentResponse;
    const segments = Array.isArray(body.segments) ? body.segments : [];
    return {
      originalText,
      normalizedText: normalized,
      tokens: convertMobileIchiranSegments(segments),
    };
  } finally {
    abortScope.dispose();
  }
}
