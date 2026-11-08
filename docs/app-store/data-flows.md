# nemu data flows (audit 2026-10-12, updated 2026-11-08)

Source of truth for the privacy policy (`src/pages/privacy.tsx`, text in `src/locales/en.json` under `privacy`) and the App Store
privacy labels (`privacy-labels.md`). Everything below was read from the code, last
at `b08bc868`; items marked **UNVERIFIED** could not be
confirmed from the repository and need an owner check. Production Convex was
deployed on 2026-11-08 from `816b6eb1` (`docs/convex-deploy-pr34.md`), and `convex/`
has not changed since, so the server behaviour below is live.

## Short answers

- **Does the cloud store chat messages?** No. `POST /nemu-chat`
  (`convex/nemu_chat.ts`) is a stateless SSE relay: the request body goes to
  Anthropic and the answer streams back. No Convex table, R2 object or file holds
  messages, page transcripts or model output, and content logging is removed (see
  "Diagnostics"). Conversations that the user sees again later live on the device only.
- **Is there analytics or crash reporting?** No. No SDK for analytics, crash
  reporting, ads, attribution or tracking exists in `package.json`,
  `apps/mobile/package.json`, `index.html` or any native module (`expo-insights`,
  `expo-updates` and notifications are not installed; `updates.enabled=false`).
- **Does nemu store diagnostics rows?** No table. The only diagnostics are
  platform logs (Convex function logs, Cloudflare Worker logs, the OCR host's
  process logs). Their retention is set by those providers, not by nemu, and
  cannot be confirmed as 30 days; see "Diagnostics and retention". Therefore **no
  retention cron was built**: there are no nemu-stored diagnostic rows to expire.
- **Account deletion exists?** Yes. `convex/accountDeletion.ts` provides
  `deleteMyAccount`, and the entry is Settings > Account > Delete Account.
- **Does the app use the camera?** No. Show Cover on Outer Display, the only camera
  use, is removed, and the build has no `NSCameraUsageDescription`.
- **Does it run in the background?** Only library sync, through `expo-background-task`
  (`UIBackgroundModes` `fetch`, `processing`; `apps/mobile/src/sync/mobileBackgroundSync.native.ts`).

## What stays on the device

Library, collections, reading progress, history, settings, installed sources and
their per-source settings (including any source login tokens), cached images,
imported files, chat history, dictation text. Web: IndexedDB/localStorage.
Mobile: SQLite, secure storage, file cache. Signed-out use needs no account; sync
and the server-backed Japanese-learning features need sign-in (owner rule,
`apps/mobile/src/lib/mobileJapaneseLearningAuth.ts`).

## Account and sync data (Convex, retained until the user deletes the account)

Auth: Better Auth with Google sign-in and Sign in with Apple (`convex/auth.ts`;
Apple appears only when `APPLE_CLIENT_ID/SECRET` are configured). Both use the web
OAuth flow on every platform. There is no native Sign in with Apple
(`expo-apple-authentication` was removed).

| Store | What it holds | Notes |
|---|---|---|
| Better Auth `user` | name, email, emailVerified, image, timestamps | from Google/Apple |
| Better Auth `session` | session token, **ipAddress, userAgent**, expiry | default 7-day sessions; expired rows are removed lazily by Better Auth, there is no cron |
| Better Auth `account` | provider id, provider account id, **OAuth access/refresh/id tokens**, scope | Apple refresh token is needed to revoke on deletion |
| Better Auth `verification` | short-lived tokens keyed by email | |
| `sync_generations`, `settings`, `library_items`, `library_source_links`, `collections`, `collection_items`, `chapter_progress`, `manga_progress` (`convex/schema.ts`) | library entries (title, cover URL, authors, tags, description, user overrides), source links, collections, per-chapter reading progress (source id, chapter id, page, timestamps), installed source list (registry id, name, version, download URL) | all keyed by `userId`; this is the data synced between the user's devices |
| `settings.sourceDirectories`, `settings.localArchiveVolumes` | the user's source-directory list; imported-archive metadata, never the files | added in the 2026-11-08 deploy |
| `r2_uploads` | R2 object key -> uploader `userId` | written by `generateUploadUrl`; lets deletion find the user's cover uploads |
| R2 bucket (`r2.nemu.pm`, Cloudflare) | cover images the user uploaded/selected (WebP/JPEG) | public URL, random key; **no userId in the key** |

Not stored: reading content (chapters/pages), source passwords, chat text.

## Third-party AI and processing (what leaves the device)

| Feature | Endpoint | Auth | Data sent | Recipient | Stored by nemu |
|---|---|---|---|---|---|
| Chat (Nemu Chat) | Convex HTTP `/nemu-chat` | session required | user messages, assistant history, tool results, manga title/genres/chapter/page number, **OCR transcript of the page being discussed** | Anthropic (Claude Sonnet 4.5, direct API) | nothing |
| Listen (TTS) | Convex HTTP `/tts` | session required | the sentence/transcript text; first Google Gemini (2.5 Flash-Lite) adds expressive tags unless tagged already, then ElevenLabs renders audio | Google (Gemini API), ElevenLabs | nothing |
| Metadata match | Convex actions `ai_metadata.*` | session required | manga title, authors, derived titles | Google (Gemini 2.5 Flash-Lite with Google Search grounding) | nothing |
| Japanese normalize | Convex action `japanese_learning.normalize` | session required | one line of Japanese text from a page | Anthropic (Claude Haiku 4.5 via Vercel AI Gateway) | nothing |
| Cloud OCR (user runs text recognition in the cloud) | `https://ocr.nemu.pm` (FastAPI `services/ocr/server.py` plus a vLLM-served PaddleOCR-VL model, both on one rented vast.ai GPU host) | none enforced server-side (clients gate on sign-in) | **manga page image** (base64 PNG/JPEG) | nemu's own service on vast.ai; no third-party model API | Image is decoded in memory and never written to disk by `server.py`; there is no application logging of request content. Standard uvicorn access logs (method, path, status, client address) go to the process output, and vLLM writes `/app/vllm.log` (default vLLM logging, `--enable-log-requests` is not set in `deploy.ts`); the log is deleted on a vLLM restart, otherwise it has no rotation or fixed retention (**UNVERIFIED** on the live host) |
| Cloud grammar analysis (user runs sentence analysis in the cloud) | `https://ichiran.komi.to` (third-party ichiran API, not run by nemu) | none | normalized Japanese text of the sentence | whoever runs that service; its storage/retention unknown (**UNVERIFIED**) | nothing |
| Dictation | iOS Speech framework (`expo-speech-recognition`, no `requiresOnDeviceRecognition`) | n/a | microphone audio | Apple (may process on Apple servers) | nothing |
| Metadata lookups | AniList (`graphql.anilist.co`), Jikan/MyAnimeList, MangaUpdates (`api.mangaupdates.com`, through the `service.nemu.pm` relay when proxied; `mobileMetadataMatch.ts`) | none | title/author search strings | those services | nothing |
| Source requests | web: `https://service.nemu.pm/proxy` (Cloudflare Worker relay); mobile: direct from the device | none | the URLs/headers the user's chosen sources request | the source websites; on web also the nemu relay | relay keeps no content; logs the error class only (`services/proxy/service.ts`) |
| Example Sources (id `nemu-recommended`) | index and `.aix` packages from `nemu-pm.github.io/source-registry`; a bundled snapshot covers a first launch offline. Dictionary pack from GitHub releases | none | plain downloads | GitHub | |
| Example content | NDL Public Domain Picks: `dl.ndl.go.jp` (IIIF). Pepper&Carrot, Mini Fantasy Theater: `peppercarrot.com`. Little Nemo: Wikimedia Commons. LANraragi: only the user's own server | none | requests for titles and pages | those sites, or the user's server | |
| Directories the user adds | any HTTPS address the user pasted or confirmed from a `nemu://` or `aidoku://` link. None is listed or linked in the mobile app | none | plain downloads | that host | |
| Web app only | `packages/core/src/sources/registries.ts` lists Aidoku community registries for the web app (`aidoku-community.github.io`, GitHub raw); the web never lists Example Sources | none | plain downloads | GitHub | |

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

### Cloud AI: sign-in and consent

`ai_metadata.*` and `japanese_learning.normalize` call `requireAuth` server-side
(`tests/convex-ai-actions-auth.test.ts`), live since the 2026-11-08 deploy. Callers
send the Better Auth JWT (web `useAction` and the web normalize/OCR client; mobile
`setAuth` before normalize). Mobile online clean-up runs only when signed in.
`ocr.nemu.pm` is to sit behind `services/ocr-gateway` (JWT check). **UNVERIFIED** whether
that has been rolled out. Until it is, the OCR host itself has no server-side auth, and
clients gate on sign-in.

On mobile, a one-time sheet (`MobileAiConsentHost`, `mobileAiConsent.ts`) asks before the
first cloud AI request and links the policy. "Not now" cancels that request.

## Diagnostics and retention

| Where | What it can contain | Retention | Controlled by nemu? |
|---|---|---|---|
| Convex function logs (`console.*`) | model name, token estimates, character counts, durations, status codes, error class names, sync generation numbers. **No** message text, transcripts, titles, TTS text or model output | Convex does not document a retention period; the dashboard shows "the most recent logs"; no log stream is configured in the repo ([docs.convex.dev/production/integrations/log-streams](https://docs.convex.dev/production/integrations/log-streams)) | No. **Cannot be claimed as 30 days.** A log stream (Pro plan) to a destination with its own retention would make it controllable |
| Cloudflare Worker `service.nemu.pm` | `console.error` with the error class only; `wrangler.toml` enables no Workers Logs/observability | Cloudflare's standard request analytics/metrics (no content) | Partly (observability is off) |
| OCR host (vast.ai) | uvicorn access logs and `/app/vllm.log` on the rented machine (no request bodies) | no rotation; vLLM log deleted on restart; **UNVERIFIED** on the live host | nemu maintainers (host access) |
| Better Auth sessions | IP address, user agent per session | until expiry (lazy cleanup) or account deletion | Account-bound, not diagnostics |
| Apple / Google / providers | their own | see above | No |

Content logging is removed from `convex/nemu_chat.ts`, `tts.ts` and `ai_metadata.ts`.
A test (`tests/convex-no-content-logging.test.ts`) fails if any `console.*`,
`streamLogs` or timer log call under `convex/` references request/response content
again.

The published policy says logs "are kept for 30 days", which depends on the setup in
`log-retention.md`. That file also holds the wording to use if the setup is not done.

## Account deletion (`convex/accountDeletion.ts`)

`deleteMyAccount` (public action, signed-in caller) runs, in order:

1. Revoke Sign in with Apple tokens (`appleRevoke.ts`, Apple REST `auth/revoke`).
   Only `revoked` and `already-revoked` (`invalid_grant`) let deletion
   continue. Every other outcome aborts before anything is deleted and throws a
   `ConvexError`: `ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED` (no usable token, or
   `invalid_client` without an authorization code; the app asks the user to sign
   out, sign back in and try again),
   `ACCOUNT_DELETION_APPLE_REVOKE_FAILED` (rejected, `invalid_client` with a
   code, or not configured) and `ACCOUNT_DELETION_APPLE_UNAVAILABLE` (network or
   5xx after retries). The client helper is `deleteAccount` in `@nemu/core`.
   Deletion refuses to start offline.
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
tokens issued to the Services ID use `APPLE_CLIENT_ID` + `APPLE_CLIENT_SECRET`.
Web and mobile sign-in both use the web OAuth flow, so all of today's tokens belong
to the Services ID. The backend also still handles tokens issued to the app bundle id
and an `appleAuthorizationCode` argument (`APPLE_APP_BUNDLE_ID` +
`APPLE_NATIVE_CLIENT_SECRET`), which no current client sends.
Client secrets come from `scripts/generate-apple-secret.ts` and are valid for at
most 6 months; an expired secret now blocks deletion for Apple users
(`ACCOUNT_DELETION_APPLE_REVOKE_FAILED`), so renew it on schedule. Only outcomes
and status codes are logged, never tokens or secrets.

It is idempotent and resumable: the caller stays authenticated until step 4, so a
failure is repaired by calling again. `tests/convex-account-deletion.test.ts`
fails when a table is added to `convex/schema.ts` or to the installed Better Auth
component without being handled here.

Residual: a connected client's Convex JWT stays valid until it expires (Better
Auth default 15 minutes) and could write new rows for the deleted user id, so the
client signs out immediately after success. Rows written in that window are orphans
keyed by a user id that no longer exists. Data on the device is kept, as the
confirmation alert says.

## R2 attribution

Uploads now require a signed-in user (`convex/r2.ts`); every key is recorded in
`r2_uploads`. **Existing orphans** (uploads before this change, uploads that were
never attached to a library item, and any anonymous uploads made while the
endpoint was open) have no owner record. Deletion finds them only if the user's
library still references them. They are not cleaned up; there is no speculative
cleanup job.

## Open items for the owner

1. Convex log retention and OCR log rotation: finish `log-retention.md`, or change the
   policy's 30-day statement.
2. Google AI key plan (paid vs free) and ElevenLabs retention.
3. `ocr.nemu.pm`: deploy `services/ocr-gateway`, and confirm host log retention. The
   page image is user content (possibly copyrighted) sent to a rented machine.
4. The policy of whoever runs `ichiran.komi.to`.
5. The policy still says "Last updated: 2026-10-12". Update its date whenever it changes,
   and add a real contact address when the support page lands (`listing.md`).
