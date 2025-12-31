"""
Shared default parameters for manga panel segmentation + text reading order.

Goal:
- Production uses these defaults automatically (unless overridden).
- Tuner UI loads these defaults so changing defaults is just changing one dict
  or passing an override JSON object.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


# NOTE: Keys match the tuner JSON payload shape.
DEFAULT_TEXT_ORDER_PARAMS: Dict[str, Any] = {
    # Preprocess / working resolution
    "work_height": 1000,
    "contrast_lo": 2.0,
    "contrast_hi": 98.0,
    # LoG (paper)
    "log_gaussian_ksize": 15,
    "laplacian_ksize": 3,
    "threshold_lambda": 20.0,
    "threshold_mean_scale": 1.0,
    "mean_mode": "all",  # "all" | "pos"
    "response_scale": 1.5,
    # Line detector mode (production default)
    "line_detector": "hough_log",  # "hough_log" | "hough_ink"
    # Hough params (3 passes)
    "h1_thresh": 38,
    "h1_max_gap": 12,
    "h2_thresh": 47,
    "h2_max_gap": 9,
    "h3_thresh": 60,
    "h3_max_gap": 6,
    # Prune params
    "long_threshold": 200.0,
    "connect_dist": 45.0,
    "angle_eps_deg": 15.0,
    "overlap_reject_frac": 0.7,
    # Extrapolation params are paper-fixed in code (25/30/30/10/120).
    # Mask
    "mask_thickness": 40,
    "mask_blur_k": 67,
    # XY-cut
    "l1_threshold_ratio": 0.65,
    "l1_min_gap": 20,
    "l1_min_size": 50,
    "l1_max_depth": 10,
    "l1_margin_ratio": 0.05,
    # Layer 2/3 ordering weights
    "layer2_weight": 0.65,
    "layer3_weight": 0.65,
    # Layer 2 ray casting / connectivity
    "l2_num_rays": 36,
    "l2_ray_max_dist": 500,
    "l2_connect_threshold": 100,
    "l2_ray_threshold": 100,
    # Ink preprocessor (only used for line_detector=hough_ink)
    "ink_block_size": 35,
    "ink_C": 10.0,
    "ink_line_len_ratio": 0.08,
    "ink_line_thickness": 3,
    "ink_close_ksize": 5,
}


def merge_text_order_params(overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Merge overrides into defaults (shallow merge)."""
    if not overrides:
        return dict(DEFAULT_TEXT_ORDER_PARAMS)
    merged = dict(DEFAULT_TEXT_ORDER_PARAMS)
    merged.update(overrides)
    return merged


