import detection_filters as df


def det(x1, y1, x2, y2, label="ja", conf=1.0, **extra):
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "conf": conf, "label": label, **extra}


# --- IoU -------------------------------------------------------------------

def test_iou_identical_disjoint_and_partial():
    a = det(0, 0, 10, 10)
    assert df.box_iou(a, a) == 1.0
    assert df.box_iou(a, det(20, 20, 30, 30)) == 0.0
    # 5x10 overlap, union 150
    assert abs(df.box_iou(a, det(5, 0, 15, 10)) - 50 / 150) < 1e-9


def test_iou_degenerate_box_is_zero():
    assert df.box_iou(det(5, 5, 5, 5), det(5, 5, 5, 5)) == 0.0


# --- dedupe ----------------------------------------------------------------

def test_dedupe_benchmark_pairs_keep_the_larger_box():
    # Real near-duplicates from the benchmark (hanako p02 and p13, IoU ~0.8).
    p02_big, p02_small = det(165, 110, 223, 234, text="a"), det(160, 110, 215, 233, text="b")
    p13_big, p13_small = det(730, 102, 804, 250), det(731, 106, 792, 250)
    assert df.box_iou(p02_big, p02_small) > 0.6
    assert df.dedupe_detections([p02_small, p02_big]) == [p02_big]
    assert df.dedupe_detections([p13_big, p13_small]) == [p13_big]


def test_dedupe_keeps_boxes_at_or_below_threshold_and_preserves_order():
    a = det(0, 0, 100, 100)
    b = det(40, 0, 140, 100)  # IoU = 60*100 / 140*100 = 0.43
    c = det(500, 500, 520, 560)
    out = df.dedupe_detections([c, a, b], 0.6)
    assert out == [c, a, b]


def test_dedupe_tie_breaks_on_confidence_then_first():
    lo, hi = det(0, 0, 10, 10, conf=0.3), det(0, 0, 10, 10, conf=0.9)
    assert df.dedupe_detections([lo, hi]) == [hi]
    first, second = det(0, 0, 10, 10, text="1"), det(0, 0, 10, 10, text="2")
    assert df.dedupe_detections([first, second]) == [first]


def test_dedupe_chain_is_resolved_against_kept_boxes_only():
    big = det(0, 0, 100, 100)
    mid = det(0, 0, 90, 90)      # dup of big (0.81)
    small = det(0, 0, 75, 75)    # dup of mid (0.69) but not of big (0.5625): survives
    assert df.dedupe_detections([small, mid, big]) == [small, big]


def test_dedupe_threshold_one_disables():
    a, b = det(0, 0, 10, 10), det(0, 0, 10, 10)
    assert df.dedupe_detections([a, b], 1.0) == [a, b]


def test_dedupe_does_not_mutate_input():
    items = [det(0, 0, 10, 10), det(0, 0, 10, 10)]
    df.dedupe_detections(items)
    assert len(items) == 2


# --- eng filter -------------------------------------------------------------

def test_drop_labels_removes_only_eng_by_default():
    ja, eng, unk = det(0, 0, 1, 1, "ja"), det(0, 0, 1, 1, "eng"), det(0, 0, 1, 1, "unknown")
    assert df.drop_labels([ja, eng, unk]) == [ja, unk]
    assert df.drop_labels([ja, eng, unk], labels=()) == [ja, eng, unk]


# --- padding ----------------------------------------------------------------

def test_padded_box_grows_every_side():
    assert df.padded_box(det(100, 200, 150, 300), 900, 1280, 12) == (88, 188, 162, 312)


def test_padded_box_clamps_to_image():
    assert df.padded_box(det(3, 5, 895, 1275), 900, 1280, 12) == (0, 0, 900, 1280)


def test_padded_box_zero_pad_is_identity():
    assert df.padded_box(det(10, 20, 30, 40), 900, 1280, 0) == (10, 20, 30, 40)


def test_default_pad_is_the_benchmarked_value():
    assert df.DEFAULT_CROP_PAD_PX == 8
    assert df.DEFAULT_DEDUPE_IOU == 0.6
    assert df.DEFAULT_DROP_LABELS == ("eng",)
