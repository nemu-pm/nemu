# OCR service

`server.py` is a FastAPI service behind `https://ocr.nemu.pm`:

```
image → comic-text-detector (CTD) → clean-up → text_order.py (reading order)
      → PaddleOCR-VL-For-Manga on vLLM (OpenAI-compatible, "OCR:" prompt) → SSE
```

Endpoints: `GET /health`, `POST /detect` (raw CTD boxes, no clean-up, no order),
`POST /ocr` (full pipeline, SSE). Request body: `{"imageBase64", "requestId", "keepEng"?}`.

## Detection clean-up rules

Applied in `/ocr` before reading order and OCR (`detection_filters.py`). Evidence:
the 2026-09-26 benchmark, `artifacts/mobile-review-20260926/ocr-benchmark/`
(16 pages, 148 dialogue/narration GT blocks).

1. **Near-duplicate boxes are merged.** If two boxes overlap with IoU > 0.6, only the
   larger one is kept (tie: higher confidence, then earlier). CTD sometimes emits two
   boxes for one bubble (IoU ≈ 0.8), and both get OCR'd, so the text appears twice
   (`呼び出し方はノックを3回呼び出し方はノックを3回`). Env: `OCR_DEDUPE_IOU`
   (`1` disables).
2. **`eng` boxes are dropped.** The OCR model and every client are Japanese-only. On
   the benchmark, every box CTD labelled `eng` was a scan-site watermark
   (`6amuraw.com`, `Gomurau.com`, ...). `ja` and `unknown` boxes are always kept.
   To OCR `eng` boxes anyway, send `"keepEng": true` in the `/ocr` request.
3. **Crops are padded by 8 px per side** (clamped to the image). CTD boxes are tight,
   and the model drops a column that the box edge grazes (`我が学園の実習園よ！` →
   `実習園よ！`, `人智を超える…` → `欲すれば…`). Normalised CER with rules 1–2 on:

   | pad | direct MLX, serial | real `server.py` → `mlx_vlm server` |
   |---|---|---|
   | 0 px | 1.63% | 2.9% |
   | 4 px | 1.56% (tiny boxes hallucinate) | – |
   | **8 px** | **1.19%** | **1.6%** |
   | 12 px | 1.04% | 2.7% / 2.4% (two runs); reads the next column's furigana on p10 |
   | 16 px | 2.22% (pulls in neighbouring text and watermarks) | – |

   8 px fixes both truncations in both setups. From 12 px up, crops start taking in
   neighbouring ruby or text. Env: `OCR_CROP_PAD_PX` (`0` disables).

Result with all three rules: real `server.py` → `mlx_vlm server` bf16 (the local
stand-in for vLLM), 2026-09-29. Normalised CER went from 3.8–3.9% to 1.6–1.9%. Noise
detections went from 10 to 4. Page-level CER went from 14.1% to 6.5%. Recall stayed
at 98.6%, and order was 14/16 pages perfect both before and after.

## Region OCR results

Applied to each region's OCR text in `/ocr` (`ocr_text.py`). Evidence: the
2026-09-30 benchmark, `artifacts/mobile-review-20260926/ocr-benchmark/v3-opt/`
(70 pages, 451 text blocks).

1. **Typeset punctuation is restored.** PaddleOCR-VL writes `…` as `...`, `・・・` or
   `･･･`, `〜` as `～`/`~`, and `──` as `――`/`——`. Runs of two or more dots become
   `…` (one per three dots), `～`/`~` become `〜`, and dash runs become `─` of the same
   length. Single marks, `ー` and character width are left alone. End-to-end strict
   CER went from 7.4% to 6.2% (dialogue 3.9% → 2.3%), and no block got worse.
2. **A failed region is retried once, then reported.** Before, an exception from vLLM
   (for example a crashed batch) dropped the region from the result with only a log
   line. Now each region gets `OCR_REGION_ATTEMPTS` tries (default 2, 0.5 s apart). A
   region that still fails is streamed as an `ocr_error` event
   (`{order, message, attempts}`) and listed in the `result` event's `failedRegions`
   (the region's box, its `order` from the `detections` event, `error` and
   `attempts`). Both are additions that existing clients ignore; `detections` in the
   result is unchanged.

`/health` reports `dedupe_iou`, `crop_pad_px` and `region_attempts`, so you can check
what a host runs.

## Dependencies

- `requirements.txt` holds the server's dependencies, pinned to the versions the
  benchmark ran. `opencv-python-headless` stays below 4.13. OpenCV 5 changed
  `HoughLinesP`'s output shape. `text_order.py` now handles both shapes, but
  OpenCV 5 also finds different panel lines, so reading order changes on some pages.
- vLLM is not in `requirements.txt` and is not pinned. vllm 0.30 needs
  `torch==2.13`, `fastapi<0.137`, and `opencv-python-headless>=4.13`, which conflict
  with the server's pins, and no vLLM version has been tested against the host's CUDA.
  `deploy.ts` installs vLLM into the system Python. It installs the server into
  `/app/venv`, created with `--system-site-packages` so the server reuses vLLM's
  CUDA torch.

## Tests

The tests need no GPU and no model. They cover dedupe, the `eng` filter, padding,
both `HoughLinesP` output shapes, symbol restoration and region retries:

```bash
cd services/ocr
python -m venv /tmp/ocr-test && /tmp/ocr-test/bin/pip install pytest numpy "opencv-python-headless==4.12.0.88"
PYTHONDONTWRITEBYTECODE=1 /tmp/ocr-test/bin/python -m pytest -q -p no:cacheprovider tests
```

Pass `tests` explicitly. `test_local.py` is a manual client for a running server,
not a unit test.

## Run locally

```bash
./services/ocr/run.sh 8080 http://localhost:8000/v1   # needs a vLLM (or compatible) endpoint
```

## Redeploy (owner)

```bash
cd services/ocr
bun deploy.ts root@<host> <ssh-port>            # full: sync files, deps, vLLM, server, DNS
bun deploy.ts root@<host> <ssh-port> --server   # restart server.py only
bun deploy.ts root@<host> <ssh-port> --vllm     # restart vLLM only
curl -s https://ocr.nemu.pm/health              # expect dedupe_iou 0.6, crop_pad_px 8
```

A full deploy now also syncs `detection_filters.py`. The first deploy after this
change creates `/app/venv`, installs `requirements.txt` into it, and restarts
`server.py` from `/app/venv/bin/python`.

### If `ocr.nemu.pm` returns Cloudflare 521

A 521 means Cloudflare cannot reach the origin. Check in this order:

1. **Is the vast.ai instance still running, and is its IP unchanged?** `deploy.ts`
   points the proxied A record at the SSH host's IP (`updateDns`). A recreated
   instance gets a new IP, so a full deploy is needed to repoint DNS.
2. **Is the port reachable?** Cloudflare connects on 80/443. `server.py` listens on
   8080, and `deploy.ts` sets up no port mapping or reverse proxy. Confirm the
   instance maps a public 80/443 to 8080, or that the Cloudflare origin rule points
   at the mapped port.
3. **Are the processes up?** On the host, run
   `curl -s localhost:8080/health` and `curl -s localhost:8000/health`, then
   `tail -50 /app/server.log /app/vllm.log`. Neither process is supervised
   (`nohup`), so an instance reboot or an OOM kill leaves them down until someone
   runs `--vllm` / `--server`.
