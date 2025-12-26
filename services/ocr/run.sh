#!/bin/bash
# Run OCR service locally
# Usage: ./run.sh [port] [vllm_url]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

PORT="${1:-8080}"
VLLM_URL="${2:-http://localhost:8788/v1}"

echo "Starting OCR service..."
echo "  Port: $PORT"
echo "  vLLM URL: $VLLM_URL"
echo "  Model: model/comictextdetector.pt"

export PORT="$PORT"
export VLLM_URL="$VLLM_URL"

python -m services.ocr.server

