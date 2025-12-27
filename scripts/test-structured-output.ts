/**
 * Test structured output for ai_metadata actions
 * Run: bun scripts/test-structured-output.ts
 */

import { GoogleGenAI, Type } from "@google/genai";

const GOOGLE_API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;
if (!GOOGLE_API_KEY) {
  throw new Error("GOOGLE_AI_STUDIO_API_KEY not set");
}

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
const MODEL = "gemini-3-flash-preview";

async function testFindChineseTitle(japaneseTitle: string, englishTitle?: string) {
  const titleHint = englishTitle 
    ? `Japanese: "${japaneseTitle}", English: "${englishTitle}"`
    : `Japanese: "${japaneseTitle}"`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Find the official Chinese title(s) of the manga ${titleHint}.

Search on:
- Bilibili Comics (哔哩哔哩漫画)
- Dongman Zhijia (动漫之家)
- Chinese Wikipedia

REQUIREMENTS:
- Return verbatim titles as they appear on official sources
- Do NOT translate yourself - only return titles found on actual websites
- Set found=false if no official Chinese title exists`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          found: { type: Type.BOOLEAN, description: "Whether any Chinese title was found" },
          simplified: { type: Type.STRING, description: "Simplified Chinese title", nullable: true },
          traditional: { type: Type.STRING, description: "Traditional Chinese title", nullable: true },
        },
        required: ["found"],
      },
    },
  });

  console.log("Raw response:", response.text);
  const result = JSON.parse(response.text ?? "{}");
  return result;
}

async function main() {
  console.log("Testing structured output with Google Search grounding\n");

  const testCases = [
    { japanese: "SPY×FAMILY", english: "Spy x Family" },
    { japanese: "チェンソーマン", english: "Chainsaw Man" },
  ];

  for (const { japanese, english } of testCases) {
    console.log(`\n📖 ${japanese} (${english})`);
    try {
      const result = await testFindChineseTitle(japanese, english);
      console.log("Parsed result:", result);
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  }
}

main().catch(console.error);

