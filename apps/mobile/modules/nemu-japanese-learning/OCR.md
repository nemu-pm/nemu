# Bundled iOS manga OCR

`recognizePage` runs ogkalu RT-DETRv4-S → text-box suppression → panel-aware
reading order → manga-ocr. Results stream through `onOcrBlock`. The source
image stays on device. Apple Vision remains the fallback if Core ML fails or
the recognition models are absent; recognition-only development bundles can
also use Vision's grouped regions with manga-ocr.

The compiled models total **132.2 MB** (decimal). Release builds require all
three models, the vocabulary, manifest and attribution file. Debug builds
can run without them. `NEMU_OCR_MODELS_OPTIONAL=1` explicitly opts a Release
build into Vision fallback.

## Materialize the models

The source packages are published at
[`nemu-pm/nemu-ocr-coreml`](https://huggingface.co/nemu-pm/nemu-ocr-coreml),
together with their conversion scripts, model card and attribution. From
`apps/mobile`:

```sh
bun run ocr:models
cd ios
pod install
```

`scripts/fetch-ocr-models.ts` downloads the files from the pinned Hub commit
(`HF_REVISION`), checks each one against its pinned SHA-256 and byte size,
compiles them with Xcode's `coremlcompiler`, writes the manifest and checks the
300 MB budget. The verified sources are cached under
`~/Library/Caches/nemu/ocr-models/`, so later runs work offline.
`HF_ENDPOINT` points the download at a mirror.

Other sources, used in this order when given:

- `--from <dir>` or `NEMU_OCR_MODELS_DIR`: a folder containing
  `mangaocr-encoder-int8.mlpackage`, `mangaocr-decoder-int8.mlpackage`,
  `ogkalu-ctbd-v4s-fp16.mlpackage` and `vocab.txt`.
- `NEMU_OCR_MODELS_URL`: a `.tar.gz` of that folder, with an optional
  `NEMU_OCR_MODELS_SHA256`. `--pack <file>` writes one from the verified cache.

To publish new models, rebuild them with the scripts in the Hub repo, upload a
new commit, then update `HF_REVISION` and the pins. Source URLs and notices are
in `OCR-NOTICES.txt`, which is copied into the app resource bundle.

## Detector contract

- Source: `ogkalu/comic-text-and-bubble-detector`,
  `detector-v4-s_int8.onnx` at revision `16e8a622`, dequantized to fp16 Core ML.
- Input: upright RGB image, antialiased PIL bilinear resize to 640×640,
  no letterbox, float32 NCHW `[1,3,640,640]`, divide bytes by 255.
- Outputs: `logits [1,300,3]` and normalized `cx,cy,w,h` `boxes [1,300,4]`.
- Keep max sigmoid probability over text_bubble/text_free (classes 1/2),
  threshold 0.40. Ignore enclosing bubble class 0.
- Clamp to page, minimum width/height 4 pixels. Stable descending score
  order. Suppress IoU > 0.50 or candidate-area containment >= 0.80.
- Crop padding: 4 pixels, rounded to nearest even, clamped to page. Report
  the unpadded text bounds. Reading order uses these unpadded boxes.
- After OCR, drop predominantly Latin output (NFKC, >=3 ASCII letters,
  ASCII letters/digits >= half of nonspace characters), as in the benchmark.

Simulator inference uses CPU only; the benchmark found invalid recognizer
output with simulator GPU inference. Devices use the default accelerated
encoder/detector with the recognizer decoder on CPU. Device latency has not
yet been measured. Memory warnings release both loaded model instances.

## Validation

On macOS with Xcode selected:

```sh
bash modules/nemu-japanese-learning/scripts/validate-ocr.sh test
bash modules/nemu-japanese-learning/scripts/validate-ocr.sh \
  modules/nemu-japanese-learning/ios/Models/NemuMangaOcr \
  /path/to/benchmark/pages /path/to/result.json
```

Set `NEMU_OCR_SIMULATOR=<booted UUID>` to compile/run the same pod sources
inside an iOS simulator. The resulting JSON is compatible with the existing
benchmark evaluator. This harness does not mock detection or supply boxes.
To also exercise the Expo bridge, cache, events and Ichiran, build the app
with `EXPO_PUBLIC_NEMU_JL_ENGINE_SELFTEST=1`; images placed in
`Documents/nemu-engine-selftest/` are processed on launch and the report is
written to `result.json` there. Do not distribute the self-test build.
