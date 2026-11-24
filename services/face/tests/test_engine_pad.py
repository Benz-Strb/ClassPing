import sys
import types

import numpy as np
import pytest

from app.config import load_settings
from app.engine import pad_small
from tests.conftest import TOKEN


class FakeFace(dict):
    bbox = np.array([10.0, 20.0, 60.0, 90.0])
    kps = np.array([[20.0, 40.0]] * 5)
    det_score = 0.9
    normed_embedding = np.ones(512, dtype=np.float32) / np.sqrt(512)


@pytest.fixture
def engine(monkeypatch):
    seen = []

    class FaceAnalysis:
        def __init__(self, **kwargs):
            pass

        def prepare(self, ctx_id, det_size):
            pass

        def get(self, image):
            seen.append(image)
            return [FakeFace()]

    module = types.ModuleType("insightface.app")
    module.FaceAnalysis = FaceAnalysis
    monkeypatch.setitem(sys.modules, "insightface.app", module)
    from app.engine import InsightFaceEngine

    settings = load_settings({"FACE_SERVICE_TOKEN": TOKEN, "FACE_DET_SIZE": "960"})
    return InsightFaceEngine(settings), seen


def test_small_image_padded_not_resized(engine):
    eng, seen = engine
    image = np.random.default_rng(0).integers(0, 256, (180, 240, 3), dtype=np.uint8)
    faces = eng.analyze(image)
    (sent,) = seen
    assert sent.shape == (960, 960, 3)
    assert sent.dtype == image.dtype
    assert np.array_equal(sent[:180, :240], image)  # วางมุมซ้ายบน ไม่ย่อ/ขยาย
    assert not sent[180:].any() and not sent[:, 240:].any()
    # พิกัดที่ได้คืนเท่าเดิม ไม่ต้องแปลงกลับ
    assert faces[0].bbox == (10.0, 20.0, 60.0, 90.0)
    assert np.array_equal(faces[0].kps, FakeFace.kps.astype(np.float32))
    # รูปต้นฉบับไม่ถูกแก้
    assert image.shape == (180, 240, 3)


@pytest.mark.parametrize("shape", [(960, 960, 3), (1080, 1920, 3), (720, 960, 3), (960, 300, 3)])
def test_large_image_untouched(engine, shape):
    eng, seen = engine
    image = np.zeros(shape, dtype=np.uint8)
    eng.analyze(image)
    assert seen[0] is image


def test_pad_small_grayscale():
    image = np.full((50, 70), 7, dtype=np.uint8)
    out = pad_small(image, 100)
    assert out.shape == (100, 100)
    assert np.array_equal(out[:50, :70], image)
