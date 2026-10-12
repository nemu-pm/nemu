# Put services/ocr on sys.path so tests import the modules the way the deployed
# container does (flat /app layout: `import detection_filters`, `import text_order`).
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
