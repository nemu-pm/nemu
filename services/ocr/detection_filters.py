"""
Post-detection clean-up applied before OCR.

Pure functions (no torch / FastAPI / GPU) so they can be unit-tested in isolation;
see services/ocr/tests/. The rules and the benchmark evidence behind them are
documented in services/ocr/README.md ("Detection clean-up rules").

Detections are the dicts produced by server.run_detection_raw_cv:
  {"x1", "y1", "x2", "y2", "conf", "cls", "label", ...}
"""

from __future__ import annotations

from typing import Iterable, Sequence

# Near-duplicate threshold. comic-text-detector sometimes emits two boxes for the
# same bubble (IoU ~0.8 on the benchmark pages), and each one gets OCR'd, so the
# bubble's text appears twice. 0.6 is the benchmark's what-if threshold.
DEFAULT_DEDUPE_IOU = 0.6

# CTD language labels whose boxes are not sent to OCR by default. The OCR model
# (PaddleOCR-VL-For-Manga) and every client of this service are Japanese-only; on
# the benchmark pages every `eng` box was a scan-site watermark (e.g. "…muraw.com").
DEFAULT_DROP_LABELS: tuple[str, ...] = ("eng",)

# Crop padding in px per side, clamped to the image. comic-text-detector boxes are
# tight, and PaddleOCR-VL drops an edge column when the box grazes it
# (我が学園の実習園よ！ -> 実習園よ！). 8 px fixes those truncations; 12+ px starts
# pulling neighbouring furigana/text into the crop. Numbers in README.md.
DEFAULT_CROP_PAD_PX = 8


def box_area(d: dict) -> int:
    return max(0, int(d["x2"]) - int(d["x1"])) * max(0, int(d["y2"]) - int(d["y1"]))


def box_iou(a: dict, b: dict) -> float:
    ix = max(0, min(a["x2"], b["x2"]) - max(a["x1"], b["x1"]))
    iy = max(0, min(a["y2"], b["y2"]) - max(a["y1"], b["y1"]))
    inter = ix * iy
    union = box_area(a) + box_area(b) - inter
    return inter / union if union > 0 else 0.0


def dedupe_detections(detections: Sequence[dict], iou_threshold: float = DEFAULT_DEDUPE_IOU) -> list[dict]:
    """Drop near-duplicate boxes (IoU > iou_threshold), keeping the larger box.

    Larger wins because the smaller duplicate is the one more likely to clip a
    column; ties go to the higher confidence, then to the earlier detection.
    Survivors keep their original relative order. A threshold >= 1 disables it.
    """
    if iou_threshold >= 1 or len(detections) < 2:
        return list(detections)
    ranked = sorted(
        range(len(detections)),
        key=lambda i: (-box_area(detections[i]), -float(detections[i].get("conf", 0.0)), i),
    )
    kept: list[int] = []
    for i in ranked:
        if all(box_iou(detections[i], detections[k]) <= iou_threshold for k in kept):
            kept.append(i)
    return [detections[i] for i in sorted(kept)]


def drop_labels(detections: Iterable[dict], labels: Iterable[str] = DEFAULT_DROP_LABELS) -> list[dict]:
    """Remove detections whose CTD language label is in `labels` (default: `eng`)."""
    drop = set(labels)
    return [d for d in detections if d.get("label") not in drop]


def padded_box(det: dict, width: int, height: int, pad: int) -> tuple[int, int, int, int]:
    """Box grown by `pad` px on every side and clamped to the image."""
    return (
        max(0, int(det["x1"]) - pad),
        max(0, int(det["y1"]) - pad),
        min(int(width), int(det["x2"]) + pad),
        min(int(height), int(det["y2"]) + pad),
    )
