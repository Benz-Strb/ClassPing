import base64

import numpy as np
import pytest

from tests.conftest import FakeEngine, fake_face
from tests.images import flat_image, jpeg, noise_image


@pytest.fixture
def engine():
    return FakeEngine([fake_face(pose=(1.0, -2.0, 3.0))])


def post(client, auth, body: bytes, filename: str = "face.jpg", mime: str = "image/jpeg"):
    return client.post("/faces/enroll", headers=auth, files={"image": (filename, body, mime)})


def test_enroll_ok_shape(client, auth):
    res = post(client, auth, jpeg(noise_image()))
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data["embedding"]) == 512
    assert abs(np.linalg.norm(data["embedding"]) - 1) < 1e-3
    assert data["bbox"] == [100.0, 100.0, 300.0, 300.0]
    assert data["detScore"] == pytest.approx(0.9)
    assert data["pose"] == {"pitch": 1.0, "yaw": -2.0, "roll": 3.0}
    assert data["sharpness"] > 1000
    assert data["model"] == "buffalo_l"
    assert base64.b64decode(data["crop"])[:3] == b"\xff\xd8\xff"


@pytest.mark.parametrize(
    "bbox",
    [(-10.0, 100.0, 200.0, 300.0), (300.0, 100.0, 490.0, 300.0), (100.0, 300.0, 300.0, 481.0)],
)
def test_enroll_rejects_face_cut_off(client, auth, engine, bbox):
    engine.faces = [fake_face(bbox=bbox)]
    res = post(client, auth, jpeg(noise_image()))
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "FACE_CUT_OFF"


def test_enroll_pose_null_when_missing(client, auth, engine):
    engine.faces = [fake_face(pose=None)]
    res = post(client, auth, jpeg(noise_image()))
    assert res.json()["data"]["pose"] is None


def test_enroll_rejection_is_envelope(client, auth):
    res = post(client, auth, jpeg(flat_image()))
    assert res.status_code == 422
    assert res.json() == {"error": {"code": "BLURRY", "message": res.json()["error"]["message"]}}
    assert res.json()["error"]["message"]


def test_enroll_non_image_upload_400(client, auth):
    res = post(client, auth, b"%PDF-1.4 not an image", "doc.pdf", "application/pdf")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_IMAGE"


def test_enroll_missing_file_400(client, auth):
    res = client.post("/faces/enroll", headers=auth)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "BAD_REQUEST"


def test_enroll_requires_token(client):
    res = client.post(
        "/faces/enroll", files={"image": ("f.jpg", jpeg(noise_image()), "image/jpeg")}
    )
    assert res.status_code == 401


def test_enroll_reads_at_most_limit(client, auth, settings):
    # ไฟล์ใหญ่กว่าเกณฑ์ต้องถูกปฏิเสธโดยไม่ต้องอ่านทั้งไฟล์
    res = post(client, auth, b"x" * (settings.max_image_bytes + 10))
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "IMAGE_TOO_LARGE"
