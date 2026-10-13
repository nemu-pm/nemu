# App Store Connect privacy "nutrition label" (draft answers)

Derived only from `data-flows.md`. App Store Connect > App Privacy. Definitions:
"collect" = data transmitted off the device in a way that lets nemu or its
third-party partners access it for longer than needed to service the request
([Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
-- re-read before submitting). Data that is processed only to answer a request
and is not retained is not "collected"; the AI relays below are in that category,
but they are still disclosed in the policy and at the point of use (5.1.2(i)).

## Tracking

**No tracking.** No data is linked with third-party data for advertising, shared
with data brokers, or used by any ad SDK. `NSPrivacyTracking=false`, no tracking
domains. No App Tracking Transparency prompt.

## Data types collected

Account holders only (a signed-out user transmits nothing that nemu keeps).

| Apple data type | Collected? | Linked to user | Used for tracking | Purposes | Source |
|---|---|---|---|---|---|
| Contact Info > Name | Yes | Yes | No | App Functionality | Google/Apple sign-in |
| Contact Info > Email Address | Yes | Yes | No | App Functionality | Google/Apple sign-in (Apple may supply a private relay address) |
| User Content > Photos or Videos | Yes (cover images the user uploads or selects) | Yes | No | App Functionality | `r2_uploads`, R2 |
| User Content > Other User Content | Yes (library entries, titles/notes/edits, collections) | Yes | No | App Functionality | Convex synced tables |
| Browsing History? | **No**: reading progress is app functionality tied to the user's own library, not web browsing history |  |  |  |  |
| Usage Data > Product Interaction | Yes (per-chapter reading progress, last read time) | Yes | No | App Functionality | `chapter_progress`, `manga_progress` |
| Identifiers > User ID | Yes (account id) | Yes | No | App Functionality | Better Auth |
| Identifiers > Device ID | **No** (no advertising id, no device id) |  |  |  |  |
| Diagnostics (Crash Data, Performance, Other) | **No** (no SDKs; function logs carry no user content) |  |  |  |  |
| Other Data Types | Yes: IP address and user agent stored with each session | Yes | No | App Functionality (security of the session) | Better Auth `session` |

Not collected: Health & Fitness, Financial Info, Location, Sensitive Info,
Contacts, Search History (search strings go to metadata providers but are not
retained by nemu), Purchases, Audio Data (dictation audio goes to Apple's speech
recognition, not to nemu), Customer Support (GitHub issues are public and handled
outside the app).

## Content sent to third-party AI and services (not retained by nemu)

Declared in the policy and in the planned point-of-use notice, listed here so the
label answers stay consistent if Apple's review asks:

| Feature | Recipient | Data |
|---|---|---|
| Chat | Anthropic | messages, work title/genres/chapter, recognised page text |
| Listen | Google (Gemini), ElevenLabs | text to be read aloud |
| Metadata matching | Google (Gemini + Search), AniList, MyAnimeList (Jikan), MangaUpdates | title, authors |
| Japanese clean-up | Anthropic via Vercel AI Gateway | one line of Japanese text |
| Cloud text recognition | nemu's OCR service (vast.ai GPU host) | manga page image |
| Cloud sentence analysis | ichiran.komi.to (third party) | Japanese text |
| Dictation | Apple Speech | microphone audio |

Conservative option: if App Review treats these as "collection", also tick **User
Content > Other User Content** (already ticked) and **Audio Data** only if dictation
is moved off Apple's on-device/server recognition to a nemu server (it is not).

## Reasoning notes and traps

- **Linked to user = Yes** for everything synced, because it is keyed by the
  account id.
- **Not used for tracking, not shared for advertising**: nothing leaves for ads or
  analytics.
- **Retention**: until the user deletes the account (deletion removes all rows in
  `USER_OWNED_TABLES`, R2 objects and Better Auth rows).
- Re-confirm before submitting: Convex log retention (data-flows.md, "Open items"),
  whether the Google AI key is on a paid plan, and ElevenLabs retention. If any of
  these changes the answer, change the policy first, then this table.
