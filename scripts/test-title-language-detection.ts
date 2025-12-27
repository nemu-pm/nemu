/**
 * Test Script 1: Title Language Detection
 * 
 * Test detection accuracy for identifying Japanese vs Chinese vs English titles.
 * Run: bun scripts/test-title-language-detection.ts
 */

type Language = "ja" | "zh" | "en" | "unknown";

interface DetectionResult {
  hasHiragana: boolean;
  hasKatakana: boolean;
  hasKanji: boolean;
  hasLatin: boolean;
  detected: Language;
}

/**
 * Detect the likely language of a title
 */
function detectTitleLanguage(title: string): DetectionResult {
  const hasHiragana = /[\u3040-\u309F]/.test(title);
  const hasKatakana = /[\u30A0-\u30FF]/.test(title);
  const hasKanji = /[\u4E00-\u9FAF]/.test(title);
  const hasLatin = /[a-zA-Z]/.test(title);
  
  // Japanese: has hiragana OR katakana (unique to Japanese writing)
  // Even if mixed with kanji or Latin, hiragana/katakana indicates Japanese
  if (hasHiragana || hasKatakana) {
    return { hasHiragana, hasKatakana, hasKanji, hasLatin, detected: "ja" };
  }
  
  // Chinese: has kanji but NO hiragana/katakana
  // Note: This could still be a Japanese title written only in kanji
  if (hasKanji && !hasHiragana && !hasKatakana) {
    return { hasHiragana, hasKatakana, hasKanji, hasLatin, detected: "zh" };
  }
  
  // Latin only: Could be English title or romanized Japanese
  if (hasLatin && !hasKanji) {
    return { hasHiragana, hasKatakana, hasKanji, hasLatin, detected: "en" };
  }
  
  return { hasHiragana, hasKatakana, hasKanji, hasLatin, detected: "unknown" };
}

/**
 * More sophisticated detection using character patterns
 */
function detectTitleLanguageV2(title: string): DetectionResult & { confidence: "high" | "medium" | "low" } {
  const result = detectTitleLanguage(title);
  
  // High confidence: Has hiragana/katakana (definitely Japanese)
  if (result.hasHiragana || result.hasKatakana) {
    return { ...result, detected: "ja", confidence: "high" };
  }
  
  // Medium confidence: Kanji only
  if (result.hasKanji && !result.hasLatin) {
    // Check for Chinese-specific simplified characters
    // These characters don't exist in Japanese
    const hasSimplifiedChinese = /[这说对为么着国来时会学还经发动没问题]/.test(title);
    if (hasSimplifiedChinese) {
      return { ...result, detected: "zh", confidence: "high" };
    }
    
    // Check for Traditional Chinese patterns (less common in Japanese)
    const hasTraditionalChinese = /[這說對為麼國來時會學還經發動沒問題]/.test(title);
    if (hasTraditionalChinese) {
      return { ...result, detected: "zh", confidence: "medium" };
    }
    
    // Kanji-only without clear Chinese markers - could be either
    return { ...result, detected: "zh", confidence: "low" };
  }
  
  // Latin characters
  if (result.hasLatin) {
    // Mixed Latin + Kanji (like "HUNTER×HUNTER") - likely Japanese
    if (result.hasKanji) {
      return { ...result, detected: "ja", confidence: "medium" };
    }
    return { ...result, detected: "en", confidence: "medium" };
  }
  
  return { ...result, confidence: "low" };
}

// Test cases
const TEST_CASES: Array<{ title: string; expected: Language; note?: string }> = [
  // Clear Japanese (has hiragana/katakana)
  { title: "多聞くん今どっち！？", expected: "ja", note: "Has hiragana" },
  { title: "ワンピース", expected: "ja", note: "All katakana" },
  { title: "進撃の巨人", expected: "ja", note: "Kanji + hiragana" },
  { title: "鬼滅の刃", expected: "ja", note: "Kanji + hiragana" },
  { title: "チェンソーマン", expected: "ja", note: "All katakana" },
  { title: "SPY×FAMILY", expected: "en", note: "All English" },
  { title: "DEATH NOTE", expected: "en", note: "All English" },
  { title: "デスノート", expected: "ja", note: "Katakana" },
  { title: "呪術廻戦", expected: "ja", note: "All kanji - actually Japanese" },
  
  // Clear Chinese
  { title: "现在多闻君是哪一面", expected: "zh", note: "Simplified Chinese" },
  { title: "現在的是哪一個多聞！？", expected: "zh", note: "Traditional Chinese" },
  { title: "鬼滅之刃", expected: "zh", note: "Chinese translation (之 instead of の)" },
  { title: "进击的巨人", expected: "zh", note: "Simplified Chinese" },
  { title: "链锯人", expected: "zh", note: "Simplified Chinese" },
  
  // Ambiguous (Kanji only - could be Japanese or Chinese)
  { title: "火影忍者", expected: "zh", note: "Naruto Chinese - kanji only" },
  { title: "海賊王", expected: "zh", note: "One Piece Chinese - kanji only" },
  { title: "名探偵コナン", expected: "ja", note: "Has katakana" },
  { title: "名侦探柯南", expected: "zh", note: "Simplified Chinese" },
  
  // Edge cases
  { title: "NARUTO -ナルト-", expected: "ja", note: "Mixed English + katakana" },
  { title: "HUNTER×HUNTER", expected: "en", note: "All English despite being Japanese manga" },
  { title: "ONE PIECE", expected: "en", note: "All English Japanese title" },
  { title: "Dr.STONE", expected: "en", note: "English" },
  { title: "ドクターストーン", expected: "ja", note: "Katakana version" },
  { title: "Dr.石神千空", expected: "ja", note: "Mixed - harder to detect" },
];

async function main() {
  console.log("=".repeat(60));
  console.log("Title Language Detection Test");
  console.log("=".repeat(60));

  let correct = 0;
  let total = TEST_CASES.length;

  for (const { title, expected, note } of TEST_CASES) {
    const result = detectTitleLanguageV2(title);
    const isCorrect = result.detected === expected;
    
    if (isCorrect) correct++;
    
    const icon = isCorrect ? "✅" : "❌";
    console.log(`\n${icon} "${title}"`);
    console.log(`   Expected: ${expected}, Got: ${result.detected} (${result.confidence})`);
    if (note) console.log(`   Note: ${note}`);
    if (!isCorrect) {
      console.log(`   Chars: hiragana=${result.hasHiragana}, katakana=${result.hasKatakana}, kanji=${result.hasKanji}, latin=${result.hasLatin}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Accuracy: ${correct}/${total} (${((correct/total)*100).toFixed(1)}%)`);
  console.log("=".repeat(60));

  // Highlight problematic cases
  console.log("\n⚠️  Known Limitations:");
  console.log("1. Kanji-only titles (e.g., 呪術廻戦) detected as Chinese but are Japanese");
  console.log("2. All-English Japanese titles (e.g., HUNTER×HUNTER) detected as English");
  console.log("3. Need provider context to disambiguate kanji-only titles");
}

main().catch(console.error);

