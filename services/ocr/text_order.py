"""
Text bubble reading order estimator for manga.

Full implementation of Kovanen et al. "A layered method for determining manga text bubble reading order"
IEEE ICIP 2015 - https://ieeexplore.ieee.org/document/7351614

3-Layer Hierarchical Ordering:
1. Layer 1: Recursive XY splits on panel mask → ordered panel areas
2. Layer 2: Inset panel grouping → text groups within panels  
3. Layer 3: Weighted nearest-neighbor ordering within groups
"""

import math
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Set
import numpy as np

from services.ocr.text_order_defaults import merge_text_order_params  # shared defaults

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

PAPER_MIN_LINE_LENGTH_PX = 174


def _angle_rad(line: Tuple[int, int, int, int]) -> float:
    """Angle in radians in [0, pi) for an undirected line segment."""
    x1, y1, x2, y2 = line
    ang = math.atan2(y2 - y1, x2 - x1)
    ang = ang % math.pi
    return ang


def _angle_diff_rad(a: float, b: float) -> float:
    """Smallest absolute difference between angles in [0, pi)."""
    d = abs(a - b) % math.pi
    return min(d, math.pi - d)


def _is_parallel(a: float, b: float, eps_deg: float = 10.0) -> bool:
    return _angle_diff_rad(a, b) <= math.radians(eps_deg)


def _is_perpendicular(a: float, b: float, eps_deg: float = 10.0) -> bool:
    return abs(_angle_diff_rad(a, b) - (math.pi / 2)) <= math.radians(eps_deg)


def _project_param(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """Projection parameter t for point P onto segment line AB, where A+t*(B-A)."""
    dx, dy = x2 - x1, y2 - y1
    denom = dx * dx + dy * dy
    if denom <= 1e-9:
        return 0.0
    return ((px - x1) * dx + (py - y1) * dy) / denom


def _segment_overlap_1d(a0: float, a1: float, b0: float, b1: float) -> float:
    lo = max(min(a0, a1), min(b0, b1))
    hi = min(max(a0, a1), max(b0, b1))
    return max(0.0, hi - lo)


@dataclass
class TextBox:
    """A text bounding box."""
    x1: float
    y1: float
    x2: float
    y2: float
    label: str = "text"
    conf: float = 1.0
    index: int = -1
    order: int = -1
    
    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2
    
    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2
    
    @property
    def center(self) -> Tuple[float, float]:
        return (self.cx, self.cy)
    
    def distance_to(self, other: 'TextBox') -> float:
        return math.sqrt((self.cx - other.cx)**2 + (self.cy - other.cy)**2)
    
    def distance_to_point(self, x: float, y: float) -> float:
        return math.sqrt((self.cx - x)**2 + (self.cy - y)**2)

    def border_distance_to(self, other: 'TextBox') -> float:
        """
        Minimum Euclidean distance between the perimeters of two axis-aligned rectangles.
        0 if they overlap or touch.
        """
        # Horizontal gap between [x1,x2] intervals
        dx = max(0.0, float(other.x1) - float(self.x2), float(self.x1) - float(other.x2))
        # Vertical gap between [y1,y2] intervals
        dy = max(0.0, float(other.y1) - float(self.y2), float(self.y1) - float(other.y2))
        return math.hypot(dx, dy)


# =============================================================================
# SECTION 2: PANEL SEGMENTATION
# =============================================================================

def _resize_and_contrast_stretch(
    img_gray: np.ndarray,
    target_height: int = 1000,
    contrast_p_low: float = 2.0,
    contrast_p_high: float = 98.0,
) -> Tuple[np.ndarray, float]:
    """
    Shared preprocessing:
    - resize to target height (keep aspect)
    - light contrast stretching (percentile)
    Returns (img_uint8_resized, scale).
    """
    # Ensure grayscale input
    if img_gray.ndim == 3 and HAS_CV2:
        img_gray = cv2.cvtColor(img_gray, cv2.COLOR_BGR2GRAY)
    if img_gray.ndim != 2:
        raise ValueError(f"expected grayscale image (H,W) but got shape {img_gray.shape}")

    h, w = img_gray.shape
    scale = float(target_height) / float(h)
    new_w = int(round(w * scale))
    img_resized = cv2.resize(img_gray, (new_w, int(target_height)))

    p_lo, p_hi = np.percentile(img_resized, (contrast_p_low, contrast_p_high))
    img_stretched = np.clip((img_resized - p_lo) / (p_hi - p_lo + 1e-6) * 255, 0, 255).astype(np.uint8)
    return img_stretched, float(scale)


def preprocess_for_hough(
    img_gray: np.ndarray,
    target_height: int = 1000,
    contrast_p_low: float = 2.0,
    contrast_p_high: float = 98.0,
    log_gaussian_ksize: int = 15,
    laplacian_ksize: int = 3,
    threshold_lambda: float = 20.0,
    threshold_mean_scale: float = 1.0,
    threshold_mean_mode: str = "all",  # "all" or "pos"
    response_scale: float = 1.0,
) -> Tuple[np.ndarray, float]:
    """
    Preprocess image for Hough transform.
    - Resize to target height
    - Contrast stretching
    - LoG edge detection (better than Canny for stylized panel outlines)
    """
    img_stretched, scale = _resize_and_contrast_stretch(
        img_gray,
        target_height=int(target_height),
        contrast_p_low=float(contrast_p_low),
        contrast_p_high=float(contrast_p_high),
    )
    
    # Laplace of Gaussian (LoG) (k=15 per paper).
    # Implemented as Gaussian smoothing (kernel size k) followed by Laplacian.
    #
    # Important: OpenCV's Laplacian aperture size is not the same "k" as the paper's
    # LoG kernel size. The paper's k=15 maps to the Gaussian kernel here; the Laplacian
    # aperture should remain small (e.g. 3) to avoid exploding response magnitudes/noise.
    k = int(log_gaussian_ksize)
    blurred = cv2.GaussianBlur(img_stretched, (k, k), 0)
    log = cv2.Laplacian(blurred, cv2.CV_32F, ksize=int(laplacian_ksize))
    if response_scale != 1.0:
        log = log * float(response_scale)
    
    # Take only the positive direction of the gradient by thresholding the LoG output.
    #
    # Paper threshold (user excerpt):
    #   threshold = λ + (1/N) * Σ p
    # where p indicate the pixel values "in the image" (interpreted as the LoG response image).
    #
    # We then "take only the positive direction of the gradient" by keeping only positive
    # LoG responses above the threshold.
    if threshold_mean_mode not in ("all", "pos"):
        raise ValueError(f"threshold_mean_mode must be 'all' or 'pos', got {threshold_mean_mode!r}")
    if threshold_mean_mode == "pos":
        pos = log[log > 0]
        mean_p = float(pos.mean()) if pos.size else 0.0
    else:
        mean_p = float(log.mean())

    threshold = float(threshold_lambda) + float(threshold_mean_scale) * mean_p
    binary = ((log > 0) & (log > threshold)).astype(np.uint8) * 255
    
    return binary, scale


def preprocess_for_hough_ink(
    img_gray: np.ndarray,
    target_height: int = 1000,
    contrast_p_low: float = 2.0,
    contrast_p_high: float = 98.0,
    adaptive_block_size: int = 35,
    adaptive_C: float = 10.0,
    line_len_ratio: float = 0.08,
    line_thickness: int = 3,
    close_ksize: int = 5,
) -> Tuple[np.ndarray, float]:
    """
    Alternative preprocessor for Hough:
    produce a binary mask where white pixels (~255) are *ink-like long lines*.

    Motivation: LoG is an edge operator → thick borders become double-edges + speckle.
    For line detection, a "stroke/ink" mask is often more stable.
    """
    img_stretched, scale = _resize_and_contrast_stretch(
        img_gray,
        target_height=int(target_height),
        contrast_p_low=float(contrast_p_low),
        contrast_p_high=float(contrast_p_high),
    )

    # Adaptive binarization to get ink (white) on black.
    bs = int(adaptive_block_size)
    if bs % 2 == 0:
        bs += 1
    bs = max(3, bs)
    ink = cv2.adaptiveThreshold(
        img_stretched,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        bs,
        float(adaptive_C),
    )

    # Keep long axis-aligned structures (panel borders), discard most text.
    h, w = ink.shape[:2]
    line_len = max(15, int(round(min(h, w) * float(line_len_ratio))))
    thickness = max(1, int(line_thickness))
    k_h = cv2.getStructuringElement(cv2.MORPH_RECT, (line_len, thickness))
    k_v = cv2.getStructuringElement(cv2.MORPH_RECT, (thickness, line_len))
    hor = cv2.morphologyEx(ink, cv2.MORPH_OPEN, k_h)
    ver = cv2.morphologyEx(ink, cv2.MORPH_OPEN, k_v)
    lines = cv2.bitwise_or(hor, ver)

    # Bridge small gaps.
    ck = int(close_ksize)
    if ck % 2 == 0:
        ck += 1
    ck = max(1, ck)
    if ck > 1:
        k_close = cv2.getStructuringElement(cv2.MORPH_RECT, (ck, ck))
        lines = cv2.morphologyEx(lines, cv2.MORPH_CLOSE, k_close)

    return lines, scale


def detect_panel_lines(
    binary: np.ndarray,
    min_line_length: int = PAPER_MIN_LINE_LENGTH_PX,
    params_list: Optional[List[Tuple[float, float, int, int, int]]] = None,
) -> List[Tuple[int, int, int, int]]:
    """
    Detect panel edge lines using probabilistic Hough transform.
    Run 3 times with varied parameters to minimize missed lines.
    """
    all_lines = []
    
    # Run Hough multiple times with different parameters.
    #
    # Note: `maxLineGap` has a huge effect on whether broken panel borders are returned
    # as multiple fragments (paper Figure 3(b)) vs stitched into one long segment.
    # Keep it conservative here; extrapolation (2.3) is responsible for filling gaps.
    if params_list is None:
        params_list = [
            (1, np.pi / 180, 50, min_line_length, 8),
            (1, np.pi / 180, 40, min_line_length, 8),
            (2, np.pi / 180, 60, min_line_length, 8),
        ]
    
    for rho, theta, threshold, minLen, maxGap in params_list:
        # Paper: segments shorter than 174px are pruned immediately.
        # Enforce a global floor even if params_list contains smaller per-pass values.
        minLen_eff = max(int(minLen), int(min_line_length), int(PAPER_MIN_LINE_LENGTH_PX))
        lines = cv2.HoughLinesP(
            binary,
            rho,
            theta,
            threshold,
            minLineLength=minLen_eff,
            maxLineGap=maxGap,
        )
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                length = math.sqrt((x2-x1)**2 + (y2-y1)**2)
                if length >= float(minLen_eff):
                    all_lines.append((int(x1), int(y1), int(x2), int(y2)))

    # Dedupe exact duplicates across the 3 runs (probabilistic Hough + repeated params).
    uniq = []
    seen = set()
    for x1, y1, x2, y2 in all_lines:
        key = (x1, y1, x2, y2) if (x1, y1) <= (x2, y2) else (x2, y2, x1, y1)
        if key in seen:
            continue
        seen.add(key)
        uniq.append((x1, y1, x2, y2))
    return uniq


def is_horizontal(line: Tuple[int, int, int, int], threshold: float = 0.2) -> bool:
    x1, y1, x2, y2 = line
    if x2 == x1:
        return False
    slope = abs((y2 - y1) / (x2 - x1 + 1e-6))
    return slope < threshold


def is_vertical(line: Tuple[int, int, int, int], threshold: float = 5.0) -> bool:
    x1, y1, x2, y2 = line
    if x2 == x1:
        return True
    slope = abs((y2 - y1) / (x2 - x1 + 1e-6))
    return slope > threshold


def line_length(line: Tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = line
    return math.sqrt((x2-x1)**2 + (y2-y1)**2)


def point_to_segment_dist(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """Distance from point to line segment."""
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.sqrt((px - x1)**2 + (py - y1)**2)
    t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx*dx + dy*dy)))
    proj_x, proj_y = x1 + t * dx, y1 + t * dy
    return math.sqrt((px - proj_x)**2 + (py - proj_y)**2)


def line_intersection(l1: Tuple[int, int, int, int], l2: Tuple[int, int, int, int]) -> Optional[Tuple[float, float]]:
    """Find intersection point of two infinite lines defined by segments."""
    x1, y1, x2, y2 = l1
    x3, y3, x4, y4 = l2
    
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-10:
        return None
    
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    
    ix = x1 + t * (x2 - x1)
    iy = y1 + t * (y2 - y1)
    
    return (ix, iy)


def prune_lines_debug(
    lines: List[Tuple[int, int, int, int]],
    long_threshold: float = 300,
    connect_dist: float = 30,
    angle_eps_deg: float = 10.0,
    overlap_reject_frac: float = 0.6,
    merge_collinear: bool = False,
    merge_angle_eps_deg: float = 5.0,
    merge_dist_eps: float = 8.0,
    merge_gap_eps: float = 0.0,
) -> Tuple[List[Tuple[int, int, int, int]], dict]:
    """
    Paper 2.2 pruning: keep segments that satisfy either rule:
      1) considerably long
      2) connected to another long, non-overlapping segment, and roughly parallel or perpendicular

    Returns (kept_lines, debug_stats).
    """
    if not lines:
        return [], {"total_in": 0, "total_out": 0}

    in_total = len(lines)
    merged_applied = False

    # Paper doesn't mention merging; keep optional for experimentation.
    if merge_collinear:
        merged_applied = True
        lines = merge_collinear_segments(
            lines,
            angle_eps_deg=merge_angle_eps_deg,
            dist_eps=merge_dist_eps,
            gap_eps=merge_gap_eps,
        )

    # Precompute long lines.
    long_idxs = [i for i, l in enumerate(lines) if line_length(l) > long_threshold]
    long_lines = [lines[i] for i in long_idxs]

    kept: Set[int] = set()
    kept_rule1 = 0
    kept_rule2_parallel = 0
    kept_rule2_perp = 0
    rule2_connected = 0
    rule2_angle_match = 0
    rule2_overlap_reject = 0

    for i, line in enumerate(lines):
        # Rule 1
        if line_length(line) > long_threshold:
            kept.add(i)
            kept_rule1 += 1
            continue

        # Rule 2
        x1, y1, x2, y2 = line
        a1 = _angle_rad(line)
        for long_line in long_lines:
            lx1, ly1, lx2, ly2 = long_line
            a2 = _angle_rad(long_line)

            # Connectivity: either endpoint near the other segment.
            d1 = min(
                point_to_segment_dist(x1, y1, lx1, ly1, lx2, ly2),
                point_to_segment_dist(x2, y2, lx1, ly1, lx2, ly2),
            )
            if d1 >= connect_dist:
                continue

            rule2_connected += 1

            if _is_parallel(a1, a2, eps_deg=angle_eps_deg):
                rule2_angle_match += 1
                # "non-overlapping" heuristic: reject if the short lies mostly on top of the long.
                t1 = _project_param(x1, y1, lx1, ly1, lx2, ly2)
                t2 = _project_param(x2, y2, lx1, ly1, lx2, ly2)
                t_lo, t_hi = min(t1, t2), max(t1, t2)
                overlap = _segment_overlap_1d(t_lo, t_hi, 0.0, 1.0)
                span = max(1e-6, t_hi - t_lo)
                if overlap / span >= overlap_reject_frac:
                    rule2_overlap_reject += 1
                    continue
                kept.add(i)
                kept_rule2_parallel += 1
                break

            if _is_perpendicular(a1, a2, eps_deg=angle_eps_deg):
                rule2_angle_match += 1
                kept.add(i)
                kept_rule2_perp += 1
                break

    out = [lines[i] for i in kept]
    stats = {
        "total_in": in_total,
        "total_after_merge": len(lines),
        "merge_applied": merged_applied,
        "long_lines": len(long_lines),
        "kept_total": len(out),
        "kept_rule1_long": kept_rule1,
        "kept_rule2_parallel": kept_rule2_parallel,
        "kept_rule2_perp": kept_rule2_perp,
        "rule2_connected_checks": rule2_connected,
        "rule2_angle_matches": rule2_angle_match,
        "rule2_overlap_rejects": rule2_overlap_reject,
    }
    return out, stats


def prune_lines(
    lines: List[Tuple[int, int, int, int]],
    long_threshold: float = 300,
    connect_dist: float = 30,
    angle_eps_deg: float = 10.0,
    overlap_reject_frac: float = 0.6,
    merge_collinear: bool = False,
    merge_angle_eps_deg: float = 5.0,
    merge_dist_eps: float = 8.0,
    merge_gap_eps: float = 0.0,
) -> List[Tuple[int, int, int, int]]:
    kept, _stats = prune_lines_debug(
        lines,
        long_threshold=long_threshold,
        connect_dist=connect_dist,
        angle_eps_deg=angle_eps_deg,
        overlap_reject_frac=overlap_reject_frac,
        merge_collinear=merge_collinear,
        merge_angle_eps_deg=merge_angle_eps_deg,
        merge_dist_eps=merge_dist_eps,
        merge_gap_eps=merge_gap_eps,
    )
    return kept


def merge_collinear_segments(
    lines: List[Tuple[int, int, int, int]],
    angle_eps_deg: float = 5.0,
    dist_eps: float = 8.0,
    gap_eps: float = 25.0,
) -> List[Tuple[int, int, int, int]]:
    """
    Merge collinear and nearly touching/overlapping segments into longer segments.
    This reduces duplicated Hough fragments.
    """
    if not lines:
        return []
    remaining = list(lines)
    merged: List[Tuple[int, int, int, int]] = []

    while remaining:
        base = remaining.pop()
        bx1, by1, bx2, by2 = base
        base_ang = _angle_rad(base)

        # Represent cluster as endpoints in 2D, and a reference line.
        cluster = [base]
        changed = True
        while changed:
            changed = False
            new_remaining = []
            for cand in remaining:
                ax = _angle_rad(cand)
                if not _is_parallel(base_ang, ax, eps_deg=angle_eps_deg):
                    new_remaining.append(cand)
                    continue

                # Check if cand is close to base infinite line and not too far in gap.
                cx1, cy1, cx2, cy2 = cand
                d = min(
                    point_to_segment_dist(cx1, cy1, bx1, by1, bx2, by2),
                    point_to_segment_dist(cx2, cy2, bx1, by1, bx2, by2),
                    point_to_segment_dist(bx1, by1, cx1, cy1, cx2, cy2),
                    point_to_segment_dist(bx2, by2, cx1, cy1, cx2, cy2),
                )
                if d > dist_eps:
                    new_remaining.append(cand)
                    continue

                # Check projection overlap / gap along base direction.
                t_b1 = _project_param(bx1, by1, bx1, by1, bx2, by2)
                t_b2 = _project_param(bx2, by2, bx1, by1, bx2, by2)
                t_c1 = _project_param(cx1, cy1, bx1, by1, bx2, by2)
                t_c2 = _project_param(cx2, cy2, bx1, by1, bx2, by2)

                b_lo, b_hi = min(t_b1, t_b2), max(t_b1, t_b2)
                c_lo, c_hi = min(t_c1, t_c2), max(t_c1, t_c2)
                overlap = _segment_overlap_1d(b_lo, b_hi, c_lo, c_hi)
                gap = max(0.0, max(c_lo - b_hi, b_lo - c_hi))

                # Convert gap from param space to pixels (approx using base length).
                base_len = max(1e-6, line_length(base))
                gap_px = gap * base_len
                if overlap > 0 or gap_px <= gap_eps:
                    cluster.append(cand)
                    changed = True
                else:
                    new_remaining.append(cand)
            remaining = new_remaining

        # Merge cluster by taking extreme projections along base direction.
        # Choose endpoints from all endpoints in cluster based on projection t.
        endpoints = []
        for l in cluster:
            x1, y1, x2, y2 = l
            endpoints.append((x1, y1))
            endpoints.append((x2, y2))
        # Use base line as projection reference.
        ts = [(_project_param(x, y, bx1, by1, bx2, by2), x, y) for x, y in endpoints]
        ts.sort(key=lambda v: v[0])
        _, x_min, y_min = ts[0]
        _, x_max, y_max = ts[-1]
        merged.append((int(x_min), int(y_min), int(x_max), int(y_max)))

    return merged


# =============================================================================
# SECTION 2.3: LINE SEGMENT EXTRAPOLATION
# =============================================================================

def has_perpendicular_near_endpoint(line: Tuple[int, int, int, int], 
                                    endpoint: Tuple[float, float],
                                    all_lines: List[Tuple[int, int, int, int]],
                                    dist_threshold: float = 30,
                                    angle_eps_deg: float = 10.0) -> bool:
    """Check if there's a roughly perpendicular line near the given endpoint."""
    ex, ey = endpoint
    a_line = _angle_rad(line)
    
    for other in all_lines:
        if other == line:
            continue
        
        ox1, oy1, ox2, oy2 = other
        # Check distance from endpoint to other segment
        d = point_to_segment_dist(ex, ey, ox1, oy1, ox2, oy2)
        
        if d < dist_threshold:
            a_other = _angle_rad(other)
            if _is_perpendicular(a_line, a_other, eps_deg=angle_eps_deg):
                return True
    
    return False


def find_extrapolation_intersection(start: Tuple[float, float], 
                                    direction: Tuple[float, float],
                                    lines: List[Tuple[int, int, int, int]],
                                    source_line: Tuple[int, int, int, int],
                                    max_dist: float = 1000) -> Optional[Tuple[float, float, float]]:
    """
    Find where extrapolation ray intersects another line segment.
    Returns (x, y, distance) or None.
    """
    sx, sy = start
    dx, dy = direction
    
    best_intersection = None
    best_dist = max_dist
    
    for line in lines:
        if line == source_line:
            continue
        
        lx1, ly1, lx2, ly2 = line
        
        # Ray-segment intersection
        # Ray: P = start + t * direction, t >= 0
        # Segment: Q = (lx1, ly1) + s * (lx2-lx1, ly2-ly1), 0 <= s <= 1
        
        ldx, ldy = lx2 - lx1, ly2 - ly1
        denom = dx * ldy - dy * ldx
        
        if abs(denom) < 1e-10:
            continue
        
        t = ((lx1 - sx) * ldy - (ly1 - sy) * ldx) / denom
        s = ((lx1 - sx) * dy - (ly1 - sy) * dx) / denom
        
        if t > 0 and 0 <= s <= 1:
            ix = sx + t * dx
            iy = sy + t * dy
            dist = math.sqrt((ix - sx)**2 + (iy - sy)**2)
            
            if dist < best_dist:
                best_dist = dist
                best_intersection = (ix, iy, dist)
    
    return best_intersection


def _ray_image_bounds_intersection(
    start: Tuple[float, float],
    direction: Tuple[float, float],
    img_shape: Tuple[int, int],
    max_dist: float,
) -> Optional[Tuple[float, float, float]]:
    """
    Intersect a ray with the image rectangle [0,w-1]x[0,h-1].
    Returns nearest forward intersection (x,y,dist) or None.
    """
    (sx, sy) = start
    (dx, dy) = direction
    h, w = img_shape
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return None

    candidates: List[Tuple[float, float, float]] = []

    def add_t(t: float) -> None:
        if t <= 0:
            return
        ix = sx + t * dx
        iy = sy + t * dy
        if 0 <= ix <= (w - 1) and 0 <= iy <= (h - 1):
            dist = math.hypot(ix - sx, iy - sy)
            if dist <= max_dist:
                candidates.append((ix, iy, dist))

    # x = 0 and x = w-1
    if abs(dx) > 1e-9:
        add_t((0 - sx) / dx)
        add_t(((w - 1) - sx) / dx)
    # y = 0 and y = h-1
    if abs(dy) > 1e-9:
        add_t((0 - sy) / dy)
        add_t(((h - 1) - sy) / dy)

    if not candidates:
        return None
    candidates.sort(key=lambda v: v[2])
    return candidates[0]


def _segment_segment_intersection(
    a: Tuple[float, float],
    b: Tuple[float, float],
    c: Tuple[float, float],
    d: Tuple[float, float],
    eps: float = 1e-6,
) -> Optional[Tuple[float, float]]:
    """
    Proper segment-segment intersection point (excluding collinear overlap handling).
    Returns point if intersects, else None.
    """
    ax, ay = a
    bx, by = b
    cx, cy = c
    dx, dy = d

    r_x, r_y = bx - ax, by - ay
    s_x, s_y = dx - cx, dy - cy
    denom = r_x * s_y - r_y * s_x
    if abs(denom) < eps:
        return None

    qpx, qpy = cx - ax, cy - ay
    t = (qpx * s_y - qpy * s_x) / denom
    u = (qpx * r_y - qpy * r_x) / denom
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (ax + t * r_x, ay + t * r_y)
    return None


def extrapolate_line_segments(lines: List[Tuple[int, int, int, int]],
                              img_shape: Tuple[int, int],
                              extrapolate_check_dist: float = 25,
                              extrapolate_near_dist: float = 30,
                              perp_dist_threshold: float = 30,
                              perp_angle_eps_deg: float = 10.0,
                              cut_dist_threshold: float = 120) -> List[Tuple[int, int, int, int]]:
    """
    Extrapolate loose ends of line segments to create enclosed panel areas.
    
    Per paper Section 2.3:
    - Check 25px after each endpoint for nearby segments
    - Require no perpendicular lines near ends (prevent extrapolating at corners)
    - Continue until intersection with another line
    - Cutting step: if distance difference <120px, cut both lines
    """
    if not lines:
        return []
    
    h, w = img_shape
    # 1) Find loose ends to extrapolate.
    #
    # Paper: probe a point 25px after each end; if that probe point is close to another
    # segment, the end is not considered "loose". Also, do not extrapolate at corners:
    # require no perpendicular lines near the endpoint.
    loose_ends: List[Tuple[Tuple[int, int, int, int], Tuple[float, float], Tuple[float, float]]] = []
    for line in lines:
        x1, y1, x2, y2 = line
        ll = line_length(line)
        if ll < 1:
            continue
        ux, uy = (x2 - x1) / ll, (y2 - y1) / ll
        for endpoint_idx in (0, 1):
            if endpoint_idx == 0:
                ex, ey = float(x1), float(y1)
                dx, dy = -ux, -uy
            else:
                ex, ey = float(x2), float(y2)
                dx, dy = ux, uy

            probe_x = ex + float(extrapolate_check_dist) * dx
            probe_y = ey + float(extrapolate_check_dist) * dy

            near = False
            for other in lines:
                if other == line:
                    continue
                ox1, oy1, ox2, oy2 = other
                if point_to_segment_dist(probe_x, probe_y, ox1, oy1, ox2, oy2) < float(extrapolate_near_dist):
                    near = True
                    break
            if near:
                continue

            if has_perpendicular_near_endpoint(
                line,
                (ex, ey),
                lines,
                dist_threshold=float(perp_dist_threshold),
                angle_eps_deg=float(perp_angle_eps_deg),
            ):
                continue

            loose_ends.append((line, (ex, ey), (dx, dy)))

    # 2) Extrapolate each loose end until intersection with another ORIGINAL line segment.
    # (Allow extrapolated lines to pass through other extrapolated lines; cutting resolves.)
    max_dist = float(max(h, w) * 2)
    extrapolated: List[Tuple[float, float, float, float]] = []
    for src_line, (sx, sy), (dx, dy) in loose_ends:
        hit = find_extrapolation_intersection((sx, sy), (dx, dy), lines, src_line, max_dist=max_dist)
        if hit is None:
            # No line hit; fall back to image bounds intersection.
            hit = _ray_image_bounds_intersection((sx, sy), (dx, dy), (h, w), max_dist=max_dist)
        if hit is None:
            continue
        ix, iy, _dist = hit
        ix = max(0.0, min(float(w - 1), float(ix)))
        iy = max(0.0, min(float(h - 1), float(iy)))
        if math.hypot(ix - sx, iy - sy) > 1.0:
            extrapolated.append((sx, sy, ix, iy))

    # 3) Cutting step between extrapolated lines.
    #
    # Paper: for each extrapolation intersection, only the line with start closer to the
    # intersection continues. If start-distance difference < 120px, both are cut.
    if extrapolated:
        end_t = [1.0 for _ in extrapolated]  # fraction along each extrapolated segment

        for i in range(len(extrapolated)):
            ax1, ay1, ax2, ay2 = extrapolated[i]
            a0 = (ax1, ay1)
            a1 = (ax2, ay2)
            avx, avy = ax2 - ax1, ay2 - ay1
            a_len2 = avx * avx + avy * avy
            if a_len2 < 1e-9:
                continue

            for j in range(i + 1, len(extrapolated)):
                bx1, by1, bx2, by2 = extrapolated[j]
                b0 = (bx1, by1)
                b1 = (bx2, by2)

                p = _segment_segment_intersection(a0, a1, b0, b1)
                if p is None:
                    continue

                px, py = p
                d_i = math.hypot(px - ax1, py - ay1)
                d_j = math.hypot(px - bx1, py - by1)

                # Determine t along segment i/j to the intersection.
                t_i = _project_param(px, py, ax1, ay1, ax2, ay2)
                t_j = _project_param(px, py, bx1, by1, bx2, by2)
                if not (0.0 <= t_i <= 1.0 and 0.0 <= t_j <= 1.0):
                    continue

                if abs(d_i - d_j) < float(cut_dist_threshold):
                    end_t[i] = min(end_t[i], t_i)
                    end_t[j] = min(end_t[j], t_j)
                else:
                    if d_i > d_j:
                        end_t[i] = min(end_t[i], t_i)
                    else:
                        end_t[j] = min(end_t[j], t_j)

        cut_extrapolated: List[Tuple[int, int, int, int]] = []
        for (sx, sy, ex, ey), t in zip(extrapolated, end_t):
            t = max(0.0, min(1.0, float(t)))
            cx = sx + (ex - sx) * t
            cy = sy + (ey - sy) * t
            if math.hypot(cx - sx, cy - sy) > 10.0:
                cut_extrapolated.append((int(round(sx)), int(round(sy)), int(round(cx)), int(round(cy))))
        return lines + cut_extrapolated

    return lines


def create_panel_mask(
    lines: List[Tuple[int, int, int, int]],
    img_shape: Tuple[int, int],
    line_thickness: int = 8,
    blur_size: int = 15,
) -> np.ndarray:
    """
    Create a fuzzy panel edge mask (paper: thick pen + Gaussian blur).
    """
    h, w = img_shape
    mask = np.zeros((h, w), dtype=np.uint8)
    
    for x1, y1, x2, y2 in lines:
        cv2.line(mask, (int(x1), int(y1)), (int(x2), int(y2)), 255, int(line_thickness))

    k = int(blur_size)
    if k % 2 == 0:
        k += 1
    if k < 3:
        k = 3
    mask = cv2.GaussianBlur(mask, (k, k), 0)
    
    return mask


# =============================================================================
# SECTION 3.1: LAYER 1 - CONTOUR-BASED RECURSIVE XY SPLITS
# =============================================================================

Point = Tuple[int, int]


def _poly_y_at_x(poly: List[Point], x: float) -> float:
    """Interpolate y at x for a polyline that is (roughly) monotone in x."""
    if not poly:
        return 0.0
    if len(poly) == 1:
        return float(poly[0][1])
    # Clamp
    xs = [p[0] for p in poly]
    if x <= xs[0]:
        return float(poly[0][1])
    if x >= xs[-1]:
        return float(poly[-1][1])
    for (x1, y1), (x2, y2) in zip(poly[:-1], poly[1:]):
        if (x1 <= x <= x2) or (x2 <= x <= x1):
            if x2 == x1:
                return float(y2)
            t = (x - x1) / (x2 - x1)
            return float(y1 + t * (y2 - y1))
    return float(poly[-1][1])


def _poly_x_at_y(poly: List[Point], y: float) -> float:
    """Interpolate x at y for a polyline that is (roughly) monotone in y."""
    if not poly:
        return 0.0
    if len(poly) == 1:
        return float(poly[0][0])
    ys = [p[1] for p in poly]
    if y <= ys[0]:
        return float(poly[0][0])
    if y >= ys[-1]:
        return float(poly[-1][0])
    for (x1, y1), (x2, y2) in zip(poly[:-1], poly[1:]):
        if (y1 <= y <= y2) or (y2 <= y <= y1):
            if y2 == y1:
                return float(x2)
            t = (y - y1) / (y2 - y1)
            return float(x1 + t * (x2 - x1))
    return float(poly[-1][0])


def _slice_poly_by_y(poly: List[Point], y0: float, y1: float) -> List[Point]:
    """Slice a top->bottom polyline between y0 and y1 (inclusive), interpolating endpoints."""
    if not poly:
        return []
    if y1 < y0:
        y0, y1 = y1, y0
    out: List[Point] = []

    def interp(p1: Point, p2: Point, y: float) -> Point:
        x1, y1p = p1
        x2, y2p = p2
        if y2p == y1p:
            return (int(x2), int(y))
        t = (y - y1p) / (y2p - y1p)
        x = x1 + t * (x2 - x1)
        return (int(round(x)), int(round(y)))

    # Ensure we walk in increasing y.
    pts = poly if poly[0][1] <= poly[-1][1] else list(reversed(poly))
    for (a, b) in zip(pts[:-1], pts[1:]):
        xa, ya = a
        xb, yb = b
        lo, hi = sorted((ya, yb))
        if hi < y0 or lo > y1:
            continue
        if not out:
            # Add start intersection
            if y0 <= ya <= y1:
                out.append((xa, ya))
            else:
                out.append(interp(a, b, y0))
        # Add intermediate endpoint if within range
        if y0 <= yb <= y1:
            out.append((xb, yb))
        elif ya < y1 < yb or yb < y1 < ya:
            out.append(interp(a, b, y1))
            break
    if out and out[0][1] != int(round(y0)):
        # Force exact y0 by interpolation at the beginning
        x0 = _poly_x_at_y(pts, y0)
        out[0] = (int(round(x0)), int(round(y0)))
    if out and out[-1][1] != int(round(y1)):
        x1x = _poly_x_at_y(pts, y1)
        out[-1] = (int(round(x1x)), int(round(y1)))
    return out


def _slice_poly_by_x(poly: List[Point], x0: float, x1: float) -> List[Point]:
    """Slice a left->right polyline between x0 and x1 (inclusive), interpolating endpoints."""
    if not poly:
        return []
    if x1 < x0:
        x0, x1 = x1, x0
    out: List[Point] = []

    def interp(p1: Point, p2: Point, x: float) -> Point:
        x1p, y1p = p1
        x2p, y2p = p2
        if x2p == x1p:
            return (int(x), int(y2p))
        t = (x - x1p) / (x2p - x1p)
        y = y1p + t * (y2p - y1p)
        return (int(round(x)), int(round(y)))

    pts = poly if poly[0][0] <= poly[-1][0] else list(reversed(poly))
    for (a, b) in zip(pts[:-1], pts[1:]):
        xa, ya = a
        xb, yb = b
        lo, hi = sorted((xa, xb))
        if hi < x0 or lo > x1:
            continue
        if not out:
            if x0 <= xa <= x1:
                out.append((xa, ya))
            else:
                out.append(interp(a, b, x0))
        if x0 <= xb <= x1:
            out.append((xb, yb))
        elif xa < x1 < xb or xb < x1 < xa:
            out.append(interp(a, b, x1))
            break
    if out and out[0][0] != int(round(x0)):
        y0 = _poly_y_at_x(pts, x0)
        out[0] = (int(round(x0)), int(round(y0)))
    if out and out[-1][0] != int(round(x1)):
        y1y = _poly_y_at_x(pts, x1)
        out[-1] = (int(round(x1)), int(round(y1y)))
    return out


def _point_in_poly(poly: List[Point], x: float, y: float) -> bool:
    """Ray-casting point-in-polygon."""
    if len(poly) < 3:
        return False
    inside = False
    x0, y0 = poly[-1]
    for x1, y1 in poly:
        if ((y1 > y) != (y0 > y)) and (x < (x0 - x1) * (y - y1) / (y0 - y1 + 1e-9) + x1):
            inside = not inside
        x0, y0 = x1, y1
    return inside


@dataclass
class PanelRegion:
    """
    A region bounded by four contours (polylines).

    Orientation stored for ease of slicing/interpolation:
    - top:    left->right
    - bottom: left->right
    - left:   top->bottom
    - right:  top->bottom
    """
    top: List[Point]
    right: List[Point]
    bottom: List[Point]
    left: List[Point]
    children: List['PanelRegion'] = field(default_factory=list)

    @property
    def is_leaf(self) -> bool:
        return len(self.children) == 0

    @property
    def bbox(self) -> Tuple[int, int, int, int]:
        xs = [p[0] for p in (self.top + self.right + self.bottom + self.left)]
        ys = [p[1] for p in (self.top + self.right + self.bottom + self.left)]
        return (min(xs), min(ys), max(xs), max(ys))

    @property
    def x1(self) -> int:
        return self.bbox[0]

    @property
    def y1(self) -> int:
        return self.bbox[1]

    @property
    def x2(self) -> int:
        return self.bbox[2]

    @property
    def y2(self) -> int:
        return self.bbox[3]

    @property
    def width(self) -> int:
        return self.x2 - self.x1

    @property
    def height(self) -> int:
        return self.y2 - self.y1

    @property
    def top_right(self) -> Point:
        # top[-1] and right[0] should be the same, but average if slightly off.
        tx, ty = self.top[-1]
        rx, ry = self.right[0]
        return (int(round((tx + rx) / 2)), int(round((ty + ry) / 2)))

    def polygon(self) -> List[Point]:
        # Build clockwise polygon.
        top = self.top
        right = self.right
        bottom = list(reversed(self.bottom))
        left = list(reversed(self.left))
        poly = top + right[1:] + bottom[1:] + left[1:]
        return poly

    def contains(self, x: float, y: float) -> bool:
        return _point_in_poly(self.polygon(), x, y)


# =============================================================================
# XY-CUT PANEL SEGMENTATION (Projection-based, per Kovanen et al. / Tanaka et al.)
# =============================================================================

def _find_projection_splits(
    projection: np.ndarray,
    threshold_ratio: float = 0.3,
    min_gap: int = 20,
    margin: int = 30,
) -> List[int]:
    """
    Find split positions in a 1D projection array.
    
    The projection contains summed mask values along rows (for horizontal splits)
    or columns (for vertical splits). High values indicate panel border presence.
    
    Returns list of split positions (indices into projection).
    """
    if len(projection) < 2 * margin:
        return []
    
    # Normalize projection to 0-1
    proj_min = float(projection.min())
    proj_max = float(projection.max())
    if proj_max - proj_min < 1e-6:
        return []
    proj_norm = (projection - proj_min) / (proj_max - proj_min)
    
    # Find peaks above threshold (potential split lines)
    threshold = threshold_ratio
    candidates: List[int] = []
    
    # Look for local maxima above threshold, avoiding margins
    for i in range(margin, len(proj_norm) - margin):
        if proj_norm[i] >= threshold:
            # Check if local maximum
            window = 5
            start = max(0, i - window)
            end = min(len(proj_norm), i + window + 1)
            if proj_norm[i] >= proj_norm[start:end].max() - 0.01:
                candidates.append(i)
    
    if not candidates:
        return []
    
    # Merge nearby candidates (keep strongest)
    merged: List[int] = []
    i = 0
    while i < len(candidates):
        group = [candidates[i]]
        j = i + 1
        while j < len(candidates) and candidates[j] - candidates[j-1] < min_gap:
            group.append(candidates[j])
            j += 1
        # Keep the one with highest projection value
        best = max(group, key=lambda x: proj_norm[x])
        merged.append(best)
        i = j
    
    return merged


def _make_simple_region(x1: int, y1: int, x2: int, y2: int) -> PanelRegion:
    """Create a simple rectangular PanelRegion."""
    return PanelRegion(
        top=[(x1, y1), (x2, y1)],
        right=[(x2, y1), (x2, y2)],
        bottom=[(x1, y2), (x2, y2)],
        left=[(x1, y1), (x1, y2)],
    )


def recursive_xy_split_projection(
    mask: np.ndarray,
    x1: int, y1: int, x2: int, y2: int,
    min_size: int = 50,
    depth: int = 0,
    max_depth: int = 10,
    threshold_ratio: float = 0.3,
    min_gap: int = 20,
    margin_ratio: float = 0.05,
) -> PanelRegion:
    """
    Paper-faithful recursive XY-cut using projection histograms.
    
    Per Kovanen et al. (referencing Tanaka et al.):
    - Recursively split image with XY-cuts
    - Try horizontal splits first, then vertical
    - Vertical splits ordered right-to-left for manga
    
    This is much simpler than the contour-tracing approach and more robust.
    """
    region = _make_simple_region(x1, y1, x2, y2)
    
    w = x2 - x1
    h = y2 - y1
    
    if depth >= max_depth or w < min_size or h < min_size:
        return region
    
    # Margin in pixels
    margin = max(10, int(min(w, h) * margin_ratio))
    
    # Extract region from mask
    roi = mask[y1:y2, x1:x2]
    if roi.size == 0:
        return region
    
    # Try horizontal split first (sum along columns → row projection)
    h_proj = roi.sum(axis=1).astype(np.float64)
    h_splits = _find_projection_splits(h_proj, threshold_ratio, min_gap, margin)
    
    if h_splits:
        # Convert to absolute y coordinates
        split_ys = [y1 + s for s in h_splits]
        
        # Create children: regions between splits
        boundaries = [y1] + split_ys + [y2]
        children: List[PanelRegion] = []
        
        for i in range(len(boundaries) - 1):
            child_y1 = boundaries[i]
            child_y2 = boundaries[i + 1]
            if child_y2 - child_y1 >= min_size:
                child = recursive_xy_split_projection(
                    mask, x1, child_y1, x2, child_y2,
                    min_size, depth + 1, max_depth,
                    threshold_ratio, min_gap, margin_ratio,
                )
                children.append(child)
        
        if len(children) >= 2:
            region.children = children
            return region
    
    # Try vertical split (sum along rows → column projection)
    v_proj = roi.sum(axis=0).astype(np.float64)
    v_splits = _find_projection_splits(v_proj, threshold_ratio, min_gap, margin)
    
    if v_splits:
        # Convert to absolute x coordinates
        split_xs = [x1 + s for s in v_splits]
        
        # Create children: regions between splits
        # Paper: "vertical splits ordered right-to-left for manga"
        boundaries = [x1] + split_xs + [x2]
        children = []
        
        # Iterate RIGHT-TO-LEFT for manga reading order
        for i in range(len(boundaries) - 2, -1, -1):
            child_x1 = boundaries[i]
            child_x2 = boundaries[i + 1]
            if child_x2 - child_x1 >= min_size:
                child = recursive_xy_split_projection(
                    mask, child_x1, y1, child_x2, y2,
                    min_size, depth + 1, max_depth,
                    threshold_ratio, min_gap, margin_ratio,
                )
                children.append(child)
        
        if len(children) >= 2:
            region.children = children
            return region
    
    return region


def get_leaf_panels(region: PanelRegion) -> List[PanelRegion]:
    """Leaf regions in DFS order."""
    if region.is_leaf:
        return [region]
    out: List[PanelRegion] = []
    for ch in region.children:
        out.extend(get_leaf_panels(ch))
    return out


# =============================================================================
# SECTION 3.2: LAYER 2 - INSET PANEL GROUPING WITH SHAPE APPROXIMATION
# =============================================================================

def optimize_point_to_mask(mask: np.ndarray, x: float, y: float) -> Tuple[float, float]:
    """
    Optimize point position by moving to nearest intensity pool in mask.
    Points on top of lines should fall to closest intensity pool (~30px per paper).
    """
    # Paper intent: move to the nearest intensity pool (~30px).
    # Implement as: minimize intensity; break ties by Euclidean distance to original point.
    ix, iy = int(round(x)), int(round(y))
    best_x, best_y = ix, iy
    if 0 <= iy < mask.shape[0] and 0 <= ix < mask.shape[1]:
        best_val = int(mask[iy, ix])
    else:
        best_val = 255
    best_d2 = 0
    
    # Paper: ~30px neighborhood. We sample every pixel to be faithful (no stride).
    search_radius = 30
    for dy in range(-search_radius, search_radius + 1):
        for dx in range(-search_radius, search_radius + 1):
            ny, nx = iy + dy, ix + dx
            if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1]:
                val = int(mask[ny, nx])
                d2 = dx * dx + dy * dy
                if (val < best_val) or (val == best_val and d2 < best_d2):
                    best_val = val
                    best_d2 = d2
                    best_x, best_y = nx, ny
    
    return float(best_x), float(best_y)


def can_connect_in_mask(
    mask: np.ndarray,
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    threshold: float = 100,
) -> bool:
    """
    Check if two points can be connected with a straight line without crossing panel edges.
    Paper: fuzzy panel edge mask (thick pen + Gaussian blur), so we need an intensity threshold.
    """
    x1, y1 = int(p1[0]), int(p1[1])
    x2, y2 = int(p2[0]), int(p2[1])
    
    # Sample points along the line
    n_samples = max(abs(x2-x1), abs(y2-y1), 1)
    for i in range(n_samples + 1):
        t = i / n_samples
        x = int(x1 + t * (x2 - x1))
        y = int(y1 + t * (y2 - y1))
        
        if 0 <= y < mask.shape[0] and 0 <= x < mask.shape[1]:
            if mask[y, x] > threshold:
                return False
    
    return True


def circular_ray_cast(
    mask: np.ndarray,
    cx: float,
    cy: float,
    num_rays: int = 36,
    max_dist: float = 500,
    threshold: float = 100,
) -> List[Tuple[float, float]]:
    """
    Cast rays in circular direction from centroid until panel outline is hit.
    Returns endpoints where rays hit panel edges in the mask.
    """
    endpoints = []
    
    for i in range(num_rays):
        angle = 2 * math.pi * i / num_rays
        dx = math.cos(angle)
        dy = math.sin(angle)
        
        # March along ray
        for dist in range(1, int(max_dist)):
            x = int(cx + dist * dx)
            y = int(cy + dist * dy)
            
            if not (0 <= y < mask.shape[0] and 0 <= x < mask.shape[1]):
                break
            
            if mask[y, x] > threshold:
                endpoints.append((x, y))
                break
        else:
            # No hit - use max distance point
            x = int(cx + max_dist * dx)
            y = int(cy + max_dist * dy)
            x = max(0, min(mask.shape[1] - 1, x))
            y = max(0, min(mask.shape[0] - 1, y))
            endpoints.append((x, y))
    
    return endpoints


def minimal_enclosing_rect(points: List[Tuple[float, float]]) -> Tuple[float, float, float, float, float, float]:
    """
    Calculate minimal enclosing rectangle around points.
    Returns (center_x, center_y, width, height, min_x, min_y).
    """
    if not points:
        return (0, 0, 0, 0, 0, 0)

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    # Prefer a true minimal-area rectangle (rotated) when OpenCV is available.
    if HAS_CV2:
        pts = np.array(points, dtype=np.float32).reshape((-1, 1, 2))
        (cx, cy), (w, h), _ = cv2.minAreaRect(pts)
        return (float(cx), float(cy), float(w), float(h), float(min_x), float(min_y))

    # Fallback: axis-aligned bounding box.
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    w = max_x - min_x
    h = max_y - min_y
    return (cx, cy, w, h, min_x, min_y)


def group_text_by_connectivity(
    boxes: List[TextBox],
    mask: np.ndarray,
    panel: PanelRegion,
    connect_threshold: float = 100,
) -> List[List[TextBox]]:
    """
    Group text boxes that can be connected with straight lines in the mask.
    Uses BFS to find connected components.
    Optimizes point positions ~30px to nearest intensity pool.
    """
    # Filter boxes that are in this panel (inside the 4-contour region)
    panel_boxes = [b for b in boxes if panel.contains(b.cx, b.cy)]
    
    if not panel_boxes:
        return []
    
    if len(panel_boxes) == 1:
        return [panel_boxes]
    
    # Optimize points to fall to nearest intensity pool (~30px) per paper.
    optimized_centers = []
    for b in panel_boxes:
        opt_x, opt_y = optimize_point_to_mask(mask, b.cx, b.cy)
        optimized_centers.append((opt_x, opt_y))
    
    # Build connectivity graph using optimized centers
    n = len(panel_boxes)
    connected = [[False] * n for _ in range(n)]
    
    for i in range(n):
        for j in range(i+1, n):
            if can_connect_in_mask(
                mask,
                optimized_centers[i],
                optimized_centers[j],
                threshold=float(connect_threshold),
            ):
                connected[i][j] = connected[j][i] = True
    
    # BFS to find groups
    visited = [False] * n
    groups = []
    
    for start in range(n):
        if visited[start]:
            continue
        
        group = []
        queue = [start]
        visited[start] = True
        
        while queue:
            curr = queue.pop(0)
            group.append(panel_boxes[curr])
            
            for next_idx in range(n):
                if not visited[next_idx] and connected[curr][next_idx]:
                    visited[next_idx] = True
                    queue.append(next_idx)
        
        groups.append(group)
    
    return groups


def compute_group_panel_shape(
    group: List[TextBox],
    mask: np.ndarray,
    num_rays: int = 36,
    max_dist: float = 500,
    threshold: float = 100,
) -> Tuple[float, float]:
    """
    Compute the enclosing panel shape for a group using circular ray casting.
    Returns the middle point of the minimal enclosing rectangle.
    """
    # Compute centroid of group
    cx = sum(b.cx for b in group) / len(group)
    cy = sum(b.cy for b in group) / len(group)
    
    # Cast rays to find panel boundaries
    endpoints = circular_ray_cast(
        mask,
        cx,
        cy,
        num_rays=int(num_rays),
        max_dist=float(max_dist),
        threshold=float(threshold),
    )
    
    # Compute minimal enclosing rectangle
    rect_cx, rect_cy, _, _, _, _ = minimal_enclosing_rect(endpoints)
    
    return rect_cx, rect_cy


def order_groups_layer2(
    groups: List[List[TextBox]],
    mask: np.ndarray,
    corner_x: float,
    corner_y: float,
    weight: float = 0.1,
    ray_num_rays: int = 36,
    ray_max_dist: float = 500,
    ray_threshold: float = 100,
) -> List[List[TextBox]]:
    """
    Order layer 2 groups using weighted nearest-neighbor from enclosing panel shapes.
    Uses circular ray casting + minimal enclosing rectangle per paper.
    Weight ~0.1 for layer 2 per paper.
    """
    if len(groups) <= 1:
        return groups
    
    # Compute shape approximation for each group
    group_midpoints = []
    for group in groups:
        mid_x, mid_y = compute_group_panel_shape(
            group,
            mask,
            num_rays=ray_num_rays,
            max_dist=ray_max_dist,
            threshold=ray_threshold,
        )
        group_midpoints.append((mid_x, mid_y, group))
    
    # Normalize distances
    max_corner_dist = max(
        math.sqrt((mx - corner_x)**2 + (my - corner_y)**2)
        for mx, my, _ in group_midpoints
    ) or 1
    
    ordered = []
    remaining = list(group_midpoints)
    
    # Start with group closest to corner
    remaining.sort(key=lambda g: math.sqrt((g[0] - corner_x)**2 + (g[1] - corner_y)**2))
    first = remaining.pop(0)
    ordered.append(first[2])
    prev_x, prev_y = first[0], first[1]
    
    while remaining:
        max_prev_dist = max(
            math.sqrt((mx - prev_x)**2 + (my - prev_y)**2)
            for mx, my, _ in remaining
        ) or 1
        
        best_score = float('inf')
        best_idx = 0
        
        for i, (mx, my, _) in enumerate(remaining):
            da = math.sqrt((mx - corner_x)**2 + (my - corner_y)**2) / max_corner_dist
            db = math.sqrt((mx - prev_x)**2 + (my - prev_y)**2) / max_prev_dist
            score = weight * da + (1 - weight) * db
            
            if score < best_score:
                best_score = score
                best_idx = i
        
        chosen = remaining.pop(best_idx)
        ordered.append(chosen[2])
        prev_x, prev_y = chosen[0], chosen[1]
    
    return ordered


# =============================================================================
# SECTION 3.3: LAYER 3 - WEIGHTED NEAREST NEIGHBOR ORDERING
# =============================================================================

def order_boxes_weighted_nn(
    boxes: List[TextBox],
    corner_x: float,
    corner_y: float,
    weight: float = 0.4,
) -> List[TextBox]:
    """
    Order text boxes using weighted nearest-neighbor.
    
    Score = w * Da + (1-w) * Db
    where:
        Da = distance to right-up corner (normalized)
        Db = distance to previous text bubble (normalized)
        w = 0.3-0.5 works best per paper for Layer 3
    
    This combines "continue from previous" with "prefer right-up corner".
    """
    if len(boxes) <= 1:
        return boxes
    
    # Normalize distances
    max_corner_dist = max(b.distance_to_point(corner_x, corner_y) for b in boxes) or 1
    
    ordered = []
    remaining = list(boxes)
    
    # Start with box closest to right-up corner
    remaining.sort(key=lambda b: b.distance_to_point(corner_x, corner_y))
    ordered.append(remaining.pop(0))
    
    while remaining:
        prev = ordered[-1]
        # Use border-to-border distance for the "continue from previous" term.
        max_prev_dist = max(b.border_distance_to(prev) for b in remaining) or 1
        
        best_score = float('inf')
        best_idx = 0
        
        for i, box in enumerate(remaining):
            # Normalized distances
            da = box.distance_to_point(corner_x, corner_y) / max_corner_dist
            db = box.border_distance_to(prev) / max_prev_dist
            
            score = weight * da + (1 - weight) * db
            
            if score < best_score:
                best_score = score
                best_idx = i
        
        ordered.append(remaining.pop(best_idx))
    
    return ordered


# =============================================================================
# MAIN API
# =============================================================================

@dataclass(frozen=True)
class PanelMaskCache:
    """
    Cached panel mask + resize scale for a page (paper pipeline runs at height=1000).

    This lets us run Layers 1–3 ordering without re-running preprocessing + Hough + prune + extrap.
    """

    panel_mask: np.ndarray
    scale: float
    work_h: int
    work_w: int


def build_panel_mask_cache(
    img_gray: np.ndarray,
    pipeline_params: Optional[dict] = None,
) -> PanelMaskCache:
    """
    Compute and cache the paper-style panel edge mask for a page.

    Includes:
      - preprocessing (LoG thresholding)
      - Hough (3 passes)
      - pruning
      - extrapolation
      - panel-edge mask generation
    """
    if not HAS_CV2:
        raise RuntimeError("OpenCV not available; cannot build panel mask cache.")

    params = merge_text_order_params(pipeline_params)

    target_height = int(params.get("work_height", 1000))
    line_detector = str(params.get("line_detector", "hough_log"))

    if line_detector == "hough_ink":
        binary, scale = preprocess_for_hough_ink(
            img_gray,
            target_height=target_height,
            contrast_p_low=float(params.get("contrast_lo", 2.0)),
            contrast_p_high=float(params.get("contrast_hi", 98.0)),
            adaptive_block_size=int(params.get("ink_block_size", 35)),
            adaptive_C=float(params.get("ink_C", 10.0)),
            line_len_ratio=float(params.get("ink_line_len_ratio", 0.08)),
            line_thickness=int(params.get("ink_line_thickness", 3)),
            close_ksize=int(params.get("ink_close_ksize", 5)),
        )
    else:
        binary, scale = preprocess_for_hough(
            img_gray,
            target_height=target_height,
            contrast_p_low=float(params.get("contrast_lo", 2.0)),
            contrast_p_high=float(params.get("contrast_hi", 98.0)),
            log_gaussian_ksize=int(params.get("log_gaussian_ksize", 15)),
            laplacian_ksize=int(params.get("laplacian_ksize", 3)),
            threshold_lambda=float(params.get("threshold_lambda", 20.0)),
            threshold_mean_scale=float(params.get("threshold_mean_scale", 1.0)),
            # Paper threshold mean is ambiguous (all LoG pixels vs only positive responses).
            threshold_mean_mode=str(params.get("mean_mode", "all")),
            response_scale=float(params.get("response_scale", 1.0)),
        )

    work_h, work_w = binary.shape[:2]

    # Paper: run probabilistic Hough 3 times with varied parameters.
    # Numeric params (threshold/maxGap) are not fully specified; expose as knobs.
    hough_params = [
        (1, math.pi / 180, int(params.get("h1_thresh", 50)), PAPER_MIN_LINE_LENGTH_PX, int(params.get("h1_max_gap", 8))),
        (1, math.pi / 180, int(params.get("h2_thresh", 40)), PAPER_MIN_LINE_LENGTH_PX, int(params.get("h2_max_gap", 8))),
        (2, math.pi / 180, int(params.get("h3_thresh", 60)), PAPER_MIN_LINE_LENGTH_PX, int(params.get("h3_max_gap", 8))),
    ]
    lines = detect_panel_lines(binary, min_line_length=PAPER_MIN_LINE_LENGTH_PX, params_list=hough_params)
    # Paper doesn't mention merging; keep disabled for strict fidelity.
    lines = prune_lines(
        lines,
        # Paper: "considerably long" + "connected near" + angle heuristic; numeric values not specified → knobs.
        long_threshold=float(params.get("long_threshold", 300)),
        connect_dist=float(params.get("connect_dist", 30)),
        angle_eps_deg=float(params.get("angle_eps_deg", 10.0)),
        overlap_reject_frac=float(params.get("overlap_reject_frac", 0.6)),
        merge_collinear=False,
    )
    # Paper defaults (2.3): check_dist=25, near_dist=30, perp_dist=30, cut_dist=120.
    lines = extrapolate_line_segments(lines, (work_h, work_w))
    panel_mask = create_panel_mask(
        lines,
        (work_h, work_w),
        line_thickness=int(params.get("mask_thickness", 8)),
        blur_size=int(params.get("mask_blur_k", 15)),
    )

    return PanelMaskCache(panel_mask=panel_mask, scale=float(scale), work_h=int(work_h), work_w=int(work_w))


def estimate_text_order_from_panel_mask(
    mask_cache: PanelMaskCache,
    detections: List[dict],
    layer2_weight: float = 0.1,
    layer3_weight: float = 0.4,
    ordering_params: Optional[dict] = None,
) -> List[dict]:
    """
    Layers 1–3 ordering using a precomputed (cached) panel-edge mask.
    """
    if not detections or not HAS_CV2:
        return estimate_text_order_simple(detections)

    # Allow knobs for parameters not fixed by the paper.
    # Do NOT allow overriding paper-fixed values (e.g. ~30px pool optimization, connectivity thresholding).
    params = ordering_params or {}
    layer2_weight = float(params.get("layer2_weight", layer2_weight))
    layer3_weight = float(params.get("layer3_weight", layer3_weight))

    scale = mask_cache.scale
    work_h, work_w = mask_cache.work_h, mask_cache.work_w
    panel_mask = mask_cache.panel_mask

    # Scale detections into normalized coordinate system.
    boxes = [
        TextBox(
            x1=float(d["x1"]) * scale,
            y1=float(d["y1"]) * scale,
            x2=float(d["x2"]) * scale,
            y2=float(d["y2"]) * scale,
            label=d.get("label", "text"),
            conf=d.get("conf", 1.0),
            index=i,
        )
        for i, d in enumerate(detections)
    ]

    # --- Layer 1: Recursive XY splits (on cached mask) ---
    # Paper-faithful: projection histogram XY-cut (Kovanen/Tanaka)
    root = recursive_xy_split_projection(
        panel_mask,
        0, 0, work_w, work_h,
        # XY-cut params are not specified by the paper; keep as optional knobs.
        min_size=int(params.get("l1_min_size", 50)),
        max_depth=int(params.get("l1_max_depth", 10)),
        threshold_ratio=float(params.get("l1_threshold_ratio", 0.3)),
        min_gap=int(params.get("l1_min_gap", 20)),
        margin_ratio=float(params.get("l1_margin_ratio", 0.05)),
    )
    
    panels = get_leaf_panels(root)
    if not panels:
        panels = [root]

    # --- Layer 2 & 3: Group and order within panels ---
    final_order: list[TextBox] = []

    for panel in panels:
        corner_x, corner_y = panel.top_right

        groups = group_text_by_connectivity(
            boxes,
            panel_mask,
            panel,
            connect_threshold=float(params.get("l2_connect_threshold", 100)),
        )
        if not groups:
            continue

        ordered_groups = order_groups_layer2(
            groups,
            panel_mask,
            corner_x,
            corner_y,
            weight=layer2_weight,
            # Ray-cast params are not specified by the paper; keep as optional knobs.
            ray_num_rays=int(params.get("l2_num_rays", 36)),
            ray_max_dist=float(params.get("l2_ray_max_dist", 500)),
            ray_threshold=float(params.get("l2_ray_threshold", 100)),
        )

        for group in ordered_groups:
            ordered_group = order_boxes_weighted_nn(
                group,
                corner_x,
                corner_y,
                weight=layer3_weight,
            )
            final_order.extend(ordered_group)

    assigned_indices = {b.index for b in final_order}
    unassigned = [b for b in boxes if b.index not in assigned_indices]
    if unassigned:
        unassigned.sort(key=lambda b: (b.cy, -b.cx))
        final_order.extend(unassigned)

    result: list[dict] = []
    for order, box in enumerate(final_order):
        det = detections[box.index].copy()
        det["idx"] = box.index
        det["order"] = order
        result.append(det)
    return sorted(result, key=lambda d: d["order"])


def estimate_text_order_full(
    img_gray: np.ndarray,
    detections: List[dict],
    layer2_weight: float = 0.1,
    layer3_weight: float = 0.4,
    pipeline_params: Optional[dict] = None,
) -> List[dict]:
    """
    Full 3-layer hierarchical text ordering algorithm.
    
    Args:
        img_gray: Grayscale manga page image (numpy array)
        detections: List of detection dicts with x1, y1, x2, y2
        layer2_weight: Weight for layer 2 ordering (~0.1 per paper)
        layer3_weight: Weight for layer 3 ordering (0.3-0.5 per paper)
    
    Returns:
        Detections with 'order' field added, sorted by reading order
    """
    if not detections or not HAS_CV2:
        return estimate_text_order_simple(detections)
    
    # Paper pipeline is defined on the normalized/resized page (height=1000).
    # Keep the whole panel mask + ordering pipeline in that coordinate system.
    #
    # Final output still refers to the original detection indices (we never reorder the input list).
    _orig_h, _orig_w = img_gray.shape[:2]
    
    params = merge_text_order_params(pipeline_params)
    layer2_weight = float(params.get("layer2_weight", layer2_weight))
    layer3_weight = float(params.get("layer3_weight", layer3_weight))

    mask_cache = build_panel_mask_cache(img_gray, pipeline_params=params)
    return estimate_text_order_from_panel_mask(
        mask_cache,
        detections,
        layer2_weight=layer2_weight,
        layer3_weight=layer3_weight,
        ordering_params=params,
    )


def estimate_text_order_simple(detections: List[dict], page_width: Optional[float] = None) -> List[dict]:
    """
    Simple fallback: weighted nearest-neighbor on whole page.
    Used when OpenCV not available or panel detection fails.
    """
    if not detections:
        return []
    
    boxes = [TextBox(
        x1=d["x1"], y1=d["y1"], x2=d["x2"], y2=d["y2"],
        label=d.get("label", "text"), conf=d.get("conf", 1.0), index=i
    ) for i, d in enumerate(detections)]
    
    # Right-up corner of page
    max_x = max(b.x2 for b in boxes)
    min_y = min(b.y1 for b in boxes)
    
    ordered = order_boxes_weighted_nn(boxes, max_x, min_y, weight=0.4)
    
    result = []
    for order, box in enumerate(ordered):
        det = detections[box.index].copy()
        det["order"] = order
        result.append(det)
    
    return sorted(result, key=lambda d: d["order"])


def sort_detections_by_reading_order(
    detections: List[dict],
    img_gray: Optional[np.ndarray] = None,
    page_width: Optional[float] = None,
    reading_direction: str = "rtl",
    pipeline_params: Optional[dict] = None,
) -> List[dict]:
    """
    Main API function for sorting detections by reading order.
    
    If img_gray provided: uses full 3-layer algorithm with panel detection
    Otherwise: uses simple weighted nearest-neighbor
    """
    if not detections:
        return []
    
    if img_gray is not None and HAS_CV2:
        result = estimate_text_order_full(img_gray, detections, pipeline_params=pipeline_params)
    else:
        result = estimate_text_order_simple(detections, page_width)
    
    if reading_direction == "ltr":
        # Reverse order for left-to-right comics
        max_order = max(d["order"] for d in result)
        for d in result:
            d["order"] = max_order - d["order"]
        result.sort(key=lambda d: d["order"])
    
    return result


# =============================================================================
# TEST
# =============================================================================

if __name__ == "__main__":
    # Test simple ordering
    sample_detections = [
        {"x1": 100, "y1": 50, "x2": 200, "y2": 100, "label": "text"},   # Top left
        {"x1": 300, "y1": 50, "x2": 400, "y2": 100, "label": "text"},   # Top right 
        {"x1": 100, "y1": 200, "x2": 200, "y2": 250, "label": "text"},  # Bottom left
        {"x1": 300, "y1": 200, "x2": 400, "y2": 250, "label": "text"},  # Bottom right
    ]
    
    print("Simple ordering test (no image):")
    ordered = estimate_text_order_simple(sample_detections)
    for d in ordered:
        print(f"  Order {d['order']}: ({d['x1']}, {d['y1']})")
    
    print("\nExpected for manga RTL: top-right(0), top-left(1), bottom-right(2), bottom-left(3)")
