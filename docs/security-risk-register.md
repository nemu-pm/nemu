# Security risk register

## `image-size` container-parser denial of service

- **Advisories:** [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
- **Reviewed:** 2026-08-28
- **Review again by:** 2026-09-28
- **Status:** Remediated locally while no patched upstream release exists.

Expo and React Native bring `image-size@1.2.1` into the Metro build toolchain. It processes developer-controlled repository assets while bundling; it is not part of Nemu's mobile runtime and does not parse end-user uploads. Every published `image-size` version is still included in the advisory ranges, so a normal dependency upgrade cannot resolve these findings.

Nemu applies [`patches/image-size@1.2.1.patch`](../patches/image-size@1.2.1.patch). The patch rejects undersized ISO BMFF boxes and malformed ICNS entry lengths before a parser can repeat without advancing. `apps/mobile/src/lib/imageSizeSecurity.test.ts` covers the two non-advancing parser paths and a valid ICNS control case. CI may ignore only the two advisory IDs above after that regression test passes; all other audit findings remain blocking.

Remove the patch and any matching audit exceptions as soon as Expo, React Native, Metro, or `image-size` provides a compatible published fix. Re-run the mobile tests, exports, native builds, and an unfiltered production audit before closing this entry.

## Oversized comic-strip image decoding

- **Reviewed:** 2026-08-28
- **Review again by:** 2026-09-28
- **Status:** Bounded Android compatibility path; iOS remains fail-closed.

Remote images normally remain within a 16,384-pixel side and 8 MiPixel decoded-surface limit. Android additionally accepts a deliberately narrow class of complete, static, non-progressive PNG and baseline JPEG comic strips: at most the caller's encoded-byte limit (and never above the 32 MiB native ceiling), 65,535 pixels on the long side, 2,048 pixels on the short side, 64 MiPixels total, and an aspect ratio of at least 8:1. [`NemuLongStripImagePolicy.kt`](../apps/mobile/modules/nemu-aidoku/runtime/kotlin/NemuLongStripImagePolicy.kt) validates the full container before [`NemuLongStripImageTranscoder.kt`](../apps/mobile/modules/nemu-aidoku/runtime/kotlin/NemuLongStripImageTranscoder.kt) uses serialized Android region decoding. Decode/encode work has a 30-second monotonic deadline and polls cancellation between bounded operations; staged and published artifacts are removed on every observed failure or cancellation.

The high-fidelity path is opt-in only for a one-logical-page reader image. It preserves source width as at most 32 independently reinspected tiles targeting 2 MiPixels each; aggregate source pixels remain at most 64 MiPixels and aggregate encoded output remains inside the caller's byte cap. Tiles do not become reader pages. Cache members use immutable generation-scoped names, and a new unique manifest is moved last as the commit record. Lookup selects the newest fully valid generation; incomplete groups and pre-manifest crash orphans are swept at startup/repair, while mounted generations are retained from quota eviction. Removal and quota accounting treat a manifest and its members as one cache entry.

[`NemuLongStripImageTranscoderInstrumentedTest.kt`](../apps/mobile/modules/nemu-aidoku/runtime/androidTest/NemuLongStripImageTranscoderInstrumentedTest.kt) exercises real 1,114×38,400 single and segmented output, tile seams/final rows, aggregate-budget and cancellation cleanup, serialized-waiter cancellation, and EXIF orientations 2–8 on Android. Parser unit tests cover malformed/truncated, animated, multi-picture, progressive/interlaced, excessive-record, oversized-metadata, and out-of-envelope containers. Cache fault tests cover manifest-last publication, failed replacement preserving the prior generation, missing-member repair, and orphan recovery.

Residual product limitations are explicit: segmented pages use width-first virtualized scrolling; their normalized intra-page position is stored and synced only as an atomic pair with the exact logical-image digest, so changed content safely restores at the top. Whole-page zoom, dual-reader overlays, and Japanese Learning image/OCR tools are disabled because they require one local image and global coordinates. Android necessarily decodes and re-encodes every accepted strip: ancillary PNG metadata and 16-bit channel depth are not preserved, and JPEG output incurs another lossy generation even with contiguous global geometry and MCU-aligned boundaries. If segmented encoding exhausts its byte budget, Android cleans partial tiles and falls back only to the existing compliant single-image transcode; corruption, timeout, cancellation, decoder, and memory failures remain fail-closed.

iOS does not use an ImageIO thumbnail fallback. Public ImageIO APIs do not provide a hard bound on transient full-image decoding, guaranteed region decoding, or cancellation, so accepting the same hostile input could exceed the process memory budget even when the requested output is small. iOS therefore keeps rejecting images outside the normal limits. Platform parity requires a separately reviewed bounded scanline/tiled decoder, strict container inspection, incremental cancellation, bounded output streaming, output revalidation, stale-header removal, and atomic publication. Do not raise the shared decoded-image limits or add a best-effort ImageIO thumbnail path as a workaround.
