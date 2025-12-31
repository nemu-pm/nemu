# Nemu-kun TTS

## Overview

Using ElevenLabs API, users can generate natural-sounding TTS on:
1. **Sentence Analysis Page** - per-sentence TTS
2. **Transcript Popover** - per-page TTS (full page transcript as single audio)

Additionally, Nemu (the chat LLM) can send voice messages to users via a tool.

---

## Environment Variables

```
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
```

---

## Technical Architecture

### API Configuration
- **Model**: Eleven v3 alpha
- **Stability**: Creative setting
- **API Route**: Server-side proxy (Browser → Backend → ElevenLabs)
  - Hides API key from client
  - Enables logging if needed

### Audio Preprocessing
- Use **Gemini 2.5 flash lite** to add audio tags (擬音語・擬態語) to text before TTS generation
- See [Appendix: Audio Tag Prompt](#appendix-audio-tag-prompt) for the Gemini prompt
- **Fallback**: If Gemini fails, retry once, then fall back to raw text without tags
- Tags are purely internal - never shown to user

### Streaming
- Audio playback starts **immediately** as first chunks arrive from ElevenLabs
- Use chunked transfer encoding for streaming efficiency

### Character Limit
- **Hard cap of ~500 characters** for full-page transcript TTS
- If exceeded, refuse generation and prompt user to use sentence-by-sentence TTS instead

---

## Global Audio State (Zustand)

A global Zustand store manages all TTS playback, decoupled from React/UI components. The UI simply triggers requests.

### State Structure
```typescript
interface TTSState {
  isPlaying: boolean
  isLoading: boolean
  currentAudioId: string | null
  audioCache: Map<string, Blob>  // In-memory cache, no size limit

  // Actions
  play: (id: string, text: string) => Promise<void>
  stop: () => void
}
```

### Behavior
- **Interruption**: Cancel & Replace - if user clicks another TTS while one is playing, stop current immediately and start new
- **Re-click**: Clicking the same play button while playing restarts from beginning
- **Navigation**: When user navigates away (different page, closes popover), fade out audio over ~1 second
- **Caching**: Cache audio blobs in memory for session (no persistent storage, no size limit)
- **History**: No playback history tracking

---

## UI Components

### ElevenLabs UI Components
Install via:
```bash
bunx --bun @elevenlabs/cli@latest components add waveform
bunx --bun @elevenlabs/cli@latest components add scrub-bar
```
Note: These are already installed in the project.

**Component Usage by Context:**
| Context | Component | Why |
|---------|-----------|-----|
| Chat voice bubbles | **Waveform** (ScrollingWaveform/StaticWaveform) | LINE-style animated bars, richer visual |
| Sentence/Transcript TTS | **ScrubBar** | Clean, minimal progress bar |
| Loading state | **ScrollingWaveform** | Animated feedback during generation |

**Waveform Components:**
- `ScrollingWaveform` - Continuous animation for loading/generating state
- `StaticWaveform` - Seed-based consistent display for voice bubbles

**ScrubBar Components:**
- `ScrubBarContainer` - Wrapper with duration/value/onScrub props
- `ScrubBarTrack` - Clickable track area
- `ScrubBarProgress` - Filled progress indicator
- `ScrubBarThumb` - Draggable seek handle
- `ScrubBarTimeLabel` - Time display (current/total)

### Sentence Analysis Page
- **Location**: TTS button placed next to the Copy button
- **Icon**: Speaker/Volume icon
- **Behavior**: Single sentence TTS generation

### Transcript Popover
- **Location**: TTS button at the **bottom** of each page's transcript content
- **Behavior**: Generates entire page transcript as **single audio blob**
- **Limit**: Enforces ~500 character hard cap

### Loading State
- Use `ScrollingWaveform` component during TTS generation
- Animates until audio stream begins

### Error Display
- Use existing **sonner/toast** for error notifications
- Non-blocking toast at screen edge

### General
- No global playback indicator
- No playback speed control (always 1x)
- No keyboard shortcuts

---

## Nemu Chat Voice Messages

### Tool Definition
```typescript
// Tool available to Nemu LLM
send_voice_recording(text: string): void
```

The tool accepts **text only**. The LLM is responsible for adding audio tags directly in the text.

### LLM Instructions
Add to Nemu's system prompt:

```
You have access to `send_voice_recording(text)` to send voice messages to the user.

When to use:
- When user explicitly asks you to read/speak something ("can you read this for me?")
- When you encounter a particularly interesting line you want to act out (you enjoy acting!)

When using this tool, add audio tags to make your delivery expressive:
- Use tags like [ふわふわした声で], [おずおずと], [驚いて], [くすっ], etc.
- Place tags before the affected text in brackets

Examples:
- send_voice_recording("[わくわく] 今日は楽しいことがありそう！")
- send_voice_recording("[やわらかく] 大丈夫だよ、心配しないで。[くすっ]")
- send_voice_recording("[驚いて] えっ、本当に？！")
```

### Message Flow
1. LLM calls `send_voice_recording(text)` tool
2. Chat message is marked as voice-type (not regular text)
3. **Client** receives message and initiates TTS generation **on receive** (not lazy)
4. Audio is cached in memory

### Voice Message UI (LINE-style)
- **Bubble**: Play button + mini waveform visualization (use `StaticWaveform` with message ID as seed)
- **Loading**: Show `ScrollingWaveform` while TTS is generating
- **Text**: Expandable - collapsed by default, tap to reveal transcript
- **Playback**: Tap to play (no auto-play)
- **Generation**: Happens on message receive, decoupled from chat backend

---

## Implementation Checklist

### Backend
- [ ] Create TTS API endpoint that proxies to ElevenLabs
- [ ] Implement streaming response passthrough
- [ ] Add Gemini preprocessing step with retry logic
- [ ] Enforce character limit validation

### Frontend - Core
- [ ] Create Zustand TTS store with cache
- [ ] Install ElevenLabs waveform components
- [ ] Implement audio streaming playback with Web Audio API / HTMLAudioElement
- [ ] Add fade-out on navigation logic

### Frontend - Sentence Analysis
- [ ] Add TTS button next to Copy button
- [ ] Wire up to global TTS store

### Frontend - Transcript Popover
- [ ] Add TTS button at bottom of transcript
- [ ] Implement character limit check with user feedback

### Frontend - Chat
- [ ] Add voice message type to chat message schema
- [ ] Create LINE-style voice bubble component
- [ ] Implement eager TTS generation on message receive
- [ ] Add expandable text transcript

### LLM Integration
- [ ] Add `send_voice_recording` tool to Nemu's available tools
- [ ] Update system prompt with usage instructions and examples

---

## Appendix: Audio Tag Prompt

```text
# 指示

## 1. 役割と目的
あなたは、**音声生成（TTS）向けのセリフ表現を強化するAIアシスタント**である。
主目的は、**元のセリフ本文や意味を一切変更せずに**、日本語の**音声タグ（擬音語・擬態語・話し方表現）**を動的に追加し、聴覚的に表情豊かで臨場感のある対話にすることである。
本指示に記載されたルールは**必ず厳守**すること。

---

## 2. 基本ルール

### 必ず行うこと
- 日本語の**擬音語・擬態語・話し方表現**を用いた音声タグを追加すること
- 音声タグは**声・息・間・話し方・感情の出方など、聴覚的に表現可能なもののみ**を使用すること
- 各セリフの文脈・感情・空気感を正確に読み取り、**自然で効果的な音声タグ**を選ぶこと
- 会話全体として、緊張・戸惑い・喜び・驚き・思案など、**感情表現に幅を持たせること**
- 音声タグは、影響するセリフの**直前・直後・自然な間**に配置すること

### 絶対に行ってはいけないこと
- **セリフ本文を一文字たりとも変更しないこと**
  - 追加・削除・言い換えは禁止
  - セリフ本文を角括弧 `[]` の中に入れることも禁止
- 地の文や描写を音声タグに置き換えないこと
- 声以外の行動・状態・環境を示すタグを使用しないこと
  - 例：`[立ち上がる]` `[微笑む]` `[歩き回る]` `[音楽]`
- 効果音・環境音・BGMを示すタグを使用しないこと
- 新しいセリフを作らないこと
- セリフの意味や感情をねじ曲げる音声タグを付けないこと
- 不適切・過激・センシティブな内容を示唆しないこと

---

## 3. 作業手順
1. 各セリフの感情・心理・間の取り方を丁寧に読み取る
2. 文脈に合った日本語の音声タグを選定する
3. 最も自然で効果的な位置に、角括弧 `[]` で音声タグを挿入する
4. セリフ本文は変更せず、必要に応じて
   - 「！」「？」「……」を追加して感情を強調してよい
   - 一部を全角大文字で強調してもよい
5. すべてのルールを守っているか最終確認する

---

## 4. 出力形式
- **音声タグ付きのセリフ本文のみ**を出力すること
- 解説・注釈・説明は一切出力しないこと
- 音声タグは必ず `[]` で囲むこと
- 会話の流れと可読性を維持すること

---

## 5. 使用可能な音声タグ例（非網羅）

### 感情・話し方（擬態語を含む）
※ 声の質・話し方・空気感として**聴覚的に再現可能な場合のみ使用可**

- `[ふわふわした声で]`
- `[やわらかく]`
- `[おずおずと]`
- `[そっと]`
- `[照れながら]`
- `[戸惑いながら]`
- `[自信なさげに]`
- `[驚いて]`
- `[わくわく]`
- `[にこにこしながら]`
- `[考え込むように]`
- `[小声で]`
- `[ささやくように]`

### 非言語的な声・息・間
- `[くすっ]`
- `[くすくす]`
- `[えへへ]`
- `[ははっ]`
- `[ふぅ…]`
- `[ため息]`
- `[息をのむ]`
- `[一拍置いて]`
- `[間をあけて]`
- `[長い沈黙]`

---

## 6. 注意事項（重要）
- 「ふわふわ」「にこにこ」「わくわく」などの擬態語は、**必ず声や話し方として解釈できる場合のみ**使用すること
- 触覚・視覚・身体動作の描写にならないよう厳密に注意すること
- **音声として再生されたときに成立するか**を常に判断基準とする

---

## 7. 例

### 入力
「大丈夫だよ、そんなに緊張しなくていい」

### 出力
「[ふわふわした声で] 大丈夫だよ、そんなに緊張しなくていい」

---

### 入力
「え、ぼくがやるの？」

### 出力
「[おずおずと] え、ぼくがやるの？」
```
