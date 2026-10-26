"""เทสต์กับโมเดลจริง รันด้วย npm run test:face:model (ครั้งแรกโหลดโมเดลราว 300 MB)

ใช้รูปตัวอย่างที่ติดมากับแพ็กเกจ insightface เท่านั้น
"""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from insightface.data import get_image

from app.config import load_settings
from app.engine import InsightFaceEngine
from app.main import create_app
from app.ocr import PaddleTextReader
from tests.conftest import TOKEN
from tests.images import crop_with_margin, jpeg

pytestmark = pytest.mark.model


@pytest.fixture(scope="session")
def model_settings():
    return load_settings({"FACE_SERVICE_TOKEN": TOKEN})


@pytest.fixture(scope="session")
def real_engine(model_settings):
    return InsightFaceEngine(model_settings)


@pytest.fixture(scope="session")
def group_image():
    return get_image("t1")


@pytest.fixture(scope="session")
def single_image(real_engine, group_image):
    faces = real_engine.analyze(group_image)
    largest = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return crop_with_margin(group_image, largest.bbox)


@pytest.fixture(scope="session")
def real_reader():
    return PaddleTextReader()


@pytest.fixture(scope="session")
def model_client(model_settings, real_engine, real_reader):
    return TestClient(
        create_app(model_settings, real_engine, real_reader), raise_server_exceptions=False
    )


AUTH = {"X-Face-Token": TOKEN}


def test_model_engine_outputs(real_engine, single_image):
    faces = real_engine.analyze(single_image)
    assert len(faces) == 1
    face = faces[0]
    assert face.embedding.shape == (512,)
    assert abs(float((face.embedding**2).sum()) - 1) < 1e-3
    assert face.pose is not None


def test_model_enroll_single_face(model_client, single_image):
    res = model_client.post(
        "/faces/enroll", headers=AUTH, files={"image": ("f.jpg", jpeg(single_image), "image/jpeg")}
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert len(data["embedding"]) == 512
    assert data["pose"] is not None


def test_model_enroll_group_rejected(model_client, group_image):
    res = model_client.post(
        "/faces/enroll", headers=AUTH, files={"image": ("g.jpg", jpeg(group_image), "image/jpeg")}
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "MULTIPLE_FACES"


def test_model_detect_group(model_client, group_image):
    res = model_client.post(
        "/faces/detect", headers=AUTH, files={"image": ("g.jpg", jpeg(group_image), "image/jpeg")}
    )
    assert res.status_code == 200, res.text
    faces = res.json()["data"]["faces"]
    assert len(faces) >= 5
    assert all(len(face["embedding"]) == 512 for face in faces)


def test_model_same_person_scores_high(real_engine, single_image):
    import cv2
    import numpy as np

    from app.matching import match

    [original] = real_engine.analyze(single_image)
    [flipped] = real_engine.analyze(cv2.flip(single_image, 1))
    [result] = match(np.array([flipped.embedding]), [("me", np.array([original.embedding]))])
    assert result.score > 0.6


def test_model_strangers_score_low(real_engine, single_image, group_image):
    import numpy as np

    from app.matching import match

    [me] = real_engine.analyze(single_image)
    others = [
        face
        for face in real_engine.analyze(group_image)
        if float(np.dot(face.embedding, me.embedding)) < 0.9  # ตัดหน้าตัวเองในรูปหมู่ออก
    ]
    assert len(others) >= 4
    for face in others:
        [result] = match(np.array([face.embedding]), [("me", np.array([me.embedding]))])
        assert result.score < 0.35


def test_rapid_reader_reads_card_text(real_reader):
    """ตัวหนังสือแบบบนบัตรนักศึกษาออนไลน์ วาดขึ้นเอง ไม่ใช่บัตรจริง"""
    image = np.full((360, 900, 3), 230, dtype=np.uint8)
    cv2.putText(image, "66112106", (40, 110), cv2.FONT_HERSHEY_SIMPLEX, 2.5, (120, 40, 120), 5)
    cv2.putText(
        image,
        "System Generate Date : 23-10-2569",
        (40, 250),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.2,
        (60, 60, 60),
        2,
    )
    texts = " | ".join(text for text, _ in real_reader.read(image))
    assert "66112106" in texts
    assert "23-10-2569" in texts
