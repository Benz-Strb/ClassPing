"""เทสต์กับโมเดลจริง รันด้วย npm run test:face:model (ครั้งแรกโหลดโมเดลราว 300 MB)

ใช้รูปตัวอย่างที่ติดมากับแพ็กเกจ insightface เท่านั้น
"""

import pytest
from fastapi.testclient import TestClient
from insightface.data import get_image

from app.config import load_settings
from app.engine import InsightFaceEngine
from app.main import create_app
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
def model_client(model_settings, real_engine):
    return TestClient(create_app(model_settings, real_engine), raise_server_exceptions=False)


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
