"""
Comic Text Detection + OCR Server

Flow: Image → Text Detection → Reading Order → OCR → SSE Stream
- Filters out empty/whitespace-only OCR results
- Streams results as they complete for low latency

Environment variables:
  MODEL_PATH: Path to comictextdetector.pt (default: ./model/comictextdetector.pt)
  VLLM_URL: vLLM server URL (default: http://localhost:8000/v1)
  VLLM_MODEL: Model name (default: jzhang533/PaddleOCR-VL-For-Manga)
  PORT: Server port (default: 8080)
"""

import asyncio
import base64
import io
import os
import sys
import time
from pathlib import Path
from typing import AsyncGenerator, Literal

import httpx
import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR = Path(__file__).parent.resolve()

# Model path - default to local model directory
MODEL_PATH = os.environ.get("MODEL_PATH", str(SCRIPT_DIR / "model" / "comictextdetector.pt"))

# vLLM OCR config
VLLM_URL = os.environ.get("VLLM_URL", "http://localhost:8000/v1")
VLLM_MODEL = os.environ.get("VLLM_MODEL", "jzhang533/PaddleOCR-VL-For-Manga")

# Detection config
INPUT_SIZE = 1024
CLASS_LABELS: list[Literal["eng", "ja", "unknown"]] = ["eng", "ja", "unknown"]

# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(title="Comic Text Detection + OCR")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
detector = None
device = "cpu"
http_client: httpx.AsyncClient | None = None

# ============================================================================
# Models
# ============================================================================

class OCRRequest(BaseModel):
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
    order: int = 0


class DetectionWithText(Detection):
    text: str


# SSE Events
class SSEEvent(BaseModel):
    type: str
    requestId: str


class DetectionsEvent(SSEEvent):
    type: str = "detections"
    detections: list[Detection]
    detectTimeMs: float


class OCRResultEvent(SSEEvent):
    type: str = "ocr"
    order: int
    text: str
    ocrTimeMs: float


class FinalResultEvent(SSEEvent):
    type: str = "result"
    detections: list[DetectionWithText]
    totalTimeMs: float
    detectTimeMs: float
    ocrTimeMs: float


class ErrorEvent(SSEEvent):
    type: str = "error"
    message: str


# ============================================================================
# Model Loading
# ============================================================================

def load_model():
    global detector, device
    
    # Import detector in both environments:
    # - repo: python -m services.ocr.server  -> services.ocr.detector
    # - deployed container: python server.py -> detector (copied alongside server.py)
    try:
        from services.ocr.detector import TextDetector  # type: ignore
    except ModuleNotFoundError:
        from detector import TextDetector  # type: ignore
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading detection model from {MODEL_PATH}")
    print(f"Using device: {device}")
    if device == "cuda":
        print(f"CUDA device: {torch.cuda.get_device_name()}")
    
    detector = TextDetector(
        model_path=MODEL_PATH,
        input_size=INPUT_SIZE,
        device=device,
        conf_thresh=0.25,
        nms_thresh=0.45,
    )
    print(f"Detection model loaded (backend: {detector.backend})")


# ============================================================================
# Utilities
# ============================================================================

def pil_to_cv2(img: Image.Image) -> np.ndarray:
    """Convert PIL Image to OpenCV BGR."""
    import cv2
    arr = np.array(img)
    if len(arr.shape) == 2:
        return cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def crop_region(img: Image.Image, det: dict) -> Image.Image:
    """Crop detection region from image."""
    return img.crop((
        max(0, det["x1"]),
        max(0, det["y1"]),
        min(img.width, det["x2"]),
        min(img.height, det["y2"]),
    ))


def image_to_data_url(img: Image.Image) -> str:
    """Convert PIL Image to base64 data URL."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


def is_empty_text(text: str) -> bool:
    """Check if OCR result is empty/whitespace."""
    return not text or not text.strip()


def sse_event(data: BaseModel) -> str:
    """Format as SSE event."""
    return f"data: {data.model_dump_json()}\n\n"


# ============================================================================
# Detection (raw) + Reading-order (explicit)
# ============================================================================

def run_detection_raw_cv(cv_img: np.ndarray) -> tuple[list[dict], float]:
    """Run text detection only. Does NOT assign reading order."""
    start = time.perf_counter()
    _mask, _mask_refined, blk_list = detector(cv_img)
    detect_time = (time.perf_counter() - start) * 1000

    detections: list[dict] = []
    for blk in blk_list:
        x1, y1, x2, y2 = blk.xyxy
        lang_idx = blk.language if hasattr(blk, "language") else 2
        if isinstance(lang_idx, str):
            lang_idx = {"eng": 0, "ja": 1, "unknown": 2}.get(lang_idx, 2)

        detections.append(
            {
                "x1": int(x1),
                "y1": int(y1),
                "x2": int(x2),
                "y2": int(y2),
                "conf": float(blk.prob) if hasattr(blk, "prob") else 0.9,
                "cls": int(lang_idx),
                "label": CLASS_LABELS[lang_idx] if lang_idx < len(CLASS_LABELS) else "unknown",
            }
        )

    return detections, detect_time


def apply_reading_order(
    detections: list[dict],
    img_gray: np.ndarray,
    reading_direction: Literal["rtl", "ltr"] = "rtl",
    pipeline_params: dict | None = None,
) -> list[dict]:
    """Assign reading order using services/ocr/text_order.py."""
    # Support both module execution and standalone deployed layouts.
    try:
        from services.ocr.text_order import sort_detections_by_reading_order  # type: ignore
    except ModuleNotFoundError:
        from text_order import sort_detections_by_reading_order  # type: ignore

    return sort_detections_by_reading_order(
        detections,
        img_gray=img_gray,
        reading_direction=reading_direction,
        pipeline_params=pipeline_params,
    )


# ============================================================================
# OCR
# ============================================================================

async def ocr_region(client: httpx.AsyncClient, img: Image.Image, order: int) -> tuple[int, str, float]:
    """OCR a single region via vLLM."""
    start = time.perf_counter()
    
    response = await client.post(
        "/chat/completions",
        json={
            "model": VLLM_MODEL,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_to_data_url(img)}},
                    {"type": "text", "text": "OCR:"},
                ]
            }],
            "temperature": 0.0,
            "max_tokens": 256,
        },
        timeout=60.0,
    )
    response.raise_for_status()
    
    text = response.json()["choices"][0]["message"]["content"]
    elapsed = (time.perf_counter() - start) * 1000
    
    return order, text.strip(), elapsed


# ============================================================================
# Main OCR Pipeline (SSE Stream)
# ============================================================================

async def ocr_pipeline(img: Image.Image, request_id: str) -> AsyncGenerator[str, None]:
    """
    Full OCR pipeline with SSE streaming:
    1. Detect text regions
    2. Estimate reading order
    3. OCR each region (stream results)
    4. Filter empty results
    5. Send final combined result
    """
    global http_client
    
    total_start = time.perf_counter()
    
    # 1. Detection (raw)
    if not detector:
        yield sse_event(ErrorEvent(requestId=request_id, message="Model not loaded"))
        return
    
    try:
        import cv2

        cv_img = pil_to_cv2(img)
        detections, detect_time = run_detection_raw_cv(cv_img)
        # 2. Reading order (explicit; used by OCR + returned to client)
        img_gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        detections = apply_reading_order(detections, img_gray=img_gray, reading_direction="rtl")
    except Exception as e:
        yield sse_event(ErrorEvent(requestId=request_id, message=f"Detection failed: {e}"))
        return
    
    # 3. Send detections immediately (with order)
    yield sse_event(DetectionsEvent(
        requestId=request_id,
        detections=[Detection(**d) for d in detections],
        detectTimeMs=round(detect_time, 2),
    ))
    
    if not detections:
        yield sse_event(FinalResultEvent(
            requestId=request_id,
            detections=[],
            totalTimeMs=round((time.perf_counter() - total_start) * 1000, 2),
            detectTimeMs=round(detect_time, 2),
            ocrTimeMs=0,
        ))
        return
    
    # 4. OCR each region in parallel
    if http_client is None:
        http_client = httpx.AsyncClient(base_url=VLLM_URL, timeout=120.0)
    
    crops = [(det["order"], crop_region(img, det), det) for det in detections]
    tasks = [ocr_region(http_client, crop_img, order) for order, crop_img, _ in crops]
    
    # Collect results, streaming as they complete
    ocr_results: dict[int, str] = {}
    ocr_start = time.perf_counter()
    
    for coro in asyncio.as_completed(tasks):
        try:
            order, text, elapsed = await coro
            
            # Skip empty results
            if is_empty_text(text):
                continue
            
            ocr_results[order] = text
            
            # Stream individual OCR result
            yield sse_event(OCRResultEvent(
                requestId=request_id,
                order=order,
                text=text,
                ocrTimeMs=round(elapsed, 2),
            ))
        except Exception as e:
            print(f"OCR error for region: {e}")
    
    ocr_time = (time.perf_counter() - ocr_start) * 1000
    total_time = (time.perf_counter() - total_start) * 1000
    
    # 4. Build final result with only non-empty detections
    final_detections = []
    for order, _, det in crops:
        if order in ocr_results:
            final_detections.append(DetectionWithText(
                **det,
                text=ocr_results[order],
            ))
    
    # Re-assign order to be sequential after filtering
    final_detections.sort(key=lambda d: d.order)
    for i, det in enumerate(final_detections):
        det.order = i
    
    # 5. Send final result
    yield sse_event(FinalResultEvent(
        requestId=request_id,
        detections=final_detections,
        totalTimeMs=round(total_time, 2),
        detectTimeMs=round(detect_time, 2),
        ocrTimeMs=round(ocr_time, 2),
    ))


# ============================================================================
# Endpoints
# ============================================================================

@app.on_event("startup")
async def startup():
    load_model()


@app.on_event("shutdown")
async def shutdown():
    global http_client
    if http_client:
        await http_client.aclose()


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "detector": "loaded" if detector else "not loaded",
        "device": device,
        "cuda": torch.cuda.is_available(),
        "cuda_device": torch.cuda.get_device_name() if torch.cuda.is_available() else None,
        "vllm_url": VLLM_URL,
        "vllm_model": VLLM_MODEL,
    }


@app.post("/detect")
async def detect_only(req: OCRRequest):
    """Detection only (no OCR)."""
    if not detector:
        raise HTTPException(503, "Model not loaded")
    
    try:
        import cv2

        image_bytes = base64.b64decode(req.imageBase64)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        cv_img = pil_to_cv2(img)
        detections, detect_time = run_detection_raw_cv(cv_img)
        
        return {
            "requestId": req.requestId,
            "detections": detections,
            "detectTimeMs": round(detect_time, 2),
            # Alias for older clients; same value.
            "inferenceTimeMs": round(detect_time, 2),
            "device": device,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/ocr")
async def detect_and_ocr(req: OCRRequest):
    """
    Full OCR pipeline with SSE streaming.
    
    Events:
    - detections: Initial detection results
    - ocr: Individual OCR result (streamed as completed)
    - result: Final combined result with filtered detections
    - error: Error message
    """
    if not detector:
        raise HTTPException(503, "Model not loaded")
    
    try:
        image_bytes = base64.b64decode(req.imageBase64)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        return StreamingResponse(
            ocr_pipeline(img, req.requestId),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as e:
        raise HTTPException(500, str(e))


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
