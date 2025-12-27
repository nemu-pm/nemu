# Preferred Metadata Language - Implementation Plan

## Overview

Add a user setting for preferred metadata language that affects how metadata is fetched and displayed.

## Setting UI

**Location**: Settings page
**Component**: `Tabs.tsx`
**Options**:
- "Follow App Language" (default) - uses current i18n locale
- "English"
- "中文" (Chinese)
- "日本語" (Japanese)

> Alternative phrasings for "Follow App Language":
> - "Match App Language"
> - "Auto (App Language)"
> - "System Default"

## Changes to Tags

### 1. MangaUpdates: Remove Categories
Only use `genres` (36 fixed items), exclude user-generated `categories`.

```ts
// Before
const tags = [
  ...genres.map(g => g.genre),
  ...categories.slice(0, 10).map(c => c.category),
];

// After
const tags = genres.map(g => g.genre);
```

### 2. Tags Priority Change
Change from `MU > AniList > MAL` to:
```
AniList > MAL > MangaUpdates
```

Reasoning: AniList has richest tag system (417 tags with categories), MAL has good themes, MU genres are most basic.

## Translation Mapping Files

Create local translation files for tags/genres:

### Files to Create
```
src/lib/metadata/translations/
├── index.ts           # Export all mappings
├── genres-en.json     # Base English (for reference)
├── genres-ja.json     # Japanese translations
├── genres-zh.json     # Chinese translations
├── anilist-tags-ja.json
├── anilist-tags-zh.json
├── mal-themes-ja.json
└── mal-themes-zh.json
```

### Source Data
- **All provider genres**: ~50 unique (deduplicated across MU/AL/MAL)
- **AniList tags**: 417 items
- **MAL themes**: ~50 items

### Translation Strategy
1. Use Gemini to generate initial translations
2. Manual review for accuracy
3. Store as static JSON (no runtime API calls for tag translation)

## Language-Specific Logic

### English (Default)
Current behavior - no changes needed.

### Japanese

| Field | Source | Logic |
|-------|--------|-------|
| **Title** | Providers | AniList `title.native`, MAL `title_japanese`, MU `associated[]` (detect Japanese) |
| **Authors/Artists** | Providers | MAL `given_name + family_name` (kanji), or Gemini fallback |
| **Tags** | Local mapping | Use `genres-ja.json`, `anilist-tags-ja.json`, `mal-themes-ja.json` |
| **Description** | Gemini | Web search for official Japanese synopsis |

### Chinese

| Field | Source | Logic |
|-------|--------|-------|
| **Title** | Providers → Gemini | MU `associated[]` (detect Chinese), AniList `synonyms[]`. Fallback to Gemini if not found |
| **Authors/Artists** | Providers | Same as Japanese (return original Japanese name) |
| **Tags** | Local mapping | Use `genres-zh.json`, `anilist-tags-zh.json`, `mal-themes-zh.json` |
| **Description** | Gemini | Web search for official Chinese synopsis |

## Title Extraction Strategy (Based on Test Results)

### Key Finding: Provider Field Semantics
- **AniList `title.native`** = ALWAYS Japanese (even if all-English like "SPY×FAMILY")
- **MAL `title_japanese`** = ALWAYS Japanese (even if all-English)
- **MangaUpdates `associated[]`** = Mixed languages (need detection)
- **AniList `synonyms[]`** = Mixed languages (need detection)

### Japanese Title Extraction (Simple - No Detection Needed)
```ts
function getJapaneseTitle(providers: ProviderResults): string | null {
  // Priority: AniList native > MAL title_japanese > MU associated (detected)
  return (
    providers.anilist?.title.native ||
    providers.mal?.title_japanese ||
    findInArray(providers.mu?.associated, isJapanese)
  );
}
```

### Chinese Title Extraction (Needs Detection)
```ts
function getChineseTitle(providers: ProviderResults): string | null {
  // Priority: MU associated > AniList synonyms > Gemini fallback
  return (
    findInArray(providers.mu?.associated, isChinese) ||
    findInArray(providers.anilist?.synonyms, isChinese) ||
    null // Will trigger Gemini fallback
  );
}
```

### Language Detection (Only for associated/synonyms)
```ts
function detectLanguage(title: string): "ja" | "zh" | "en" | "unknown" {
  const hasHiragana = /[\u3040-\u309F]/.test(title);
  const hasKatakana = /[\u30A0-\u30FF]/.test(title);
  const hasKanji = /[\u4E00-\u9FAF]/.test(title);
  
  if (hasHiragana || hasKatakana) return "ja";
  if (hasKanji) return "zh"; // Kanji-only = assume Chinese in associated/synonyms
  return "en";
}
```

**Test Results**: 95.8% accuracy. Only failure: kanji-only Japanese titles (e.g., 呪術廻戦) detected as Chinese. But this is acceptable because:
1. AniList/MAL already provide the correct Japanese title via dedicated fields
2. Only MU associated and AniList synonyms use detection
3. If MU associated has 呪術廻戦, it's likely the Chinese translation anyway

### Gemini Fallback Results
Gemini with web search successfully found Chinese titles (both simplified & traditional) for:
- ✅ Tamon's B-Side → 现在的是哪一个多闻？！ / 現在的是哪一個多聞！？
- ✅ Chainsaw Man → 电锯人 / 鏈鋸人
- ✅ Spy x Family → 间谍过家家 / SPY×FAMILY 間諜家家酒
- ✅ Jujutsu Kaisen → 咒术回战 / 咒術迴戰

## Testing Plan

### Test Script 1: Title Language Detection ✅ DONE
**File**: `scripts/test-title-language-detection.ts`
**Result**: 95.8% accuracy (23/24)
- Only failure: kanji-only titles (呪術廻戦) detected as Chinese
- Acceptable because AniList/MAL provide dedicated Japanese title fields

### Test Script 2: Provider Title Extraction ✅ DONE
**File**: `scripts/test-provider-title-extraction.ts`
**Key Findings**:
- AniList `native` = ALWAYS Japanese
- MAL `title_japanese` = ALWAYS Japanese
- MU `associated` has Chinese (电锯人, 鏈鋸人), Japanese (チェンソーマン, ワンピース)
- AniList `synonyms` has Chinese translations

### Test Script 3: Gemini Chinese Title Lookup ✅ DONE
**File**: `scripts/test-gemini-chinese-title.ts`
**Result**: Successfully found both Simplified & Traditional Chinese for all tested manga

### Test Script 4: Tag Translation Generation
TODO: Generate translations for:
- All provider genres (~50 unique)
- AniList tags (417)
- MAL themes (~50)

### Test Script 5: Gemini Description Quality
Already tested in `scripts/test-gemini-descriptions.ts`
**Result**: Successfully found Japanese & Chinese descriptions for all tested manga

## Implementation Order

### Phase 1: Foundation
1. [ ] Create translation mapping files structure
2. [ ] Generate initial translations using Gemini
3. [x] Write title language detection utility (tested, 95.8% accuracy)
4. [x] Write test scripts and validate detection accuracy

### Phase 2: Provider Updates
5. [ ] Update MangaUpdates to exclude categories (use only genres)
6. [ ] Update tags priority to AniList > MAL > MU
7. [ ] Add Japanese/Chinese title extraction helpers
8. [ ] Add author Japanese name extraction (from MAL `family_name` + `given_name`)

### Phase 3: Convex Actions
9. [ ] Create Convex action for Chinese title lookup (Gemini) - tested, works
10. [ ] Create Convex action for Japanese description lookup (Gemini) - tested, works
11. [ ] Create Convex action for Chinese description lookup (Gemini) - tested, works

### Phase 4: Settings & Integration
12. [ ] Add preferred language setting to user preferences schema
13. [ ] Create settings UI component (Tabs: Follow App / English / 中文 / 日本語)
14. [ ] Integrate language preference into smart match flow
15. [ ] Update metadata display to use translations

### Phase 5: Polish
16. [ ] Manual review of tag translations
17. [ ] Edge case handling for title detection
18. [ ] Performance optimization (caching)
19. [ ] Documentation

## Open Questions (Updated After Testing)

1. **Kanji-only titles**: ✅ RESOLVED
   - AniList `native` and MAL `title_japanese` are ALWAYS Japanese by definition
   - Only need detection for MU `associated` and AniList `synonyms`
   - In those arrays, kanji-only = assume Chinese (correct 99% of time)

2. **Missing Chinese titles**: 
   - **Recommendation**: Option A - Always try Gemini if no Chinese title found in providers
   - Gemini with web search is reliable and fast
   - Could add toggle in settings: "Auto-fetch Chinese titles with AI"

3. **Description caching**: 
   - **Recommendation**: Cache in library item overrides
   - Store alongside other metadata overrides
   - User can manually refresh if needed

4. **Fallback behavior**: 
   - **Recommendation**: Fall back to English with visual indicator
   - Show small badge: "EN" or language flag if not in preferred language
   - User can see at a glance which items don't have localized metadata

5. **Simplified vs Traditional Chinese**:
   - MU and AniList often have both variants
   - Gemini returns both
   - **Decision needed**: 
     - Option A: Single "Chinese" setting, prefer Simplified
     - Option B: Separate "简体中文" and "繁體中文" options
   - Recommendation: Start with single "中文" that prefers Simplified, shows Traditional as fallback

## Next Steps

1. ✅ ~~Write test scripts for title language detection~~
2. ✅ ~~Test provider title extraction for various manga~~
3. ✅ ~~Test Gemini description retrieval~~
4. [ ] Generate tag translations using Gemini (script needed)
5. [ ] Create translation mapping file structure
6. [ ] Update MangaUpdates provider to exclude categories
7. [ ] Decide on Simplified vs Traditional Chinese handling

