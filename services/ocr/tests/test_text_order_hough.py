import numpy as np
import pytest

cv2 = pytest.importorskip("cv2")
import text_order  # noqa: E402


SEGMENTS = [(20, 100, 380, 100), (200, 20, 200, 380)]


def test_hough_segments_accepts_opencv4_shape():
    lines = np.array(SEGMENTS, dtype=np.int32).reshape(-1, 1, 4)  # OpenCV 4.x: (N, 1, 4)
    assert text_order._hough_segments(lines) == SEGMENTS


def test_hough_segments_accepts_opencv5_shape():
    lines = np.array(SEGMENTS, dtype=np.int32)  # OpenCV 5.x: (N, 4)
    assert text_order._hough_segments(lines) == SEGMENTS


def test_hough_segments_handles_none_and_empty():
    assert text_order._hough_segments(None) == []
    assert text_order._hough_segments(np.empty((0, 1, 4), dtype=np.int32)) == []
    assert text_order._hough_segments(np.empty((0, 4), dtype=np.int32)) == []


def test_hough_segments_returns_python_ints():
    out = text_order._hough_segments(np.array([[1.0, 2.0, 3.0, 4.0]], dtype=np.float32))
    assert out == [(1, 2, 3, 4)] and all(type(v) is int for v in out[0])


def _grid_image():
    img = np.zeros((400, 400), np.uint8)
    img[100, 20:380] = 255
    img[20:380, 200] = 255
    return img


def test_detect_panel_lines_with_installed_opencv():
    lines = text_order.detect_panel_lines(_grid_image())
    assert lines, f"no lines found with OpenCV {cv2.__version__}"
    assert all(len(l) == 4 and all(type(v) is int for v in l) for l in lines)


@pytest.mark.parametrize("shape", ["opencv4", "opencv5"])
def test_detect_panel_lines_with_either_output_shape(monkeypatch, shape):
    def fake_hough(*_args, **_kwargs):
        arr = np.array(SEGMENTS, dtype=np.int32)
        return arr.reshape(-1, 1, 4) if shape == "opencv4" else arr

    monkeypatch.setattr(text_order.cv2, "HoughLinesP", fake_hough)
    assert sorted(text_order.detect_panel_lines(_grid_image())) == sorted(SEGMENTS)


@pytest.mark.parametrize("shape", ["opencv4", "opencv5"])
def test_reading_order_end_to_end_survives_either_shape(monkeypatch, shape):
    real = cv2.HoughLinesP

    def shaped_hough(*args, **kwargs):
        out = real(*args, **kwargs)
        if out is None:
            return None
        arr = np.asarray(out).reshape(-1, 4)
        return arr.reshape(-1, 1, 4) if shape == "opencv4" else arr

    monkeypatch.setattr(text_order.cv2, "HoughLinesP", shaped_hough)
    page = np.full((1280, 900), 255, np.uint8)
    cv2.rectangle(page, (20, 20), (880, 620), 0, 4)   # top panel
    cv2.rectangle(page, (20, 660), (880, 1260), 0, 4)  # bottom panel
    dets = [
        {"x1": 100, "y1": 700, "x2": 140, "y2": 900, "conf": 1.0, "cls": 1, "label": "ja"},
        {"x1": 700, "y1": 60, "x2": 740, "y2": 260, "conf": 1.0, "cls": 1, "label": "ja"},
        {"x1": 100, "y1": 60, "x2": 140, "y2": 260, "conf": 1.0, "cls": 1, "label": "ja"},
    ]
    out = text_order.sort_detections_by_reading_order(dets, img_gray=page, reading_direction="rtl")
    order = [(d["x1"], d["y1"]) for d in sorted(out, key=lambda d: d["order"])]
    # Right-to-left within the top panel, then the bottom panel.
    assert order == [(700, 60), (100, 60), (100, 700)]
