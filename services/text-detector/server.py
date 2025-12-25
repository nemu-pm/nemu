"""FastAPI server for comic text detection using ONNX runtime."""

import base64
import io
import time
from typing import Literal

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

MODEL_PATH = "/app/model/comictextdetector.pt.onnx"
INPUT_SIZE = 1024
CLASS_LABELS: list[Literal["eng", "ja", "unknown"]] = ["eng", "ja", "unknown"]

app = FastAPI(title="Comic Text Detector")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global session
session: ort.InferenceSession | None = None
blks_name: str = ""


class DetectRequest(BaseModel):
    imageBase64: str
    requestId: str = ""


class Detection(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    conf: float
    cls: int
    label: Literal["eng", "ja", "unknown"]


class DetectResponse(BaseModel):
    type: str = "detect-done"
    requestId: str
    detections: list[Detection]
    loadTimeMs: float
    inferenceTimeMs: float
    backend: str


def load_model():
    global session, blks_name
    print("Loading model...")
    session = ort.InferenceSession(
        MODEL_PATH,
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    output_names = [o.name for o in session.get_outputs()]
    blks_name = "blk" if "blk" in output_names else output_names[0]
    print(f"Model loaded. Providers: {session.get_providers()}")


def compute_iou(a: dict, b: dict) -> float:
    x1 = max(a["x1"], b["x1"])
    y1 = max(a["y1"], b["y1"])
    x2 = min(a["x2"], b["x2"])
    y2 = min(a["y2"], b["y2"])
    if x2 <= x1 or y2 <= y1:
        return 0
    intersection = (x2 - x1) * (y2 - y1)
    area_a = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"])
    area_b = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
    union = area_a + area_b - intersection
    return intersection / union


def nms(boxes: list[dict], iou_thresh: float) -> list[dict]:
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda x: x["conf"], reverse=True)
    kept = []
    while boxes:
        best = boxes.pop(0)
        kept.append(best)
        boxes = [box for box in boxes if compute_iou(best, box) < iou_thresh]
    return kept


def xywh2xyxy(x: float, y: float, w: float, h: float) -> tuple[float, float, float, float]:
    return (x - w / 2, y - h / 2, x + w / 2, y + h / 2)


def process_yolo_output(
    blks: np.ndarray,
    shape: list[int],
    conf_thresh: float,
    nms_thresh: float,
    img_w: int,
    img_h: int,
    dw: int,
    dh: int,
) -> list[dict]:
    num_boxes = shape[1]
    num_classes = shape[2] - 5

    detections = []
    resize_ratio_x = img_w / (INPUT_SIZE - dw)
    resize_ratio_y = img_h / (INPUT_SIZE - dh)

    for i in range(num_boxes):
        offset = i * shape[2]
        obj_conf = blks[offset + 4]
        if obj_conf < conf_thresh:
            continue

        best_cls = 0
        best_cls_conf = 0.0
        for c in range(num_classes):
            cls_conf = blks[offset + 5 + c]
            if cls_conf > best_cls_conf:
                best_cls_conf = cls_conf
                best_cls = c

        conf = obj_conf * best_cls_conf
        if conf < conf_thresh:
            continue

        bx, by, bw, bh = blks[offset], blks[offset + 1], blks[offset + 2], blks[offset + 3]
        x1, y1, x2, y2 = xywh2xyxy(bx, by, bw, bh)

        detections.append({
            "x1": round(x1 * resize_ratio_x),
            "y1": round(y1 * resize_ratio_y),
            "x2": round(x2 * resize_ratio_x),
            "y2": round(y2 * resize_ratio_y),
            "conf": round(conf * 1000) / 1000,
            "cls": best_cls,
            "label": CLASS_LABELS[best_cls] if best_cls < len(CLASS_LABELS) else "unknown",
        })

    return nms(detections, nms_thresh)


def letterbox(img: Image.Image) -> tuple[np.ndarray, int, int]:
    src_w, src_h = img.size
    r = min(INPUT_SIZE / src_h, INPUT_SIZE / src_w)
    new_w = round(src_w * r)
    new_h = round(src_h * r)
    dw = INPUT_SIZE - new_w
    dh = INPUT_SIZE - new_h

    resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR)
    canvas = Image.new("RGB", (INPUT_SIZE, INPUT_SIZE), (0, 0, 0))
    canvas.paste(resized, (0, 0))

    arr = np.array(canvas, dtype=np.float32) / 255.0
    tensor = arr.transpose(2, 0, 1)
    return tensor, dw, dh


@app.on_event("startup")
async def startup():
    load_model()


@app.post("/detect", response_model=DetectResponse)
async def detect(req: DetectRequest):
    if not session:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        image_bytes = base64.b64decode(req.imageBase64)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img.size

        tensor, dw, dh = letterbox(img)
        input_tensor = tensor[np.newaxis, ...]

        infer_start = time.perf_counter()
        results = session.run([blks_name], {"images": input_tensor})
        inference_time_ms = (time.perf_counter() - infer_start) * 1000

        blks = results[0]
        blks_shape = list(blks.shape)

        detections = process_yolo_output(
            blks.flatten(),
            blks_shape,
            conf_thresh=0.25,
            nms_thresh=0.45,
            img_w=img_w,
            img_h=img_h,
            dw=dw,
            dh=dh,
        )

        return DetectResponse(
            requestId=req.requestId,
            detections=detections,
            loadTimeMs=0,
            inferenceTimeMs=round(inference_time_ms, 2),
            backend="GPU" if "CUDAExecutionProvider" in session.get_providers() else "CPU",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "providers": session.get_providers() if session else []}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")

