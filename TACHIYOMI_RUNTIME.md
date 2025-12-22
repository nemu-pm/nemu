# Tachiyomi Extension WASM Runtime

Kotlin/WASM runtime for executing Tachiyomi/Keiyoushi manga extensions in the browser.

## Status

**✅ WASM compilation works** - extensions compile directly from vendor source.

**✅ Sync XHR HTTP bridge works** - HTTP requests via synchronous XMLHttpRequest in Web Worker.

**✅ MangaDex PoC verified** - API calls work (popular manga, chapters, pages).

**⏳ nemu integration pending** - TypeScript adapter scaffolded (`src/lib/sources/keiyoushi/`) but not yet wired into source registry.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Main Thread (nemu)                                 │
│  - src/lib/sources/keiyoushi/adapter.ts → MangaSource       │
│  - Comlink wraps worker for async communication             │
├─────────────────────────────────────────────────────────────┤
│  Web Worker (src/lib/sources/keiyoushi/source.worker.ts)    │
│  - Loads Kotlin/WASM module                                 │
│  - Sync XHR works here (not blocked like main thread)       │
│  - Exposes API via Comlink                                  │
├─────────────────────────────────────────────────────────────┤
│  Kotlin/WASM Module (compiled from vendor source)           │
│  - Extension code runs synchronously in worker              │
│  - OkHttp.execute() → sync XHR via @JsFun                   │
│  - @JsExport entry points return JSON strings               │
├─────────────────────────────────────────────────────────────┤
│  Extension Shim Library (packages/extension-lib-wasm/)      │
│  - Android/JVM API stubs                                    │
│  - OkHttp → sync XMLHttpRequest bridge                      │
│  - Source/HttpSource interfaces                             │
└─────────────────────────────────────────────────────────────┘
```

This follows the same pattern as Aidoku (`src/lib/sources/aidoku/`):
- Main thread uses `async-source.ts` with Comlink
- Worker runs `source.worker.ts` with sync WASM calls
- Sync XHR works in Web Workers (blocked in main thread)

## HTTP Implementation: Synchronous XHR in Web Worker

Following the Aidoku pattern (`src/lib/sources/aidoku/imports/net.ts`), HTTP requests use **synchronous XMLHttpRequest** in a Web Worker:

```kotlin
// OkHttpClient.kt - execute() uses sync XHR
fun execute(): Response {
    val result = syncHttpRequest(url, method, headersJson, body)
    // Blocks until response (works in Web Worker)
    return Response(...)
}

// FetchBridge.kt - @JsFun with sync XMLHttpRequest + CORS proxy
@JsFun("""
(url, method, headersJson, body) => {
    const proxyUrl = 'https://service.nemu.pm/proxy?url=' + encodeURIComponent(url);
    const xhr = new XMLHttpRequest();
    xhr.open(method, proxyUrl, false);  // false = synchronous
    xhr.send(body);
    return { status: xhr.status, body: xhr.responseText, ... };
}
""")
external fun syncHttpRequest(url: String, method: String, headersJson: String, body: String?): SyncHttpResult
```

**Why Web Worker?**
- Sync XHR is **blocked in main thread** (DOMException in modern browsers)
- Sync XHR **works in Web Workers**
- Same pattern proven by Aidoku runtime

## Build Commands

### Production Build

```bash
cd packages
./gradlew :extension-compiler:wasmJsBrowserProductionWebpack -Pextension=all/mangadex
```

Output: `packages/extension-compiler/build/.../optimized/`
- `all-mangadex.wasm` (~540KB)
- `all-mangadex.uninstantiated.mjs` (loader)

### Dev Build (with test harness)

```bash
cd packages
./gradlew :extension-compiler:devBuild -Pextension=all/mangadex
npx serve extension-compiler/dev
# Open http://localhost:3000
```

Output: `packages/extension-compiler/dev/wasm/all-mangadex/`

The dev folder contains:
- `index.html` - Test UI for browsing manga, chapters, pages
- `worker.js` - Web Worker that loads WASM (edit `EXTENSION` constant to switch)
- `wasm/` - Build output (gitignored)

## Key Design: Zero Source Modification

The build pipeline compiles extensions **directly from vendor source** without copying or modifying code:

1. **Preprocessor** adds missing JVM imports (`java.lang.System`, `java.lang.Integer`, etc.)
2. **Excludes** Android-specific files (`*Activity.kt`)
3. **Generates** `Main.kt` entry point with `@JsExport` functions
4. **Compiles** against `extension-lib-wasm` shim library

This enables automated CI/CD: GitHub Actions can build all Keiyoushi extensions to WASM.

## nemu Integration

```
src/lib/sources/keiyoushi/
├── types.ts              # DTO types matching WASM exports
├── source.worker.ts      # Web Worker that loads Kotlin/WASM
├── async-source.ts       # Comlink wrapper for async API
├── adapter.ts            # Converts to nemu's MangaSource interface
└── index.ts              # Exports
```

### Production vs Development

**Production**: WASM files served from CDN
```typescript
const wasmUrl = "https://cdn.nemu.pm/wasm/all-mangadex/all-mangadex.wasm";
```

**Development**: Local WASM files via Vite proxy
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/dev-wasm': {
        target: 'file://',
        rewrite: () => './packages/extension-compiler/dev/wasm'
      }
    }
  }
});

// Or simpler: run `npx serve packages/extension-compiler/dev -p 3001`
// and load from http://localhost:3001/wasm/...
```

### Dev Workflow

1. Build extension: `./gradlew :extension-compiler:devBuild -Pextension=all/mangadex`
2. Start WASM server: `npx serve packages/extension-compiler/dev -p 3001`
3. In nemu dev, set `VITE_WASM_DEV_URL=http://localhost:3001/wasm`
4. Adapter checks env and uses dev URL when present

### Usage in nemu

```typescript
import { createAsyncKeiyoushiSource, createKeiyoushiMangaSource } from "@/lib/sources/keiyoushi";

// Resolve WASM URL (dev vs production)
const wasmBase = import.meta.env.VITE_WASM_DEV_URL || "https://cdn.nemu.pm/wasm";

const asyncSource = await createAsyncKeiyoushiSource(
  `${wasmBase}/all-mangadex/all-mangadex.wasm`,
  { id: "mangadex", name: "MangaDex", lang: "en", version: "1.0" }
);

const source = createKeiyoushiMangaSource(asyncSource);

const results = await source.search("one piece");
const manga = await source.getManga(results.items[0].id);
const chapters = await source.getChapters(manga.id);
```

## Compilation Pipeline

```
vendor/keiyoushi/extensions-source/src/all/mangadex/
          │
          ▼ (preprocess: add imports)
    build/preprocessed/src/
          │
          ▼ (+ generated Main.kt)
    build/generated/src/wasmJsMain/kotlin/Main.kt
          │
          ▼ (compile against extension-lib-wasm)
    build/compileSync/.../all-mangadex.wasm + .mjs
```

## API Shimming

Original extensions import Android/JVM APIs. We provide stub implementations:

| Original API | WASM Shim |
|--------------|-----------|
| `OkHttpClient.execute()` | Sync XHR via `@JsFun` (through CORS proxy) |
| `SharedPreferences` | In-memory `Map` |
| `java.util.Date` | JS `Date.now()` via `@JsFun` |
| `java.util.Locale` | Static language data |
| `java.lang.Integer` | Maps to Kotlin `Int` |
| `KClass.java.classLoader` | Stub ClassLoader |
| `android.util.Log` | `console.log()` |
| `kotlinx.serialization` | Works natively in K/WASM |
| `rx.Observable` | Simplified sync implementation |

### Auto-Injected Imports

The preprocessor adds these imports to each `.kt` file:

```kotlin
import java.lang.System
import java.lang.Integer
import java.lang.Class
import keiyoushi.wasm.compat.*  // Extension shims
```

## File Structure

```
packages/
├── extension-lib-wasm/           # Shim library
│   └── src/wasmJsMain/kotlin/
│       ├── android/              # SharedPreferences, Log, Build
│       ├── androidx/preference/  # Preference UI stubs (no-op)
│       ├── eu/kanade/tachiyomi/  # Source interfaces
│       │   ├── source/           # Source, CatalogueSource, HttpSource
│       │   └── network/          # GET(), asObservable()
│       ├── java/                 # util (Date, Locale), lang (System, Integer)
│       │   └── io/               # IOException
│       ├── keiyoushi/wasm/compat/# Extension shims
│       ├── okhttp3/              # Request, Response, OkHttpClient
│       │   └── internal/         # FetchBridge (sync XHR)
│       ├── org/jsoup/            # Parser stub
│       └── rx/                   # Observable stub
│
└── extension-compiler/           # Build tool
    └── build.gradle.kts          # Parameterized build for any extension

src/lib/sources/keiyoushi/        # nemu integration
├── types.ts                      # TypeScript types
├── source.worker.ts              # Web Worker
├── async-source.ts               # Comlink async wrapper
├── adapter.ts                    # MangaSource adapter
└── index.ts
```

## Comparison with Aidoku

| Aspect | Aidoku | Keiyoushi/WASM |
|--------|--------|----------------|
| Source language | Rust | Kotlin |
| Binary format | WASM (wasmer) | WASM (WasmGC) |
| Size | ~50KB/source | ~600KB/source |
| HTTP | Sync XHR in Worker | Sync XHR in Worker |
| JSON | Host-provided imports | kotlinx.serialization |
| Source modification | None | None |
| Extension count | ~100 | 700+ (Keiyoushi) |
| nemu integration | ✅ Complete | ✅ Started |

## Lessons Learned

During development, we explored multiple approaches before settling on the current architecture:

### Approach 1: Async/Await with Coroutines (Abandoned)

**Idea**: Use Kotlin coroutines with `suspend` functions, bridging OkHttp's `execute()` to browser's async `fetch()` API.

**Problems**:
- Required injecting `suspend` keyword into extension source methods via regex preprocessing
- Cascading async: if `execute()` is `suspend`, then `popularMangaParse()` must be `suspend`, then `getPopularManga()` must be `suspend`, etc.
- Brittle regex-based source transformation
- Complex Promise handling between Kotlin/WASM and JavaScript

**Why it failed**: The async cascade forced modifications to too many method signatures, violating our "zero modification" goal.

### Approach 2: Synchronous XHR in Web Worker (Current)

**Idea**: Use synchronous `XMLHttpRequest` inside a Web Worker (same pattern as Aidoku).

**Benefits**:
- Extension code remains **completely synchronous** - no `suspend` keywords needed
- No source code modifications required
- Proven pattern from Aidoku runtime
- Simple execution model

**Key insight**: Synchronous XHR is blocked in the **main thread** of modern browsers (throws `DOMException`), but is **allowed in Web Workers**. This is why Aidoku uses this architecture.

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Web Worker for WASM | Enables sync XHR; isolates extension execution |
| CORS Proxy | Browser same-origin policy blocks direct API calls |
| JSON string returns | WASM objects can't be cloned via `postMessage`; strings can |
| Import injection | JVM auto-imports (`java.lang.*`) don't exist in Kotlin/WASM |
| No coroutines | Sync XHR eliminates need for async handling |

### What Worked Well

1. **Aidoku as reference** - Same architectural patterns apply despite Rust vs Kotlin
2. **WasmGC availability** - Modern browsers all support it now (Dec 2024+)
3. **kotlinx.serialization** - Works natively in Kotlin/WASM, no shimming needed
4. **Gradle multiplatform** - Clean separation between JVM and WASM targets

## Limitations

1. **Bundle size**: ~600KB vs Aidoku's ~50KB (Kotlin stdlib overhead)
2. **Preferences UI**: `setupPreferenceScreen()` is no-op
3. **Jsoup**: HTML parsing needs real implementation or JS bridge
4. **CORS**: All requests must go through `service.nemu.pm/proxy`

## Future Work

- [ ] Wire keiyoushi adapter into nemu's source registry
- [ ] Test full manga reading flow end-to-end
- [ ] CI/CD pipeline to build all Keiyoushi extensions
- [ ] Reduce bundle size with shared stdlib
- [ ] Jsoup HTML parsing bridge
