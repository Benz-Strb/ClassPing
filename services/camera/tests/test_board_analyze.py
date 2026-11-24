import base64

import cv2
import numpy as np
import pytest

from camera.board import analyze as analyze_module
from camera.board.analyze import AnalyzerSettings, FaceAnalyzer
from tests.board_fakes import face_kps, fake_outputs


class FakeRunner:
    def __init__(self, boxes, det_size=(2560, 1440), has_liveness=True):
        self.boxes = boxes  # กรอบในพิกัดภาพที่ป้อนโมเดล
        self.det_size = det_size
        self.has_liveness = has_liveness
        self.liveness_calls = []
        self.embed_calls = []

    def detect(self, image_rgb):
        w, h = self.det_size
        assert image_rgb.shape == (h, w, 3) and image_rgb.dtype == np.uint8
        return fake_outputs(h, w, [(b, face_kps(b), 0.9) for b in self.boxes])

    def embed(self, faces_rgb):
        assert faces_rgb.shape[1:] == (112, 112, 3)
        self.embed_calls.append(len(faces_rgb))
        return np.tile(np.array([3.0, 4.0] + [0.0] * 510, np.float32), (len(faces_rgb), 1))

    def liveness(self, faces_rgb):
        assert faces_rgb.shape[1:] == (80, 80, 3)
        self.liveness_calls.append(len(faces_rgb))
        return np.full(len(faces_rgb), 0.8, np.float32)


def box(cx, cy, size):
    return (cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2)


def frame(w=2560, h=1440):
    rng = np.random.default_rng(3)
    return rng.integers(0, 256, (h, w, 3), dtype=np.uint8)


def decode_crop(item):
    data = base64.b64decode(item["crop"])
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def analyze(boxes, settings=None, frame_size=(2560, 1440), **kw):
    runner = FakeRunner(boxes, **kw)
    f = frame(*frame_size)
    return FaceAnalyzer(runner, settings or AnalyzerSettings()).analyze(f), runner


def test_result_shape_matches_detect_result():
    b = box(800, 600, 128)
    result, _ = analyze([b])
    assert set(result) == {"width", "height", "skippedSmall", "faces"}
    assert (result["width"], result["height"], result["skippedSmall"]) == (2560, 1440, 0)
    (face,) = result["faces"]
    assert set(face) == {"bbox", "detScore", "embedding", "liveness", "crop"}
    assert np.allclose(face["bbox"], b, atol=1.0)
    assert len(face["embedding"]) == 512
    assert abs(np.linalg.norm(face["embedding"]) - 1) < 1e-5
    assert abs(face["embedding"][0] - 0.6) < 1e-5
    assert abs(face["liveness"] - 0.8) < 1e-6
    assert isinstance(face["crop"], str)


def test_small_faces_counted_as_skipped():
    result, runner = analyze([box(800, 600, 30), box(1500, 600, 80)])
    assert result["skippedSmall"] == 1
    assert len(result["faces"]) == 1
    assert runner.embed_calls == [1]


def test_liveness_only_for_big_faces():
    result, runner = analyze(
        [box(800, 600, 39), box(1500, 600, 80)], AnalyzerSettings(min_face_px=30)
    )
    by_size = sorted(result["faces"], key=lambda f: f["bbox"][2] - f["bbox"][0])
    assert by_size[0]["liveness"] is None
    assert by_size[1]["liveness"] is not None
    assert runner.liveness_calls == [1]


def test_no_liveness_model_gives_none():
    result, runner = analyze([box(800, 600, 80)], has_liveness=False)
    assert result["faces"][0]["liveness"] is None
    assert runner.liveness_calls == []


def test_crop_upscaled_until_face_112px():
    result, _ = analyze([box(800, 600, 22)], AnalyzerSettings(min_face_px=20))
    img = decode_crop(result["faces"][0])
    assert min(img.shape[:2]) >= 112 * 1.6 - 2


def test_big_face_crop_capped_320():
    result, _ = analyze([box(1000, 700, 300)])
    img = decode_crop(result["faces"][0])
    assert max(img.shape[:2]) == 320


def test_more_than_50_faces_keeps_largest_50():
    boxes = [box(100 + (i % 10) * 240, 100 + (i // 10) * 240, 60 + i) for i in range(55)]
    result, runner = analyze(boxes)
    assert len(result["faces"]) == 50
    assert runner.embed_calls == [50]
    sizes = [f["bbox"][2] - f["bbox"][0] for f in result["faces"]]
    assert sizes == sorted(sizes, reverse=True)
    assert min(sizes) >= 60 + 5 - 1


def test_frame_smaller_than_det_size_is_letterboxed():
    # เฟรม 1920x1080 ถูกขยายเป็น 2560x1440 (x1.333) แล้วแปลงกลับ
    b_in_det = box(1600, 800, 160)
    result, _ = analyze([b_in_det], frame_size=(1920, 1080))
    assert (result["width"], result["height"]) == (1920, 1080)
    expected = [v * 0.75 for v in b_in_det]
    assert np.allclose(result["faces"][0]["bbox"], expected, atol=1.0)


class BadEmbedRunner(FakeRunner):
    """embedding หน้าที่ index อยู่ใน bad ถูกแทนด้วยค่าเสีย"""

    def __init__(self, boxes, bad, value, **kw):
        super().__init__(boxes, **kw)
        self.bad, self.value = bad, value

    def embed(self, faces_rgb):
        out = super().embed(faces_rgb)
        for i in self.bad:
            out[i] = self.value
        return out


@pytest.mark.parametrize("value", [float("nan"), float("inf"), 0.0])
def test_bad_embedding_face_is_skipped(value):
    # หน้าใหญ่สุดเรียงก่อน (index 0) ให้เสีย หน้าที่เหลือต้องยังอยู่และ liveness ตรงตัว
    boxes = [box(800, 600, 200), box(1500, 600, 120), box(2000, 600, 80)]
    runner = BadEmbedRunner(boxes, [0], value)
    result = FaceAnalyzer(runner, AnalyzerSettings()).analyze(frame())
    assert len(result["faces"]) == 2
    assert runner.liveness_calls == [2]
    for face in result["faces"]:
        assert abs(np.linalg.norm(face["embedding"]) - 1) < 1e-5
    sizes = [f["bbox"][2] - f["bbox"][0] for f in result["faces"]]
    assert max(sizes) < 150


def test_all_embeddings_bad_gives_no_faces():
    runner = BadEmbedRunner([box(800, 600, 100)], [0], float("nan"))
    result = FaceAnalyzer(runner, AnalyzerSettings()).analyze(frame())
    assert result["faces"] == []
    assert runner.liveness_calls == []


def test_oversized_crop_is_dropped_but_face_kept(monkeypatch):
    monkeypatch.setattr(analyze_module, "MAX_CROP_BYTES", 10)
    result, _ = analyze([box(800, 600, 128)])
    (face,) = result["faces"]
    assert face["crop"] is None
    assert len(face["embedding"]) == 512


def test_normal_crop_within_64kb():
    # ภาพสุ่มบีบอัดไม่ลง เป็นกรณีแย่สุด ต้องไม่เกินที่ API รับ
    result, _ = analyze([box(1000, 700, 300)])
    raw = base64.b64decode(result["faces"][0]["crop"])
    assert len(raw) <= analyze_module.MAX_CROP_BYTES


class NanLivenessRunner(FakeRunner):
    def liveness(self, faces_rgb):
        super().liveness(faces_rgb)
        return np.array([np.nan, np.inf][: len(faces_rgb)], np.float32)


def test_non_finite_liveness_becomes_none():
    runner = NanLivenessRunner([box(800, 600, 200), box(1500, 600, 120)])
    result = FaceAnalyzer(runner, AnalyzerSettings()).analyze(frame())
    assert [f["liveness"] for f in result["faces"]] == [None, None]
    assert len(result["faces"]) == 2


def test_embedding_rounded_to_6_decimals():
    result, _ = analyze([box(800, 600, 128)])
    emb = result["faces"][0]["embedding"]
    assert all(round(v, 6) == v for v in emb)
    assert abs(np.linalg.norm(emb) - 1) < 1e-5
