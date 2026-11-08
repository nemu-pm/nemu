# App Store Connect privacy "nutrition label" (draft answers)

Derived from `data-flows.md`, and consistent with `ios.privacyManifests` in
`apps/mobile/app.json`, which declares the same seven collected types. Definition
from [Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/),
read 2026-11-08: "'Collect' refers to transmitting data off the device in a way
that allows you and/or your third-party partners to access it for a period longer
than what is necessary to service the transmitted request in real time."

## Tracking

**No tracking.** No data is linked with third-party data for advertising, shared
with data brokers, or used by an ad SDK. `NSPrivacyTracking=false`, no tracking
domains, no App Tracking Transparency prompt.

## Data types collected

Account holders only. A signed-out user transmits nothing that nemu keeps.

| Apple data type | Collected? | Linked to user | Used for tracking | Purposes | Source |
|---|---|---|---|---|---|
| Contact Info > Name | Yes | Yes | No | App Functionality | Google/Apple sign-in |
| Contact Info > Email Address | Yes | Yes | No | App Functionality | Google/Apple sign-in (Apple may supply a private relay address) |
| User Content > Photos or Videos | Yes (cover images the user uploads or selects) | Yes | No | App Functionality | `r2_uploads`, R2 |
| User Content > Other User Content | Yes (library entries, edits, collections; chat and page text sent to AI providers, see below) | Yes | No | App Functionality | Convex synced tables; AI features |
| Usage Data > Product Interaction | Yes (per-chapter reading progress, last read time) | Yes | No | App Functionality | `chapter_progress`, `manga_progress` |
| Identifiers > User ID | Yes (account id) | Yes | No | App Functionality | Better Auth |
| Other Data > Other Data Types | Yes (IP address and user agent stored with each session) | Yes | No | App Functionality (session security) | Better Auth `session` |

Not collected:

- **Browsing History**: Apple defines it as content "that is not part of the app,
  such as websites". Reading progress is the user's own library, labelled above.
- **Identifiers > Device ID**: no advertising or device id.
- **Diagnostics**: no crash or analytics SDK; function logs carry no user content.
- **Search History**: search strings go to metadata providers and sources, and nemu
  keeps none.
- **Audio Data**: dictation audio goes to Apple's speech recognition, not to nemu or
  a partner.
- **Customer Support**: GitHub issues are public and handled outside the app.
- Health & Fitness, Financial Info, Location, Sensitive Info, Contacts, Purchases.

## Content sent to third-party services

| Feature | Recipient | Data | Kept by recipient |
|---|---|---|---|
| Chat | Anthropic | messages, work title/genres/chapter, recognised page text | up to 30 days |
| Listen | Google (Gemini), ElevenLabs | text to be read aloud | Google 55 days; ElevenLabs not stated |
| Metadata matching | Google (Gemini + Search); AniList, MyAnimeList (Jikan), MangaUpdates | title, authors | Google 55 days; others unknown |
| Japanese clean-up | Anthropic via Vercel AI Gateway | one line of Japanese text | upstream policy applies |
| Cloud text recognition | nemu's OCR service (vast.ai GPU host) | page image | not saved |
| Cloud sentence analysis | ichiran.komi.to (third party) | Japanese text | unknown |
| Dictation | Apple Speech | microphone audio | Apple |

An earlier draft called these relays "not collected". That does not survive Apple's
definition: nemu keeps nothing, but Anthropic and Google hold the content longer
than the request. **Other User Content** is ticked and covers this. Page images go
only to nemu's own service, which does not save them, so they add no type. These
flows are also in the policy and the consent sheet.

## Reasoning notes and traps

- **Linked to user = Yes** for everything synced, because it is keyed by the account id.
- **Not used for tracking, not shared for advertising**: nothing leaves for ads or analytics.
- **Retention**: until the user deletes the account (deletion removes all rows in
  `USER_OWNED_TABLES`, R2 objects and Better Auth rows).
- If the labels change, change `ios.privacyManifests` in `apps/mobile/app.json` and
  the policy with them.
- Before submitting, resolve the open items in `data-flows.md`.
