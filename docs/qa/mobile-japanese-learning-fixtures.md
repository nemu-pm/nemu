# Japanese Learning UI fixtures

Opt-in OCR and Nemu Chat fixtures let QA inspect the actual reader sheets while their services are unavailable. They do not test recognition quality, real chat, authentication, grammar/tokenization, audio, or backend integration.

The service boundary is replaced before image reads, auth-cookie access, uploads, or HTTP calls. It uses the existing reader state and stream callbacks, so loading, errors, retry, transcript selection, message bubbles, and suggestions render through production components. Results are in memory; no library or synced setting is modified by this fixture code. Normal reader progress still behaves normally.

## Enable on a local QA build

From `apps/mobile`:

```sh
EXPO_PUBLIC_JAPANESE_LEARNING_QA=1 EXPO_PUBLIC_QA_OCR=success EXPO_PUBLIC_QA_CHAT=success bun start
```

Open a loaded chapter, enable Japanese Learning in reader plugins, then open **Detect text / Transcript** or **Nemu Chat**. For non-Japanese sources enable the plugin's **all languages** option if necessary. No extra route or hidden user setting is added.

Expo inlines these variables at bundle time. Use the same variables on the command generating a Release QA bundle; changing shell variables after the app is installed will not change that bundle. When changing variables in `.env.local`, perform a full app reload. Keep QA env files uncommitted. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

| Variable | Accepted values | Default with QA enabled |
| --- | --- | --- |
| `EXPO_PUBLIC_JAPANESE_LEARNING_QA` | Exactly `1` enables fixtures; otherwise disabled | Disabled |
| `EXPO_PUBLIC_QA_OCR` | `success`, `loading`, `empty`, `error` | `success` |
| `EXPO_PUBLIC_QA_CHAT` | `success`, `loading`, `empty`, `error` | `success` |

Unknown scenario values also fall back to fixture success once the QA flag is enabled, preventing a typo from accidentally contacting live OCR/chat. Without the QA flag, the existing real services are used unchanged.

## Review matrix

- **Success:** Synthetic Japanese lines and three selectable boxes; chat streams a multiline bilingual explanation and three follow-up suggestions. `[QA fixture]` is visible in the result. Box positions are synthetic, unrelated to the current manga image.
- **Loading:** Request stays pending until navigation/cancellation/app background cancels it. Inspect small-height sheets, rotation, keyboards, and dismiss/reopen behavior. It does not time out into success automatically.
- **Empty OCR:** No detections/text. Chat requiring a transcript should display its existing no-text feedback.
- **Empty chat:** Use OCR `success` + chat `empty` to inspect an empty response independently.
- **Error:** Clearly marked synthetic errors reach the normal error/retry handling. Use OCR `success` + chat `error` to reach chat failure independently.

Success/error/empty pause 800 ms first; successful chat then emits chunks 160 ms apart. Abort cancels timers/listeners and prevents subsequent stream chunks.

These fixtures do not emit tool calls or voice requests. Manually selecting separate grammar/audio actions can still invoke their real services; those are outside this fixture's scope.

To return to live checks, remove all three variables and reload/rebundle. Restart the app to clear transient transcript/chat state; do not mix fixture screenshots with live-service evidence in the review report.

## Sentence-state timeline (screenshots without taps)

`EXPO_PUBLIC_JL_QA_TIMELINE=1` (only with `EXPO_PUBLIC_JAPANESE_LEARNING_QA=1`) makes the sentence view walk its states once tokens are ready: select the first word after the `[QA fixture]` marker (+5 s), select a three-word range (+11 s), then ask nemu about it (+17 s). Combine with `EXPO_PUBLIC_READER_QA_PANEL=ocr` for simulators whose synthesized taps do not reach the display (iPhone Duo inner display).
