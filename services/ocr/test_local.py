#!/usr/bin/env python3
"""
Local test script for OCR server.

Usage:
  python test_local.py <image_path>
  python test_local.py test.jpg
  python test_local.py --all  # Test all pages in temp/ocr-test/datasets/local-manga_pages/pages
"""

import argparse
import base64
import json
import sys
from pathlib import Path

import httpx

SERVER_URL = "http://localhost:8080"


def test_health():
    """Test health endpoint."""
    print("Testing /health...")
    r = httpx.get(f"{SERVER_URL}/health", timeout=10)
    print(f"  Status: {r.status_code}")
    print(f"  Response: {json.dumps(r.json(), indent=2)}")
    return r.status_code == 200


def test_detect(image_path: str):
    """Test detection only."""
    print(f"\nTesting /detect on {image_path}...")
    
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    
    r = httpx.post(
        f"{SERVER_URL}/detect",
        json={"imageBase64": img_b64, "requestId": "test-detect"},
        timeout=60,
    )
    
    result = r.json()
    print(f"  Detections: {len(result['detections'])}")
    print(f"  Time: {result['detectTimeMs']}ms")
    print(f"  Device: {result['device']}")
    
    return result


def test_ocr(image_path: str):
    """Test full OCR pipeline with SSE streaming."""
    print(f"\nTesting /ocr (SSE) on {image_path}...")
    
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    
    detections = []
    ocr_results = []
    final_result = None
    
    with httpx.stream(
        "POST",
        f"{SERVER_URL}/ocr",
        json={"imageBase64": img_b64, "requestId": "test-ocr"},
        timeout=120,
    ) as r:
        for line in r.iter_lines():
            if not line.startswith("data: "):
                continue
            
            data = json.loads(line[6:])
            event_type = data["type"]
            
            if event_type == "detections":
                detections = data["detections"]
                print(f"  [detections] {len(detections)} regions in {data['detectTimeMs']}ms")
            
            elif event_type == "ocr":
                ocr_results.append(data)
                text_preview = data["text"][:30] + "..." if len(data["text"]) > 30 else data["text"]
                print(f"  [ocr #{data['order']}] {data['ocrTimeMs']:.0f}ms: {text_preview}")
            
            elif event_type == "result":
                final_result = data
                print(f"\n  [result] {len(data['detections'])} final detections")
                print(f"    Total: {data['totalTimeMs']:.0f}ms")
                print(f"    Detect: {data['detectTimeMs']:.0f}ms")
                print(f"    OCR: {data['ocrTimeMs']:.0f}ms")
            
            elif event_type == "error":
                print(f"  [error] {data['message']}")
    
    # Print final OCR text
    if final_result:
        print("\n  Final text (reading order):")
        for det in final_result["detections"]:
            text = det["text"][:50] + "..." if len(det["text"]) > 50 else det["text"]
            print(f"    {det['order']:2d}. {text}")
    
    return final_result


def main():
    parser = argparse.ArgumentParser(description="Test OCR server locally")
    parser.add_argument("image", nargs="?", help="Image path to test")
    parser.add_argument("--all", action="store_true", help="Test all manga pages")
    parser.add_argument("--detect-only", action="store_true", help="Test detection only")
    args = parser.parse_args()
    
    # Health check first
    if not test_health():
        print("\n❌ Server not healthy. Start it with:")
        print("  ./services/ocr/run.sh")
        print("  # or: python -m services.ocr.server")
        sys.exit(1)
    
    # Get images to test
    images = []
    if args.all:
        manga_dir = Path(__file__).parent.parent.parent / "temp/ocr-test/datasets/local-manga_pages/pages"
        images = sorted(manga_dir.glob("page_*.jpg"))
        if not images:
            print(f"\n❌ No manga pages found in {manga_dir}")
            sys.exit(1)
    elif args.image:
        images = [Path(args.image)]
    else:
        # Default to test.jpg in same directory
        default = Path(__file__).parent / "test.jpg"
        if default.exists():
            images = [default]
        else:
            print("\n❌ No image specified. Usage:")
            print("  python test_local.py <image_path>")
            print("  python test_local.py --all")
            sys.exit(1)
    
    # Run tests
    for img_path in images:
        print(f"\n{'='*60}")
        print(f"Image: {img_path}")
        print("="*60)
        
        if args.detect_only:
            test_detect(str(img_path))
        else:
            test_ocr(str(img_path))
    
    print("\n✅ Tests complete!")


if __name__ == "__main__":
    main()

