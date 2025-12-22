# Tachiyomi Extension Kotlin/JS Runtime

Kotlin/JS runtime for executing Tachiyomi/Keiyoushi extensions in the browser.

## Quick Start

```bash
# Build a single extension
cd packages/tachiyomi-js
./gradlew devBuild -Pextension=all/mangadex

# Build multiple extensions
./gradlew compileExtensions -Pext=ja/shonenjumpplus,ja/ganganonline

# Build all extensions in a language
./gradlew compileExtensions -Pext=ja/*

# List available extensions
./gradlew listExtensions

# Test built extension
bun scripts/test-tachiyomi-source.ts all-mangadex popular
```

Output: `dev/tachiyomi-extensions/<lang>-<name>/` with `extension.js`, `manifest.json`, `icon.png`

---

## Status

| Feature | Status | Notes |
|---------|--------|-------|
| Kotlin/JS compilation | ✅ | Extensions compile from vendor source |
| Sync XHR HTTP bridge | ✅ | Web Worker with XMLHttpRequest |
| Ksoup HTML parsing | ✅ | Real parser, Jsoup API wrapper |
| ParsedHttpSource | ✅ | 223+ extensions use this |
| AES encryption | ✅ | Pure Kotlin AES/CBC/PKCS7 |
| RSA encryption | ✅ | Pure Kotlin BigInteger + PKCS1 padding |
| GZIP decompression | ✅ | Pure Kotlin DEFLATE decoder |
| Rate limiting | ✅ | Token bucket implementation |
| Bitmap/Canvas | ✅ | PNG/JPEG encode/decode |
| Chapter recognition | ✅ | Mihon-style number parsing from titles |
| SharedPreferences | ✅ | Settings UI with schema extraction |

### Verified Working

- **MangaDex** - Full flow (browse → details → chapters → pages → images)
- **GigaViewer sources** - Shonen Jump+, Gangan Online, Zenon, etc.
- **GanganOnline** - Japanese date format `yyyy.MM.dd`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Main Thread                                        │
│  src/lib/sources/tachiyomi/adapter.ts                       │
│  - Converts to MangaSource interface                        │
│  - Comlink wraps worker for async                           │
├─────────────────────────────────────────────────────────────┤
│  Web Worker                                                 │
│  src/lib/sources/tachiyomi/source.worker.ts                 │
│  - Loads Kotlin/JS as ES module                             │
│  - Sync XHR allowed here                                    │
├─────────────────────────────────────────────────────────────┤
│  Kotlin/JS Module (dev/tachiyomi-extensions/<ext>/extension.js)       │
│  - Extension code + shim library                            │
│  - @JsExport entry points return JSON                       │
├─────────────────────────────────────────────────────────────┤
│  Shim Library (~5000 lines)                                 │
│  packages/tachiyomi-js/src/jsMain/kotlin/                   │
│  - OkHttp → sync XMLHttpRequest                             │
│  - Jsoup → Ksoup wrapper                                    │
│  - javax.crypto → Pure Kotlin AES/RSA                       │
│  - java.util.zip → Pure Kotlin GZIP/DEFLATE                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Shim Implementation

### Package Overview

```
packages/tachiyomi-js/src/jsMain/kotlin/
├── okhttp3/              ~900 lines   HTTP client
├── org/jsoup/            ~470 lines   Ksoup wrapper
├── rx/                   ~160 lines   Sync Observable
├── java/
│   ├── io/               ~120 lines   InputStream, Reader
│   ├── math/             ~490 lines   BigInteger (RSA)
│   ├── security/         ~400 lines   RSA keys, MessageDigest
│   ├── text/             ~190 lines   SimpleDateFormat
│   └── util/             ~500 lines   Date, Locale, Calendar, zip
├── javax/crypto/         ~520 lines   AES + RSA Cipher
├── okio/                 ~200 lines   Buffer/Source
├── android/              ~1100 lines  SharedPreferences, Bitmap, Canvas
├── androidx/preference/  ~230 lines   PreferenceScreen, ListPreference, etc.
└── eu/kanade/            ~500 lines   Source interfaces
─────────────────────────────────────────
Total:                    ~5000 lines
```

### Completeness

| Component | Status | Implementation |
|-----------|--------|----------------|
| **OkHttp** | ✅ | Request, Response, Headers, HttpUrl, FormBody, Interceptors |
| **Rate Limiting** | ✅ | Token bucket with busy-wait (sync context) |
| **Jsoup** | ✅ | Wrapper over Ksoup 0.2.4 |
| **ParsedHttpSource** | ✅ | Full selector/element parsing |
| **RxJava** | ✅ | Sync Observable (minimal API) |
| **SimpleDateFormat** | ✅ | ISO, US, Japanese (年月日), dot/slash formats |
| **AES Cipher** | ✅ | AES-128/192/256, CBC, PKCS7 padding |
| **RSA Cipher** | ✅ | PKCS1v1.5 padding, key generation |
| **BigInteger** | ✅ | Pure Kotlin (modPow, modInverse for RSA) |
| **GZIPInputStream** | ✅ | Pure Kotlin DEFLATE decoder |
| **MessageDigest** | ✅ | MD5, SHA-1, SHA-256 |
| **Bitmap/Canvas** | ✅ | PNG/JPEG decode/encode, drawBitmap |
| **SharedPreferences** | ✅ | Schema extraction → unified settings UI |
| **Base64** | ✅ | android.util + java.util |

### Date Formats Supported

```kotlin
// ISO formats
"yyyy-MM-dd"
"yyyy-MM-dd HH:mm:ss"
"yyyy-MM-dd'T'HH:mm:ss"

// US format
"MM/dd/yyyy"
"MMMM d, yyyy"

// Japanese formats
"yyyy年MM月dd日"
"yyyy年M月d日H時"
"yyyy/M/d"
"yyyy.MM.dd"
"M月 d, yyyy"
```

### RSA Implementation

Pure Kotlin BigInteger with:
- Modular exponentiation (square-and-multiply)
- Modular inverse (extended GCD)
- Miller-Rabin primality test
- PKCS#1 v1.5 padding

Supports:
- `KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec)`
- `KeyPairGenerator.getInstance("RSA").generateKeyPair()`
- `Cipher.getInstance("RSA/ECB/PKCS1Padding")`

---

## Build System

### Single Extension

```bash
./gradlew devBuild -Pextension=<lang>/<name>
```

### Batch Compilation

```bash
# Multiple specific extensions
./gradlew compileExtensions -Pext=ja/shonenjumpplus,ja/ganganonline,all/mangadex

# All extensions in a language
./gradlew compileExtensions -Pext=ja/*

# List available
./gradlew listExtensions
```

### Output Structure

```
dev/tachiyomi-extensions/
├── ja-shonenjumpplus/
│   ├── extension.js       # Compiled Kotlin/JS
│   ├── extension.js.map   # Source map
│   ├── icon.png           # From res/mipmap-xxhdpi/
│   └── manifest.json      # Metadata
└── all-mangadex/
    └── ...
```

### Build Features

- **No stale builds** - Gradle inputs track extension name, auto-invalidates cache
- **Multisrc support** - Automatically includes theme libraries (GigaViewer, etc.)
- **Lib dependencies** - Auto-detects `project(":lib:cryptoaes")` style deps

---

## Extension Compatibility

### By Extension Type

| Type | Count | Status |
|------|-------|--------|
| HttpSource | ~50 | ✅ Works |
| ParsedHttpSource | ~223 | ✅ Works |
| GigaViewer multisrc | 7 | ✅ Works |
| Other multisrc | varies | Depends on shims |

### Known Working Extensions

- `all/mangadex` - Full MangaDex with 61 language sources
- `ja/shonenjumpplus` - GigaViewer, locked chapter detection
- `ja/ganganonline` - Japanese dates
- `ja/zenon` - GigaViewer
- `ja/tonarinoyoungjump` - GigaViewer

### Extensions Needing More Shims

| Extension | Missing |
|-----------|---------|
| `zh/manhuaren` | JSONObject, UUID |
| `ja/mangatoshokanz` | android.util.Base64 (different from java.util) |
| `zh/zaimanhua` | TextPaint text measurement |

---

## Adapter Layer

The TypeScript adapter (`src/lib/sources/tachiyomi/adapter.ts`) provides:

### Chapter Recognition

Ported from Mihon's `ChapterRecognition.kt`:
- Parses chapter numbers from titles like "Vol.1 Ch. 5 - Title"
- Fallback to index-based numbering if parsing fails
- Handles alpha suffixes (Ch.5a → 5.1)

### Locked Chapter Detection

Strips emoji prefixes and sets `locked: true`:
- 💴 - Paid chapter (GigaViewer)
- 🔒 - Locked/unpublished

### Settings System

Extensions use `SharedPreferences` for settings. Our shim:

1. **Schema Extraction**: `setupPreferenceScreen()` is called during source init, capturing preference definitions via `PreferenceRegistry`
2. **Schema Storage**: Schema saved to `source-settings` store (IndexedDB)
3. **UI Rendering**: Uses unified `@/lib/settings` - same components as Aidoku sources
4. **Value Persistence**: User values stored in `source-settings` store

```
Extension init → setupPreferenceScreen() → PreferenceRegistry captures schema
                                                    ↓
                                          JSON schema returned
                                                    ↓
                            source-settings store caches schema + values
                                                    ↓
                              Settings dialog reads from store (sync)
```

Supported preference types:
- `ListPreference` → select dropdown
- `MultiSelectListPreference` → multi-select checkboxes
- `SwitchPreferenceCompat` → toggle switch
- `EditTextPreference` → text input
- `CheckBoxPreference` → toggle switch

### Chapter Number Fallback

Three-tier strategy:
1. Source-provided number (if > -1)
2. Parsed from chapter name
3. Index-based (for descending lists)

---

## Testing

```bash
# Extension info
bun scripts/test-tachiyomi-source.ts <ext> info

# Browse
bun scripts/test-tachiyomi-source.ts <ext> popular
bun scripts/test-tachiyomi-source.ts <ext> latest

# Search
bun scripts/test-tachiyomi-source.ts <ext> search "query"

# Manga details
bun scripts/test-tachiyomi-source.ts <ext> manga "/manga/..."

# Full read test
bun scripts/test-tachiyomi-source.ts <ext> read "/manga/..." "/chapter/..."

# Settings schema
bun scripts/test-tachiyomi-source.ts <ext> settings
```

---

## File Structure

```
packages/tachiyomi-js/
├── build.gradle.kts          # Build logic
├── src/jsMain/kotlin/
│   ├── android/              # Android API shims
│   │   ├── graphics/         # Bitmap, Canvas, BitmapFactory
│   │   └── ...
│   ├── eu/kanade/tachiyomi/  # Source interfaces
│   │   └── source/online/
│   │       ├── HttpSource.kt
│   │       └── ParsedHttpSource.kt
│   ├── java/
│   │   ├── io/               # InputStream, BufferedReader
│   │   ├── math/             # BigInteger
│   │   ├── security/         # KeyFactory, KeyPairGenerator, RSA keys
│   │   ├── text/             # SimpleDateFormat
│   │   └── util/             # Date, Locale, Calendar
│   │       └── zip/          # GZIPInputStream
│   ├── javax/crypto/         # Cipher (AES + RSA)
│   ├── okhttp3/              # HTTP client
│   ├── okio/                 # Binary I/O
│   ├── org/jsoup/            # Ksoup wrapper
│   └── rx/                   # RxJava shim

src/lib/sources/tachiyomi/
├── adapter.ts                # MangaSource adapter
├── source.worker.ts          # Web Worker runtime
├── types.ts                  # TypeScript types
└── dev-registry.ts           # Dev extension loader

src/lib/
├── chapter-recognition.ts    # Mihon-style chapter parsing
├── format-chapter.ts         # Chapter title formatting
└── settings/                 # Unified settings system
    ├── types.ts              # Setting type definitions
    ├── schema.ts             # extractDefaults, isSettingVisible
    ├── renderer.tsx          # SettingsRenderer component
    └── index.ts              # Public exports

dev/tachiyomi-extensions/               # Built extensions (gitignored)
└── <lang>-<name>/
    ├── extension.js
    ├── manifest.json
    └── icon.png
```

---

## Comparison with Aidoku

| Aspect | Aidoku | Tachiyomi/JS |
|--------|--------|--------------|
| Language | Rust | Kotlin |
| Format | WASM (~50KB) | JS (~600KB) |
| Extensions | ~100 | 1200+ |
| HTML parsing | Hand-rolled | Ksoup (real parser) |
| Crypto | None | AES + RSA |
| Debugging | Limited | Full stack traces |
| Shim size | ~2000 lines | ~5000 lines |
| Settings | settings.json in AIX | Schema extracted at runtime |

### Unified Settings

Both Aidoku and Tachiyomi sources use the same settings infrastructure:

```
┌─────────────────────────────────────────────────────────────┐
│  Unified Settings System (@/lib/settings)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Source Creation (async)                                    │
│  ─────────────────────────────────────────────────────────  │
│  Aidoku:        extractAix() → settings.json → store        │
│  Tachiyomi:     getSettingsSchema() → JSON → store          │
│                                                             │
│  source-settings store (single source of truth)             │
│  ─────────────────────────────────────────────────────────  │
│  schemas: Map<sourceKey, Setting[]>  // loaded at init      │
│  values: Map<sourceKey, Record<>>    // persisted IndexedDB │
│                                                             │
│  Settings Dialog (sync read from store)                     │
│  ─────────────────────────────────────────────────────────  │
│  <SettingsRenderer schema={store.schemas} values={...} />   │
│  Same UI components for both source types                   │
└─────────────────────────────────────────────────────────────┘
```

Setting types: `select`, `multi-select`, `switch`, `slider`, `text`, `segment`, `group`, `page`
