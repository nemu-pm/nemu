# nemu data flows (audit, 2026-10-12)

Source of truth for the privacy policy (`src/pages/privacy.tsx`, text in `src/locales/en.json` under `privacy`) and the App Store
privacy labels (`privacy-labels.md`). Everything below was read from the code at
base `313fff49` plus this branch; items marked **UNVERIFIED** could not be
confirmed from the repository and need an owner check.

## Short answers

- **Does the cloud store chat messages?** No. `POST /nemu-chat`
  (`convex/nemu_chat.ts`) is a stateless SSE relay: the request body goes to
  Anthropic and the answer streams back. No Convex table, R2 object or file holds
  messages, page transcripts or model output. Before this branch the handler
  `console.log`ged the whole LLM context and model output, which would have landed
  in Convex function logs; content logging is removed (see "Diagnostics").
  Conversations that the user sees again later live on the device only.
- **Is there analytics or crash reporting?** No. No SDK for analytics, crash
  reporting, ads, attribution or tracking exists in `package.json`,
  `apps/mobile/package.json`, `index.html` or any native module (`expo-insights`,
  `expo-updates` and notifications are not installed; `updates.enabled=false`).
- **Does nemu store diagnostics rows?** No table. The only diagnostics are
  platform logs (Convex function logs, Cloudflare Worker logs, the OCR host's
  process logs). Their retention is set by those providers, not by nemu, and
  cannot be confirmed as 30 days; see "Diagnostics and retention". Therefore **no
  retention cron was built**: there are no nemu-stored diagnostic rows to expire.
- **Account deletion exists?** Not before this branch (no UI, no backend).
  `convex/accountDeletion.ts` now provides `deleteMyAccount`; the UI entry is a
  proposal awaiting approval.

## What stays on the device

Library, collections, reading progress, history, settings, installed sources and
their per-source settings (including any source login tokens), cached images,
imported files, chat history, dictation text. Web: IndexedDB/localStorage.
Mobile: SQLite, secure storage, file cache. Signed-out use needs no account; sync
and the server-backed Japanese-learning features need sign-in (owner rule,
`apps/mobile/src/lib/mobileJapaneseLearningAuth.ts`).

## Account and sync data (Convex, retained until the user deletes the account)

Auth: Better Auth with Google sign-in and Sign in with Apple (`convex/auth.ts`;
Apple appears only when `APPLE_CLIENT_ID/SECRET` are configured).

| Store | What it holds | Notes |
|---|---|---|
| Better Auth `user` | name, email, emailVerified, image, timestamps | from Google/Apple |
| Better Auth `session` | session token, **ipAddress, userAgent**, expiry | default 7-day sessions; expired rows are removed lazily by Better Auth, there is no cron |
| Better Auth `account` | provider id, provider account id, **OAuth access/refresh/id tokens**, scope | Apple refresh token is needed to revoke on deletion |
| Better Auth `verification` | short-lived tokens keyed by email | |
| `sync_generations`, `settings`, `library_items`, `library_source_links`, `collections`, `collection_items`, `chapter_progress`, `manga_progress` (`convex/schema.ts`) | library entries (title, cover URL, authors, tags, description, user overrides), source links, collections, per-chapter reading progress (source id, chapter id, page, timestamps), installed source list (registry id, name, version, download URL) | all keyed by `userId`; this is the data synced between the user's devices |
| `r2_uploads` (new) | R2 object key -> uploader `userId` | written by `generateUploadUrl`; lets deletion find the user's cover uploads |
| R2 bucket (`r2.nemu.pm`, Cloudflare) | cover images the user uploaded/selected (WebP/JPEG) | public URL, random key; **no userId in the key** |

Not stored: reading content (chapters/pages), source passwords, chat text.

## Third-party AI and processing (what leaves the device)

| Feature | Endpoint | Auth | Data sent | Recipient | Stored by nemu |
|---|---|---|---|---|---|
| Chat (Nemu Chat) | Convex HTTP `/nemu-chat` | session required | user messages, assistant history, tool results, manga title/genres/chapter/page number, **OCR transcript of the page being discussed** | Anthropic (Claude Sonnet 4.5, direct API) | nothing |
| Listen (TTS) | Convex HTTP `/tts` | session required | the sentence/transcript text; first Google Gemini (2.5 Flash-Lite) adds expressive tags unless tagged already, then ElevenLabs renders audio | Google (Gemini API), ElevenLabs | nothing |
| Metadata match | Convex actions `ai_metadata.*` | **none** | manga title, authors, derived titles | Google (Gemini 2.5 Flash-Lite with Google Search grounding) | nothing |
| Japanese normalize | Convex action `japanese_learning.normalize` | **none** | one line of Japanese text from a page | Anthropic (Claude Haiku 4.5 via Vercel AI Gateway) | nothing |
| Cloud OCR (user runs text recognition in the cloud) | `https://ocr.nemu.pm` (FastAPI `services/ocr/server.py` plus a vLLM-served PaddleOCR-VL model, both on one rented vast.ai GPU host) | none enforced server-side (clients gate on sign-in) | **manga page image** (base64 PNG/JPEG) | nemu's own service on vast.ai; no third-party model API | Image is decoded in memory and never written to disk by `server.py`; there is no application logging of request content. Standard uvicorn access logs (method, path, status, client address) go to the process output, and vLLM writes `/app/vllm.log` (default vLLM logging, `--enable-log-requests` is not set in `deploy.ts`); the log is deleted on a vLLM restart, otherwise it has no rotation or fixed retention (**UNVERIFIED** on the live host) |
| Cloud grammar analysis (user runs sentence analysis in the cloud) | `https://ichiran.komi.to` (third-party ichiran API, not run by nemu) | none | normalized Japanese text of the sentence | whoever runs that service; its storage/retention unknown (**UNVERIFIED**) | nothing |
| Dictation | iOS Speech framework (`expo-speech-recognition`, no `requiresOnDeviceRecognition`) | n/a | microphone audio | Apple (may process on Apple servers) | nothing |
| Metadata lookups | AniList (`graphql.anilist.co`), Jikan/MyAnimeList, MangaUpdates (the latter through the Convex relay) | none | title/author search strings | those services | nothing |
| Source requests | web: `https://service.nemu.pm/proxy` (Cloudflare Worker relay); mobile: direct from the device | none | the URLs/headers the user's chosen sources request | the source websites; on web also the nemu relay | relay keeps no content; logs the error class only (`services/proxy/service.ts`) |
| Source registries / packages | GitHub Pages (`aidoku-community.github.io`), GitHub releases (dictionary pack) | none | plain downloads | GitHub | |

Provider-side retention (documented by the providers, not controlled by nemu):
Anthropic API inputs/outputs are deleted within 30 days
([privacy.claude.com](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data));
Google keeps Gemini prompts/outputs 55 days for abuse monitoring on paid services
([ai.google.dev/gemini-api/docs/usage-policies](https://ai.google.dev/gemini-api/docs/usage-policies)),
and **free-tier traffic may be used to improve Google products: confirm the key
is on a paid plan**; Vercel AI Gateway deletes prompt content after the request
but each upstream provider's own policy applies unless Zero Data Retention is
enabled ([vercel.com/docs/ai-gateway/faq](https://vercel.com/docs/ai-gateway/faq));
ElevenLabs has no stated retention for non-enterprise API text (Zero Retention is
enterprise-only) (**confirm with ElevenLabs**).

### Cloud AI actions now require sign-in (update)

`ai_metadata.*` and `japanese_learning.normalize` call `requireAuth` server-side
(`tests/convex-ai-actions-auth.test.ts`). Callers send the Better Auth JWT (web
`useAction` and the web normalize/OCR client; mobile `setAuth` before normalize).
Mobile online clean-up runs only when signed in. `ocr.nemu.pm` is to sit behind
`services/ocr-gateway` (JWT check, not yet deployed); until the owner rolls it
out the OCR host itself still has no server-side auth. The table below describes
the state before this change.

### Public (unauthenticated) AI actions (historical)

Convex actions are callable by anyone who knows the deployment URL. Callers:

| Action | Callers | Signed-out reachable? |
|---|---|---|
| `ai_metadata.findJapaneseTitle` | web `source-add-drawer.tsx`, `metadata-match-drawer.tsx`; mobile `mobileMetadataMatch.ts` | Yes (metadata match is not account-gated; clients use the sync client, so signed-in users are authenticated, signed-out users are not) |
| `ai_metadata.findChineseTitle/findJapaneseDescription/findChineseDescription/findAuthorJapaneseName` | `metadata-match-drawer.tsx`; `mobileMetadataMatch.ts` | Yes, same reason |
| `japanese_learning.normalize` | web `japanese-learning/store.ts`; mobile `mobileJapaneseLearningGrammar.ts` | Called through a plain `ConvexHttpClient` with **no auth token even for signed-in users**; mobile only reaches it on the cloud analysis path or the on-device path with `onlineEnhance`, both behind the client sign-in gate |

Fix options (not applied; owner asked to report first): (a) require auth in the
actions and send the Better Auth JWT from the callers (mobile/web
`ConvexHttpClient.setAuth`), which makes metadata match sign-in-only; (b) keep
them open and add per-IP/per-deployment rate limits (the Convex `ratelimiter`
component) plus a length cap on `text`. (b) preserves signed-out metadata match;
(a) matches the owner rule "server features need sign-in".

## Diagnostics and retention

| Where | What it can contain | Retention | Controlled by nemu? |
|---|---|---|---|
| Convex function logs (`console.*`) | after this branch: model name, token estimates, character counts, durations, status codes, error class names, sync generation numbers. **No** message text, transcripts, titles, TTS text or model output | Convex does not document a retention period; the dashboard shows "the most recent logs"; no log stream is configured in the repo ([docs.convex.dev/production/integrations/log-streams](https://docs.convex.dev/production/integrations/log-streams)) | No. **Cannot be claimed as 30 days.** A log stream (Pro plan) to a destination with its own retention would make it controllable |
| Cloudflare Worker `service.nemu.pm` | `console.error` with the error class only; `wrangler.toml` enables no Workers Logs/observability | Cloudflare's standard request analytics/metrics (no content) | Partly (observability is off) |
| OCR host (vast.ai) | uvicorn access logs and `/app/vllm.log` on the rented machine (no request bodies) | no rotation; vLLM log deleted on restart; **UNVERIFIED** on the live host | nemu maintainers (host access) |
| Better Auth sessions | IP address, user agent per session | until expiry (lazy cleanup) or account deletion | Account-bound, not diagnostics |
| Apple / Google / providers | their own | see above | No |

Pre-change content logging, now removed (`convex/nemu_chat.ts`, `tts.ts`,
`ai_metadata.ts`): the full LLM context, per-delta model output, tool inputs and
outputs, the TTS text, and manga titles/authors/descriptions. A test
(`tests/convex-no-content-logging.test.ts`) fails if any `console.*`, `streamLogs`
or timer log call under `convex/` references request/response content again.

Policy wording that is true today: "nemu does not run analytics or crash
reporting and does not store diagnostics. Operational logs of our hosting
providers contain no message or page content; their retention is set by those
providers." If the owner wants a hard 30-day statement, set up a Convex log
stream with a 30-day destination retention first.

## Account deletion (`convex/accountDeletion.ts`)

`deleteMyAccount` (public action, signed-in caller) runs, in order:

1. Revoke Sign in with Apple tokens (`appleRevoke.ts`, Apple REST `auth/revoke`).
   Only `revoked` and `already-revoked` (`invalid_grant`) let deletion
   continue. Every other outcome aborts before anything is deleted and throws a
   `ConvexError`: `ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED` (no usable token, or
   `invalid_client` without an authorization code; the client re-runs Sign in
   with Apple and retries with `appleAuthorizationCode`),
   `ACCOUNT_DELETION_APPLE_REVOKE_FAILED` (rejected, `invalid_client` with a
   code, or not configured) and `ACCOUNT_DELETION_APPLE_UNAVAILABLE` (network or
   5xx after retries). The client helper is `deleteAccount` in `@nemu/core`.
2. Delete R2 objects found through `r2_uploads` and the user's `library_items`
   cover URLs (`https://r2.nemu.pm/<key>`).
3. Purge every user-owned table in pages of 100 (`USER_OWNED_TABLES`), including
   `r2_uploads`.
4. Delete Better Auth sessions, then account, twoFactor, oauth rows, the
   `verification` rows for the user's email, and finally the `user`.
5. Sweep the app tables again for writes that raced the deletion.

Tables covered (`USER_OWNED_TABLES`): `collection_items`, `collections`,
`chapter_progress`, `library_source_links`, `library_items`, `manga_progress`,
`r2_uploads`, `settings`, `sync_generations`; Better Auth: `session`, `account`,
`twoFactor`, `oauthApplication`, `oauthAccessToken`, `oauthConsent`,
`verification` (by email), `user`. Exempt Better Auth tables: `jwks`, `rateLimit`
(not per-user).

Sign in with Apple revocation picks its client from the stored idToken's `aud`:
tokens issued to the Services ID use `APPLE_CLIENT_ID` + `APPLE_CLIENT_SECRET`;
tokens issued to the app bundle id (a native flow) use `APPLE_APP_BUNDLE_ID` +
`APPLE_NATIVE_CLIENT_SECRET` (a JWT whose `sub` is the bundle id). The current
web and mobile sign-in both use the web OAuth flow, so today's tokens belong to
the Services ID. A passed `appleAuthorizationCode` is exchanged at Apple's
`/auth/token` with the native client and the fresh refresh token is revoked.
Client secrets come from `scripts/generate-apple-secret.ts` and are valid for at
most 6 months; an expired secret now blocks deletion for Apple users
(`ACCOUNT_DELETION_APPLE_REVOKE_FAILED`), so renew it on schedule. Only outcomes
and status codes are logged, never tokens or secrets.

It is idempotent and resumable: the caller stays authenticated until step 4, so a
failure is repaired by calling again. `tests/convex-account-deletion.test.ts`
fails when a table is added to `convex/schema.ts` or to the installed Better Auth
component without being handled here.

Residual: a connected client's Convex JWT stays valid until it expires (Better
Auth default 15 minutes) and could write new rows for the deleted user id. The
client must sign out and clear local state immediately after success (UI part of
the proposal). Rows written in that window are orphans keyed by a user id that no
longer exists.

## R2 attribution

Uploads now require a signed-in user (`convex/r2.ts`); every key is recorded in
`r2_uploads`. **Existing orphans** (uploads before this change, uploads that were
never attached to a library item, and any anonymous uploads made while the
endpoint was open) have no owner record. Deletion finds them only if the user's
library still references them. They are not cleaned up; there is no speculative
cleanup job.

## Open items for the owner

1. Convex log retention (see above): confirm the plan/retention or add a log stream.
2. Google AI key plan (paid vs free) and ElevenLabs retention.
3. `ocr.nemu.pm` has no server-side auth and unknown host log retention; the page
   image is user content (possibly copyrighted) sent to a rented machine. Auth/rate-limit
   proposal is in the Line C report.
4. The policy of whoever runs `ichiran.komi.to`.
5. Decide auth vs rate limit for the public AI actions.
6. Mobile cover upload while signed out now shows the existing cover error
   (mobile passes through `uploadMobileCoverBytes`); hiding the picker signed-out
   is UI and left as a proposal.
