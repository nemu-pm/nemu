# Source Compatibility

This document explains the practical support boundary for source runtimes in Nemu.

## TL;DR

Nemu does not aim to run every upstream Aidoku source or Tachiyomi extension unchanged.

- Aidoku support is limited, but comparatively straightforward.
- Tachiyomi support is significantly more constrained in a browser runtime.
- The app should prefer explicit compatibility data over optimistic assumptions.

If a source works in its original ecosystem but fails in Nemu, that is not automatically a bug in Nemu. In many cases it is a runtime boundary.

## Why Aidoku And Tachiyomi Are Different

### Aidoku

Aidoku sources are generally easier to support because the runtime and interop surface are more tractable for Nemu's browser-oriented execution model.

That does not mean every source will work, but the path to compatibility is clearer.

### Tachiyomi

Tachiyomi support is more experimental and more fragile.

Practical constraints include:

- runtime behavior that requires non-trivial polyfills
- extension code that expects Android-specific or embedded-browser behavior
- APIs that are reasonable in the original environment but not realistically reproducible inside Nemu's browser runtime

Because of that, Tachiyomi should be treated as a constrained compatibility layer, not a promise of broad extension support.

## Mobile Runtime Boundary

The React Native app cannot reuse the current web Tachiyomi adapter directly.
The web path loads `@nemu.pm/tachiyomi-runtime/async`, which creates a Web Worker and uses synchronous XHR inside that worker so Kotlin/JS extension code can keep its blocking HTTP model.

Expo documents web worker bundling as web-only: the native `Worker` API is not available in React Native or provided by the Expo SDK. Native mobile Tachiyomi parity therefore needs a dedicated Expo/native module, or another native-thread bridge, that can provide the same source execution, preferences, HTTP, image request, filter, listing, details, chapters, and page APIs exposed by the web adapter.

The mobile app therefore syncs and caches Tachiyomi package metadata but marks those sources as unsupported for live execution. Do not make them browseable merely because their static metadata or settings are available. On Android, enabling execution requires a native Tachiyomi API/classloader bridge or a compiled-JavaScript package path. On iOS, Tachiyomi APK execution remains unsupported because APK extensions are Android packages; iOS support should use compiled JavaScript packages or another portable package format.

## Why The External Build Pipelines Exist

Nemu relies on external build/report pipelines to produce an explicit list of things that are known to build and are candidates for runtime compatibility.

There are external compatibility/build pipelines for the Aidoku and Tachiyomi ecosystems. The intent is for Nemu to consume their resulting compatibility data instead of pretending that the entire upstream ecosystem is supported.

## Intended Support Policy

In docs and product language, "supported" should mean something narrow and explicit:

- the source or extension builds successfully in the external pipeline
- it is compatible with Nemu's runtime constraints
- it is verified as usable in Nemu, not merely buildable upstream

What Nemu should avoid claiming:

- that all Aidoku sources are supported
- that all Tachiyomi extensions are supported
- that build success alone guarantees runtime success

## Failure Modes That Are Expected

These failure categories are normal and should be documented as compatibility limits rather than generic bugs:

- missing or incomplete polyfills
- Android-specific APIs
- embedded browser behavior that cannot be faithfully reproduced
- network, proxy, CORS, or anti-bot assumptions that differ from the original host app
- runtime differences between native/mobile execution and browser-based execution

## Product And Docs Guidance

When describing source support in Nemu:

- prefer "compatible sources/extensions" over "supports Aidoku/Tachiyomi"
- treat Aidoku and Tachiyomi as separate compatibility tracks
- make it clear that Tachiyomi support is stricter and less complete
- point contributors to compatibility data, not just runtime code

## Ownership Note

The current external compatibility/build infrastructure is intentionally kept outside the main `nemu-pm` organization. This area is operationally and legally sketchier than the main app, especially around source ecosystems and redistribution concerns.

## Future Direction

Longer term, Nemu may support more than manga sources, including animation/video-oriented sources. That should be treated as a future expansion, not an assumption baked into the current runtime docs.
