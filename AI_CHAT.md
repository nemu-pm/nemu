# Nemu-kun AI Japanese Learning Chat

## Overview

A LINE-style chat interface where users can ask the app mascot "nemu-kun" for help understanding Japanese while reading manga. Nemu-kun is a magical school student who genuinely enjoys teaching - straightforward and helpful without fake cuteness or anime verbal tics.

## Core Concepts

### Character: Nemu-kun
- **Visual**: Blue/silver-haired bookish character with floating winged books (see `portrait.png`, `icon.png`)
- **Personality**: Straightforward, genuinely helpful, enjoys teaching. A magical school student who's naturally good at explaining things. No fake cuteness, no "ne~" or performative anime speech patterns.
- **Language**: Responds in the app's current language + Japanese. **Never uses romaji** - can use furigana or break down kanji, but romanization is forbidden.
- **Guardrails**: None. If user asks off-topic questions, nemu can answer - user experience over strict boundaries.

### Session Scope
- Chat context exists **per in-memory reader session**
- Persists across chapter/volume navigation within same session
- Clears completely when exiting the reader
- No cross-session memory or learning history
- No manual "clear chat" button needed

## Entry Points

### 1. From Sentence Analysis UI (Primary)
- User selects sentence or connected words in the sentence breakdown UI
- Button shows contextually:
  - "Ask nemu about this sentence" (full sentence selected)
  - "Ask nemu about this word" (single word selected)
  - "Ask nemu about these words" (multiple connected words)
- Opens chat drawer (nested vaul drawer from sentence analysis)
- **Auto-sends message immediately** with the selected text + hidden context

### 2. From Reader Toolbar (Secondary)
- Icon in reader navbar opens chat without auto-message
- Opens chat drawer (non-nested)
- Nemu sends a **real LLM-generated contextual greeting** referencing the current manga

## UI/UX Design

### Style
- **80% glassmorphic, 20% magical cuteness**
- LINE messaging aesthetic throughout

### Chat Layout
- **Container**: Vaul drawer at default expanded height
- **Messages**: LINE-style bubbles
  - User messages: Right-aligned
  - Nemu messages: Left-aligned with avatar
- **Avatar behavior** (LINE exact style):
  - Avatar shows on first message of consecutive nemu messages
  - Timestamp shows on last message of the group
- **Typing indicator**: LINE-style (nemu avatar on left, dots in bubble)

### Message Types

#### Chat Bubbles
Regular conversation messages from user and nemu. Standard LINE bubble styling.

#### Tool Call Visibility
Tool calls are not rendered in the chat UI:
- Tool calls are logged to console only
- No status pills in v1

### Read Receipts
- "Read" label appears on the user's last message once the AI starts responding
- No sent/delivered checkmarks

### Input
- LINE-style input behavior
- Input remains active while nemu is responding (sending cancels the prior request)
- Enter sends message; no other shortcuts

### Follow-up Suggestions
- Rendered as **buttons below nemu's message** (not inline)
- AI decides count adaptively (0-4) based on context richness
- Simple questions may have no follow-ups
- **Disappear** when user sends any new message
- Generated via structured tool call response, client renders

## Technical Architecture

### Stack
- **LLM**: Claude 4.5 Haiku (default), configurable via ai-sdk
- **Backend**: Convex HTTP action with SSE events (no token streaming)
- **Frontend**: ai-elements for chat UI
- **State**: Zustand stores (consistent with existing codebase)
- **Storage**: Client memory only (no database persistence)

### Context Management

#### Conversation Context
- **Rolling window**: Keep last 30 messages
- Drop oldest messages as new ones arrive
- System prompt + recent messages always fit in context

#### Page Context
- Start with **current page only** in initial request
- AI can **request more context on-demand** via tools
- Multi-page context available (previous/next pages) when AI needs storyline understanding

#### Hidden Context (Invisible to User)
Sent with each request but not shown in chat UI:
- Manga title
- Current chapter/volume
- Current page number
- Page transcript (ML-sorted bubble text)
- Ichiran analysis (when entering from sentence analysis)

Dev-only toggle (localStorage) to reveal hidden context for debugging.

### System Prompt
**Dynamic** - includes:
- App language (for response language)
- Manga title
- Genre (for tone adaptation)
- Current chapter info
- Response mode (app language vs simple Japanese N4-N3)

### AI Tools

#### `requestTranscript(pageNumber: number)`
Fetches OCR'd text from specified page.
- Returns ML-sorted bubble text order (~90% correct)
- If page not OCR'd: **triggers OCR internally** (not prompts user)
- Shows status pill: "Reading page X..." while processing

#### `triggerOCR(pageNumber: number)`
Triggers OCR for a page that hasn't been processed.
- Called internally by requestTranscript when needed
- Shows persistent status pill during processing

#### `suggestFollowups(suggestions: string[])`
Provides follow-up action buttons.
- Called **after response completes** (not mid-stream)
- Returns structured data, client renders as buttons
- AI decides how many (or zero) based on context

#### `speak(text: string)`
Emits a LINE-style assistant bubble.
- **Required** for all user-facing replies (no raw assistant text)
- Keep each call brief (1-2 sentences)
- Model can call multiple times to split responses naturally

### Message Flow

#### Entry from Sentence Analysis
```
1. User selects text → taps "Ask nemu"
2. Chat drawer opens (nested)
3. Auto-send: visible user message + hidden context
   - Visible: "Explain this sentence: 「...」" (or word variant)
   - Hidden: manga title, page, transcript, ichiran analysis
4. AI replies via speak tool bubbles (typing indicator while waiting)
5. AI calls suggestFollowups tool (if appropriate)
6. Buttons render below message
```

#### Entry from Toolbar
```
1. User taps chat icon in reader navbar
2. Chat drawer opens (non-nested)
3. LLM generates contextual greeting
4. User can type freely or navigate away
```

### Ichiran Integration
When entering from sentence analysis:
- Include ichiran's full analysis (dictionary form, conjugation, POS)
- Instruct AI to **verify and correct if needed**
- AI can politely note when ichiran seems incorrect (common with slang, dialect, creative speech)

## Error Handling

### Network/API Errors
Emulate LINE network error behavior. Keep it native to the LINE aesthetic rather than custom error states.

### OCR Failures
AI handles gracefully via tool response - can inform user naturally if a page can't be processed.

## V1 Scope Boundaries

### Included
- Full LINE-style chat UI
- Non-streaming LINE-style bubbles via speak tool
- Tool-based context expansion
- Dynamic greetings
- Follow-up suggestions
- Ichiran integration with AI verification
- Response language setting (app language or simple Japanese N4-N3)
- Multi-page context on demand

### Explicitly Excluded (V1)
- Image input (no screenshot upload)
- Custom stickers/emoji reactions
- Cross-session memory
- Furigana custom rendering (raw text for now)
- Keyboard shortcuts
- Copy button on messages
- Manual clear chat button

### Future Considerations
- Sticker system for nemu reactions
- Custom furigana renderer
- Learning history/memory
- Genre-aware personality variations (via prompting - easy to add)

## File Structure (Proposed)

```
src/
├── lib/
│   └── nemu-chat/
│       ├── store.ts           # Zustand store for chat state
│       ├── types.ts           # Message, context types
│       └── prompts.ts         # System prompt templates
├── components/
│   └── nemu-chat/
│       ├── ChatDrawer.tsx     # Main drawer container
│       ├── MessageBubble.tsx  # LINE-style bubble
│       ├── StatusPill.tsx     # Tool call status indicator
│       ├── TypingIndicator.tsx
│       ├── SuggestionButtons.tsx
│       └── ChatInput.tsx
convex/
├── nemuChat.ts                # HTTP action for chat SSE events
└── nemu/
    ├── tools.ts               # Tool definitions
    └── systemPrompt.ts        # Dynamic prompt builder
```

## Integration Points

### Existing Code to Reference
- Sentence breakdown UI (entry point)
- Reader toolbar (entry point)
- Page transcript store (context source)
- OCR functions (tool integration)
- Vaul drawer patterns (UI consistency)
- Zustand store patterns (state management)

## Open Questions Resolved

| Question | Decision |
|----------|----------|
| Response language | App language + Japanese, never romaji |
| Context persistence | In-memory per reader session |
| Rate limiting | None |
| Off-topic handling | No guardrails |
| Greeting generation | Real LLM call |
| Follow-up UI | Buttons below message |
| Message persistence | Client only |
| Response delivery | Speak tool bubbles via SSE events |
| Missing OCR pages | AI triggers OCR internally |
