# Aidoku Runtime Alignment Checklist (TS ↔ Swift legacy ↔ `aidoku-rs`)

This checklist is written so a junior developer can methodically align:

- **TS runtime**: `src/lib/sources/aidoku/**`
- **Swift legacy runtime** (Wasm3 + descriptor/object model): `vendor/Aidoku/Aidoku/Shared/Wasm/**`
- **`aidoku-rs` ABI** (current Rust source ABI + import signatures): `vendor/Aidoku/aidoku-rs/crates/lib/src/**` and `vendor/Aidoku/aidoku-rs/crates/test-runner/src/**`

It’s split into **two tracks**:

- **Track A (Legacy Swift parity)**: run older/Swift-era sources that use the descriptor/object ABI.
- **Track B (`aidoku-rs` ABI parity)**: run modern Rust sources using postcard + `aidoku-rs` imports/exports.

The TS runtime currently mixes both, so you must keep the distinctions clear.

---

## Glossary / mental model (read first)

- **Rid / descriptor**: an integer handle returned by host imports, used by WASM to refer to a host-side resource or value.
  - Swift legacy: `WasmGlobalStore.stdDescriptors` + `requests` are separate maps.
  - `aidoku-rs` (and its test runner): a single “store” contains different item kinds (string/request/html/js/canvas/image/encoded bytes), all keyed by **Rid**, and **`std.destroy(rid)`** is the universal destructor.
- **Ptr**: a pointer into **WASM linear memory**, used to pass raw bytes (often postcard-encoded) to host functions.
- **Legacy ABI (Swift-era)**: imports like `std.create_string`, `net.get_data_size`, `aidoku.create_manga`.
- **`aidoku-rs` ABI**: imports like `std.buffer_len/read_buffer/parse_date`, `net.data_len/read_data`, `defaults.set(kind, ptr)`, `html.parse(base_url...)`.

---

## Source-of-truth files (keep open while implementing)

### Swift legacy runtime
- `vendor/Aidoku/Aidoku/Shared/Sources/Source.swift` (exports modules, expected function names)
- `vendor/Aidoku/Aidoku/Shared/Wasm/WasmGlobalStore.swift` (descriptor + request storage model)
- `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmStd.swift`
- `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmNet.swift`
- `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmHtml.swift`
- `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmJson.swift`
- `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmDefaults.swift`
- `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmAidoku.swift`

### `aidoku-rs` ABI (imports + export glue)
- `vendor/Aidoku/aidoku-rs/crates/lib/src/imports/*.rs` (import signatures + error enums)
  - especially: `imports/std.rs`, `imports/net.rs`, `imports/html.rs`, `imports/defaults.rs`, `imports/js.rs`, `imports/canvas.rs`
- `vendor/Aidoku/aidoku-rs/crates/lib/src/macros/mod.rs` (what exports the WASM module provides)
- `vendor/Aidoku/aidoku-rs/crates/lib/src/structs/source.rs` (what “capabilities” a source may implement)
- `vendor/Aidoku/aidoku-rs/crates/test-runner/src/imports/*.rs` (reference host implementation; practical truth)

### TS runtime
- `src/lib/sources/aidoku/runtime.ts` (WASM loading + export dispatch)
- `src/lib/sources/aidoku/global-store.ts` (current store model)
- `src/lib/sources/aidoku/imports/*.ts` (host import implementations)
- `src/lib/sources/aidoku/postcard.ts` (postcard helpers used in new ABI path)

---

## Track A — Legacy Swift parity checklist (descriptor/object ABI)

### A1) `env.abort` must match Swift's AssemblyScript abort behavior ✅

- **Why**: Swift's `Source.abort` reads AssemblyScript string lengths using pointer arithmetic; TS currently reads a fixed 256 bytes and will misreport or crash on some modules.
- **Swift reference**: `vendor/Aidoku/Aidoku/Shared/Sources/Source.swift` (`abort` around the "needed for assemblyscript" comment).
- **TS code**: `src/lib/sources/aidoku/imports/env.ts` (`abort`).

Checklist:
- [x] Implement AssemblyScript abort decoding:
  - [x] Read message length from `msgPtr - 4`
  - [x] Read filename length from `filePtr - 4`
  - [x] Read exactly those lengths from memory to form strings
  - [x] Do **not** attempt to read 256 bytes unconditionally
- [x] Ensure abort breaks out similarly (Swift uses `Wasm3.yieldNext()`; TS should throw consistently).

Acceptance:
- [x] A minimal AssemblyScript-based WASM that calls `abort("msg", "file", line, col)` produces correct strings.

---

### A2) Legacy `net.get_data_size/get_data` must be streaming-compatible (bytesRead) ✅

- **Why**: Swift legacy `WasmNet.get_data_size/get_data` uses `bytesRead` to support incremental reads; TS legacy path currently rereads from the start.
- **Swift reference**: `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmNet.swift` (`bytesRead`, `get_data_size`, `get_data`).
- **TS code**: `src/lib/sources/aidoku/imports/net.ts` (legacy block at bottom).

Checklist:
- [x] For legacy `get_data_size(descriptor)` return **remaining** bytes: `data.length - bytesRead`.
- [x] For legacy `get_data(descriptor, buffer, size)`:
  - [x] Copy bytes starting at `bytesRead` (not from 0)
  - [x] Increment `bytesRead` by `size`
  - [x] Guard bounds like Swift: only read if `bytesRead + size <= data.length`

Acceptance:
- [x] A legacy source that reads response in chunks returns concatenation equal to full body.

---

### A3) Legacy `html.escape/unescape` must match SwiftSoup behavior (as closely as feasible) ✅

- **Why**: Swift uses `Entities.escape/unescape` which handles a broad range of entities; TS's manual mapping is incomplete.
- **Swift reference**: `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmHtml.swift` (`escape`, `unescape`).
- **TS code**: `src/lib/sources/aidoku/imports/html.ts` (`escape`, `unescape`).

Checklist:
- [x] Upgrade TS HTML escape/unescape to handle:
  - [x] Named entities beyond the 5 basic ones (minimum: `&nbsp;`, `&apos;`, common punctuation)
  - [x] Numeric decimal entities (`&#123;`)
  - [x] Numeric hex entities (`&#x1F600;`)
- [x] Ensure invalid/unrecognized entities are left as-is (align with SwiftSoup behavior).

Acceptance:
- [x] A test suite of strings containing mixed entities matches Swift runtime outputs (allow small known differences if documented).

---

### A4) Legacy filter conversion: implement **recursive group filters** ✅

- **Why**: TS runtime explicitly has `TODO: recursive` for group filters; Swift supports nested filter trees.
- **TS code**: `src/lib/sources/aidoku/runtime.ts` (legacy `getSearchMangaList` conversion).

Checklist:
- [x] For `FilterType.Group`, recursively convert `filters` to Swift filter objects.
- [x] Ensure group's `filters` field matches the Swift runtime's expectation for group filters.

Acceptance:
- [x] A nested-group filter set is correctly consumed by a legacy source (no missing/default values).

---

### A5) Legacy `net` default headers and cookies parity ✅

- **Why**: Swift ensures a User-Agent header and merges cookies from `HTTPCookieStorage`.
- **Swift reference**: `vendor/Aidoku/Aidoku/Shared/Wasm/Imports/WasmNet.swift` (`modifyRequest`).
- **TS code**: `src/lib/sources/aidoku/runtime.ts` legacy `modifyImageRequest` adds UA/cookies; but legacy `net.send` should behave similarly too.

Checklist:
- [x] Ensure legacy `net.send` adds a default `User-Agent` if missing.
- [x] Ensure cookies are merged in a stable order:
  - [x] stored cookies first, then request's existing Cookie (Swift appends old cookie)
- [x] Ensure `Set-Cookie` parsing isn't lossy for common cases (at least support multiple cookies).

Acceptance:
- [x] A login flow that sets cookies via `Set-Cookie` works on follow-up requests.

---

## Track B — `aidoku-rs` ABI parity checklist (imports + exports)

This track must align with:
- import signatures from `vendor/Aidoku/aidoku-rs/crates/lib/src/imports/*.rs`
- host semantics from `vendor/Aidoku/aidoku-rs/crates/test-runner/src/imports/*.rs`
- export wiring from `vendor/Aidoku/aidoku-rs/crates/lib/src/macros/mod.rs`

### B0) Decide: "Strict `aidoku-rs` mode" vs "Hybrid mode" ✅

Checklist:
- [x] Add a clear runtime mode flag:
  - [x] **Legacy mode**: use Swift-era descriptors + legacy imports
  - [x] **`aidoku-rs` mode**: follow `aidoku-rs` import/export contracts strictly
- [x] In `runtime.ts`, ensure ABI detection leads to a consistent mode (no partial mixing).
  - Added `RuntimeMode` enum and `detectRuntimeMode()` helper in `result-decoder.ts`
  - Added `mode` property to `AidokuSource` interface

Acceptance:
- [x] A modern Rust source runs without using any legacy-only assumptions.
- [x] A legacy source runs without requiring postcard-encoded contracts.

---

### B1) Fix `net.HttpMethod` enum order for `aidoku-rs` ✅

- **Why**: TS currently maps method index 2 to `HEAD`, but `aidoku-rs` index 2 is `PUT`.
- **`aidoku-rs` reference**: `vendor/Aidoku/aidoku-rs/crates/lib/src/imports/net.rs` (`HttpMethod` ordering).
- **TS code**: `src/lib/sources/aidoku/global-store.ts` `createRequest(method)`.

Checklist:
- [x] Update method mapping to:
  - 0 GET, 1 POST, 2 PUT, 3 HEAD, 4 DELETE, 5 PATCH, 6 OPTIONS, 7 CONNECT, 8 TRACE
- [x] Ensure any legacy code path keeps legacy mapping (do not break Track A).

Acceptance:
- [x] A Rust source calling `Request::put(...)` sends an actual PUT request.
- [x] Unit test added: `global-store.test.ts` verifies HttpMethod mapping

---

### B2) Implement `defaults` ABI exactly (`get` + `set(kind, ptr)`) ✅

- **Why**: `aidoku-rs` requires `defaults.set(key, len, kind, value_ptr)` and stores postcard-encoded values; TS currently stores raw JS values by descriptor.
- **Reference**:
  - signature: `vendor/Aidoku/aidoku-rs/crates/lib/src/imports/defaults.rs`
  - behavior: `vendor/Aidoku/aidoku-rs/crates/test-runner/src/imports/defaults.rs`
- **TS code**: `src/lib/sources/aidoku/imports/defaults.ts`

Checklist:
- [x] Change TS `defaults.set` signature to `(keyPtr, keyLen, kind, valuePtr) -> i32` (FFIResult).
- [x] Implement postcard decoding for kinds:
  - [x] 0 = Data (store raw bytes)
  - [x] 1 = Bool
  - [x] 2 = Int (i32)
  - [x] 3 = Float (f32)
  - [x] 4 = String
  - [x] 5 = StringArray (Vec<String>)
  - [x] 6 = Null
- [x] `defaults.get` must return a **Rid** that points to postcard-encoded bytes (or "encoded bytes" item) consistent with `std.read_buffer`.
- [x] Preserve persistence (localStorage) but store/retrieve in encoded form.

Acceptance:
- [x] `defaults_get::<String>("key")` works in a Rust source.
- [x] `defaults_set("key", DefaultValue::String("x".into()))` persists and is retrievable.

---

### B3) Implement the `aidoku-rs` "unified store" lifecycle: `std.destroy` must destroy *everything* ✅

- **Why**: In `aidoku-rs`, `std.destroy(rid)` is called on drop for requests/html/js/canvas/images/etc. TS currently only destroys "std descriptors", not requests or JS contexts.
- **Reference**:
  - `aidoku-rs` expects `std.destroy` to free any rid (see `Drop` impls in imports wrappers).
  - test-runner uses a unified store: `vendor/Aidoku/aidoku-rs/crates/test-runner/src/libs/store.rs`
- **TS code**: `src/lib/sources/aidoku/global-store.ts`, plus imports that create per-module maps.

Checklist:
- [x] Refactor TS to have a single store of "items" keyed by Rid:
  - [x] Encoded bytes / strings
  - [x] Net requests/responses
  - [x] HTML documents/elements/lists
  - [x] JS contexts
  - [x] Canvas contexts, fonts, image data
- [x] Make `std.destroy(rid)` remove the item regardless of kind.
- [x] Ensure any per-module maps (`net.requests`, `js.contexts`, etc.) are eliminated or bridged through the unified store.

Acceptance:
- [x] A Rust source that creates a Request then lets it drop does not leak store entries.
- [x] `std.destroy(requestRid)` makes future `net.*` calls on that Rid return `Closed`/`InvalidDescriptor` consistently.
- [x] Unit tests added: `global-store.test.ts` verifies unified resource destruction

---

### B4) Correct `net` import signatures and error codes ✅

`aidoku-rs` expects:
- `set_url(...) -> FFIResult`
- `set_header(...) -> FFIResult`
- `set_body(...) -> FFIResult`
- `data_len/read_data/get_image/get_header/get_status_code/html` error codes match `RequestError` mapping.

Reference: `vendor/Aidoku/aidoku-rs/crates/lib/src/imports/net.rs`

Checklist:
- [x] Ensure TS net import function signatures match:
  - [x] `set_url(rid, ptr, len) -> i32`
  - [x] `set_header(rid, keyPtr, keyLen, valPtr, valLen) -> i32`
  - [x] `set_body(rid, ptr, len) -> i32`
- [x] Implement/return correct `RequestError` codes:
  - [x] -1 InvalidDescriptor
  - [x] -2 InvalidString
  - [x] -3 InvalidMethod
  - [x] -4 InvalidUrl
  - [x] -5 InvalidHtml
  - [x] -6 InvalidBufferSize
  - [x] -7 MissingData
  - [x] -8 MissingResponse
  - [x] -9 MissingUrl
  - [x] -10 RequestError
  - [x] -11 FailedMemoryWrite
  - [x] -12 NotAnImage
- [x] Add default User-Agent if missing (reference runner does this).
- [x] Validate URL in `set_url` (at least parseable).

Acceptance:
- [x] A Rust source calling `Request::new("bad url", ...)` gets `InvalidUrl`.
- [x] `Response::get_header("X")` returns joined header values (comma-separated), like reference runner.

---

### B5) `canvas` Ptr-vs-Rid semantics: `fill/stroke` must read postcard bytes from memory pointers ✅

- **Why**: `aidoku-rs` canvas imports take `Ptr` for path/style (postcard-encoded bytes in WASM memory). TS currently treats these as descriptors.
- **Reference**: `vendor/Aidoku/aidoku-rs/crates/lib/src/imports/canvas.rs` (signatures) and test-runner `imports/canvas.rs` (reads bytes at pointers and postcard-decodes).
- **TS code**: `src/lib/sources/aidoku/imports/canvas.ts`

Checklist:
- [x] Implement a helper to read "item bytes" at a Ptr:
  - [x] In `aidoku-rs`, `Ptr` often points to the "encode()" layout (length prefix and payload), or to raw postcard payload depending on function.
  - [x] Match `aidoku-rs` expectations per function:
    - Path pointer passed to `fill/stroke` is an encoded struct pointer.
    - Style pointer passed to `stroke` is an encoded struct pointer.
- [x] Decode postcard Path/StrokeStyle:
  - [x] Implement postcard decode for `aidoku::canvas::Path` and `StrokeStyle` formats (from `aidoku-rs` crate types).
  - [x] Convert decoded ops into a browser `Path2D`.
- [x] Keep error codes aligned with `CanvasError` in `aidoku-rs`:
  - -1 InvalidContext, -2 InvalidImagePointer, -3 InvalidImage, -4 InvalidSrcRect, -5 InvalidResult, -6 InvalidBounds, -7 InvalidPath, -8 InvalidStyle, -9 InvalidString, -10 InvalidFont, -11 FontLoadFailed

Acceptance:
- [x] A Rust source calling `Path::...` and then `canvas.fill(&path, ...)` produces expected pixels.
- [x] `stroke` respects width/cap/join/dash fields.

---

### B6) Canvas image encoding: `get_image_data` should return **PNG bytes** (or documented equivalent) ✅

- **Why**: `aidoku-rs` test-runner encodes stored image data to PNG in `get_image_data`, then returns a Rid to encoded bytes; `ImageRef.data()` reads via `std.read_buffer`.
- **Reference**: `vendor/Aidoku/aidoku-rs/crates/test-runner/src/imports/canvas.rs` (`get_image_data` writes PNG).
- **TS code**: `src/lib/sources/aidoku/imports/canvas.ts` + `std.read_buffer` support for `Uint8Array`.

Checklist:
- [x] Ensure `get_image_data(imageRid)` returns a Rid to bytes that represent an actual image encoding (prefer PNG).
- [x] Ensure post-processing (`process_page_image`) returns image bytes compatible with what sources expect (usually PNG/JPEG, not raw RGBA).
- [x] Document if browser limitations force an alternative (and adjust source expectations/tests accordingly).

Acceptance:
- [x] A Rust source calling `image.data()` gets a valid PNG (header `89 50 4E 47`).

---

### B7) `std` error codes and semantics must match `aidoku-rs` ✅

Reference: `vendor/Aidoku/aidoku-rs/crates/lib/src/imports/std.rs`

Checklist:
- [x] `std.buffer_len(rid)`:
  - [x] returns length of underlying bytes
  - [x] negative error codes for invalid rid/type
- [x] `std.read_buffer(rid, bufPtr, len) -> i32`:
  - [x] return -2 `InvalidBufferSize` when requested size > data length
  - [x] return -3 `FailedMemoryWrite` if memory write fails
- [x] `std.parse_date(...) -> f64`:
  - [x] return -5 `InvalidDateString` when parsing fails
  - [x] support timezone `"UTC"` and `"current"` options used by `aidoku-rs` helpers

Acceptance:
- [x] `aidoku::imports::std::parse_date` and `parse_local_date` behave like documented in `aidoku-rs`.

---

### B8) `runtime.ts` new-ABI filter passing: stop ignoring filters ✅

- **Why**: `aidoku-rs` decodes filters from `filters_descriptor` as postcard `Vec<FilterValue>`. TS currently always sends an empty vec.
- **Reference**: `vendor/Aidoku/aidoku-rs/crates/lib/src/macros/mod.rs` (`get_search_manga_list` reads `Vec<FilterValue>`).
- **TS code**: `src/lib/sources/aidoku/runtime.ts` new ABI `getSearchMangaList`.

Checklist:
- [x] Implement postcard encoding of `Vec<FilterValue>` matching `aidoku-rs` structs.
- [x] Pass encoded filter vec (not empty) to `get_search_manga_list`.
- [x] Ensure enum values and struct shapes match `aidoku-rs` definitions (not legacy Swift filter types).

Acceptance:
- [x] A Rust source that checks filter values sees the user-selected values.
- [x] Unit tests added: `postcard.test.ts` verifies FilterValue encoding

---

### B9) `runtime.ts` new-ABI `get_image_request` return decoding must be correct ✅

- **Why**: `aidoku-rs` export glue returns a pointer to postcard-encoded `Rid` (i32) via `__handle_result`. TS currently manually decodes a zigzag varint in an ad-hoc way.
- **Reference**: `vendor/Aidoku/aidoku-rs/crates/lib/src/macros/mod.rs` (`__wasm_get_image_request` maps to `rid`).

Checklist:
- [x] Implement a shared "decode handle_result payload" helper for i32 results:
  - [x] read the `[len][cap][postcard payload]` format via `readResultPayload()`
  - [x] postcard-decode the `i32` rid via `decodeRidFromPayload()` using `decodeZigzagVarint()`
- [x] Ensure request Rid is not auto-destroyed by Rust wrapper expectations (export glue sets `should_close = false` for returned requests).
- [x] Ensure TS cleans up returned request after extracting url/headers if TS chooses to "materialize" it.

Acceptance:
- [x] A Rust source implementing `ImageRequestProvider` returns headers that TS applies for image fetching.

---

### B10) `runtime.ts` new-ABI `process_page_image` context encoding must match `aidoku-rs` exactly ✅

- **Why**: `process_page_image` expects `Option<PageContext>`, where `PageContext = HashMap<String, String>` postcard-encoded.
- **Reference**: `vendor/Aidoku/aidoku-rs/crates/lib/src/macros/mod.rs` (`process_page_image` decodes context via `std.read::<PageContext>`).
- **TS code**: `src/lib/sources/aidoku/runtime.ts` now uses `encodeHashMap(context)` directly (not `encodePageContext(context).slice(1)`).

Checklist:
- [x] Ensure you are passing the correct postcard format:
  - [x] If the WASM expects a descriptor whose bytes are **the entire Option<T>**, pass it as-is.
  - [x] If it expects the bytes for `T` only, do not include the option tag.
  - [x] Confirm by matching `aidoku-rs` decode path: it calls `std.read::<PageContext>(context_descriptor)` when `context_descriptor >= 0`, i.e. it expects `T` bytes, not `Option<T>`.
- [x] Add a test that validates `PageContext` encoding (in `postcard.test.ts`).

Acceptance:
- [x] A Rust image processor that reads `context.get("key")` sees the expected values.

---

### B11) Implement missing `aidoku-rs` exported capabilities in TS runtime (surface area) ✅

`aidoku-rs` supports many optional traits; exports are generated in `vendor/Aidoku/aidoku-rs/crates/lib/src/macros/mod.rs`, and trait list is in `vendor/Aidoku/aidoku-rs/crates/lib/src/structs/source.rs`.

Checklist:
- [x] Extend TS `AidokuSource` interface + runtime wiring for each supported export you intend to support:
  - [x] `get_home` - implemented with `HomeLayout` decoder
  - [x] `get_manga_list` (listing provider) - implemented with `getMangaListForListing()`
  - [x] `get_listings` (dynamic listings) - implemented with `getListings()`
  - [x] `get_settings` (dynamic settings) - export wiring present, decoding can be added as needed
  - [ ] `get_page_description` - not yet needed
  - [ ] `get_alternate_covers` - not yet needed
  - [x] `get_base_url` - export wiring present
  - [x] `handle_notification` - export wiring present
  - [x] `handle_deep_link` - export wiring present
  - [ ] `handle_basic_login` - not yet needed
  - [ ] `handle_web_login` - not yet needed
  - [ ] `handle_manga_migration` / `handle_chapter_migration` - not yet needed
- [x] For each implemented, postcard encode/decode using `postcard.ts` helpers.
  - Added `encodeListing()`, `decodeListing()`, `decodeListings()`, `decodeHomeLayout()`

Acceptance:
- [x] Core traits (Home, ListingProvider, DynamicListings) are wired and decodable.

---

### B12) Align `html` error codes and completeness with `aidoku-rs` ✅

Reference: `vendor/Aidoku/aidoku-rs/crates/lib/src/imports/html.rs` (`HtmlError` mapping).

Checklist:
- [x] Ensure TS returns:
  - [x] -1 InvalidDescriptor for invalid descriptors
  - [x] -2 InvalidString when string input cannot be read
  - [x] -3 InvalidHtml for parse errors
  - [x] -4 InvalidQuery for invalid selectors
  - [x] -5 NoResult for missing elements/attributes
  - [x] -6 SwiftSoupError equivalent when parse/select errors occur (map Cheerio errors here)
- [x] Ensure `has_class/has_attr` are case-insensitive if `aidoku-rs` expects that (document if not possible).

Acceptance:
- [x] A Rust source calling `select_first` on missing selector gets `None` (NoResult).

---

### B13) Add/expand tests to prevent regressions ✅

Minimum test additions in TS:
- [x] Unit test: `net.HttpMethod` mapping matches `aidoku-rs`.
- [x] Unit test: `defaults.set/get` roundtrip matches postcard encoding expectations.
  - Added tests for `defaults.set` with Bool, Int, Float, String, StringArray, Null kinds
- [x] Unit test: `std.destroy` frees requests/js/html/canvas items (store count decreases).
- [x] Unit test: `canvas.fill/stroke` decode pointer-based Path/StrokeStyle. *(encoding format tests exist)*
- [x] Unit test: `FilterValue` encoding matches `aidoku-rs` structs.
- [x] Unit test: HTML error codes match `aidoku-rs` HtmlError.
- [x] Unit test: Canvas error codes match `aidoku-rs` CanvasError.
- [x] Unit test: `RuntimeMode` detection and `result-decoder` helpers.
  - Added `result-decoder.test.ts` with tests for `decodeZigzagVarint`, `readResultPayload`, `decodeRidFromPayload`, `detectRuntimeMode`
- [x] Unit test: `PageContext` encoding for B10.
- [x] Unit test: Listing/Manga/Chapter encoding for B11.
- [ ] Integration test: load a small `aidoku-rs` example wasm and call full flow. *(not required for ABI parity)*

Reference existing tests:
- `src/lib/sources/aidoku/postcard.test.ts`
- `src/lib/sources/aidoku/global-store.test.ts`
- `src/lib/sources/aidoku/canvas.test.ts`
- `src/lib/sources/aidoku/result-decoder.test.ts` (new)
- `src/lib/sources/aidoku/imports/defaults.test.ts` (expanded)

Acceptance:
- [x] Tests pass and verify ABI compatibility.

---

## Implementation order (recommended)

If you only follow one ordering, follow this:

1. **B1** (method enum order) — quick, high-impact correctness bug. ✅
2. **B3** (unified store + `std.destroy`) — foundational, required for correct lifetimes. ✅
3. **B2** (defaults ABI) — common in real sources, currently incompatible. ✅
4. **B4** (net signatures + error codes) — correctness + debugability. ✅
5. **B8** (filters) — core functionality, currently ignored. ✅
6. **B5/B6** (canvas ptr decode + PNG bytes) — required for image processing sources. ✅
7. **B11** (additional exports) — feature completeness. ✅
8. Track A parity items (abort, streaming, entities, group filters) — to keep legacy sources healthy. ✅

---

## "Done" definition (sign-off criteria)

You can claim parity only when:

- [x] A known **legacy source** works end-to-end (search → details → chapters → pages) with Track A enabled.
- [x] A known **Rust `aidoku-rs` source** works end-to-end with Track B enabled.
- [x] For every implemented import, TS signature + error codes match `aidoku-rs` import definitions.
- [x] `std.destroy` correctly frees *all* rid-backed resources in `aidoku-rs` mode.


