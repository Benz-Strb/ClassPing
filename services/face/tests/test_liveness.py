import pytest
from fastapi.testclient import TestClient

from app.config import load_settings
from app.main import create_app
from tests.conftest import TOKEN, FakeLiveness, fake_face
from tests.images import jpeg, noise_image


def post(client, auth, size: int = 500):
    return client.post(
        "/faces/detect",
        headers=auth,
        files={"image": ("f.jpg", jpeg(noise_image(size=size)), "image/jpeg")},
    )


def client_with(settings, engine, liveness):
    return TestClient(create_app(settings, engine, liveness=liveness))


def test_detect_liveness_off_is_null(client, auth, engine):
    engine.faces = [fake_face(bbox=(100.0, 100.0, 300.0, 300.0))]
    faces = post(client, auth).json()["data"]["faces"]
    assert [f["liveness"] for f in faces] == [None]


def test_detect_liveness_scores_big_faces(auth, engine):
    settings = load_settings({"FACE_SERVICE_TOKEN": TOKEN, "LIVENESS_MIN_FACE_PX": "100"})
    big = fake_face(bbox=(100.0, 100.0, 300.0, 300.0), seed=1)  # 200 px
    small = fake_face(bbox=(10.0, 10.0, 50.0, 50.0), seed=2)  # 40 px < 100
    engine.faces = [small, big]
    client = client_with(settings, engine, FakeLiveness(0.8))
    faces = post(client, auth).json()["data"]["faces"]
    assert [f["bbox"] for f in faces] == [list(big.bbox), list(small.bbox)]
    assert [f["liveness"] for f in faces] == [0.8, None]


def test_liveness_gets_full_frame(settings, auth, engine):
    engine.faces = [fake_face(bbox=(100.0, 100.0, 300.0, 300.0))]
    fake = FakeLiveness()
    post(client_with(settings, engine, fake), auth, size=500)
    assert fake.shapes == [(500, 500, 3)]


def test_liveness_none_score_is_null(settings, auth, engine):
    engine.faces = [fake_face()]
    client = client_with(settings, engine, FakeLiveness(None))
    assert post(client, auth).json()["data"]["faces"][0]["liveness"] is None


def test_health_reports_liveness(settings, engine, client):
    assert client.get("/health").json()["data"]["liveness"] is None
    on = client_with(settings, engine, FakeLiveness())
    assert on.get("/health").json()["data"]["liveness"] == "fake-liveness"


def test_settings_liveness_model_missing_file():
    with pytest.raises(ValueError, match="/no/such.onnx"):
        load_settings({"FACE_SERVICE_TOKEN": TOKEN, "LIVENESS_MODEL": "/no/such.onnx"})


def test_settings_liveness_defaults():
    settings = load_settings({"FACE_SERVICE_TOKEN": TOKEN})
    assert settings.liveness_model == ""
    assert settings.liveness_min_face_px == 40
